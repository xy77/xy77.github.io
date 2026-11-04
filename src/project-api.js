import { config, encodeGitHubPath, secondaryRootFolder } from './config.js';

const draftFolderName = 'draft';
const draftIndexName = '_index.json';
const hiddenProjectDirectories = new Set(['temp', '.github', 'share', draftFolderName]);
const hiddenSidebarDirectories = new Set(['.github', 'share']);
const hiddenSidebarExtensions = new Set(['webp', 'png', 'jpg', 'jpeg', 'bmp', 'heic', 'gif']);

function getFileExtension(name) {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

function isVisibleProjectDirectory(item) {
  return item.type === 'dir' && !hiddenProjectDirectories.has(item.name);
}

function decodeGitHubText(content) {
  const binary = atob(String(content || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 0;
}

function parseShanghaiDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`);
}

function normalizeDraftRecords(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.files)) return [];
  return value.files
    .filter((item) => item && typeof item.file === 'string' && item.file.trim())
    .map((item) => ({
      file: item.file.trim(),
      date: typeof item.date === 'string' ? item.date : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      expiresAt: typeof item.expiresAt === 'string' ? item.expiresAt : ''
    }));
}

function isDraftRecordVisible(record) {
  const expiresAt = parseShanghaiDateTime(record.expiresAt);
  return Boolean(expiresAt && expiresAt.getTime() > Date.now());
}

function normalizeProjectMetadata(value, fallbackSummary) {
  if (!value || typeof value !== 'object') {
    return { summary: fallbackSummary, id: '', order: 0 };
  }
  return {
    summary: typeof value.summary === 'string' && value.summary.trim() ? value.summary.trim() : fallbackSummary,
    id: typeof value.id === 'string' || typeof value.id === 'number' ? String(value.id).trim() : '',
    order: normalizeOrder(value.order)
  };
}

export function createProjectApi(getToken) {
  let publicManifest = null;

  async function fetchPublicProjectManifest(refresh = false) {
    if (!refresh && publicManifest) return publicManifest;
    const response = await fetch(`${config.publicBaseUrl}/${config.projectManifest}?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error('请先设置发布凭据，或等待公开项目索引部署完成');
    }
    publicManifest = await response.json();
    return publicManifest;
  }

  async function fetchPublicManifestContents(path) {
    const manifest = await fetchPublicProjectManifest();
    const items = manifest.tree?.[path || ''] || [];
    return items.map((item) => ({ ...item }));
  }

  async function fetchPublicDraftItems() {
    const manifest = await fetchPublicProjectManifest(true);
    return normalizeDraftRecords({ files: manifest.drafts || [] })
      .filter(isDraftRecordVisible)
      .map((record) => ({
        type: 'file',
        name: record.file,
        path: `${draftFolderName}/${record.file}`,
        date: record.date || parseShanghaiDateTime(record.createdAt)?.toISOString() || '1970-01-01T00:00:00Z',
        summary: record.file,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt
      }));
  }

  async function fetchGithubContents(path) {
    const token = getToken();
    if (!token) return fetchPublicManifestContents(path);
    const encodedPath = encodeGitHubPath(path);
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}&t=${Date.now()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error('读取目录失败');
    return response.json();
  }

  async function fetchPathCommitDate(path) {
    const token = getToken();
    if (!token) return null;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data[0]?.commit?.committer?.date || null;
    } catch {
      return null;
    }
  }

  async function fetchGithubDraftItems() {
    const token = getToken();
    if (!token) return fetchPublicDraftItems();

    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(`${draftFolderName}/${draftIndexName}`)}?ref=${encodeURIComponent(config.branch)}&t=${Date.now()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.status === 404) return [];
    if (!response.ok) throw new Error('读取临时文件索引失败');
    const indexFile = await response.json();
    const records = normalizeDraftRecords(JSON.parse(decodeGitHubText(indexFile.content))).filter(isDraftRecordVisible);
    if (!records.length) return [];

    const directoryResponse = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(draftFolderName)}?ref=${encodeURIComponent(config.branch)}&t=${Date.now()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!directoryResponse.ok) throw new Error('读取临时文件目录失败');
    const directoryItems = await directoryResponse.json();
    const directoryNames = new Set(directoryItems.filter((item) => item.type === 'file').map((item) => item.name));

    return Promise.all(
      records
        .filter((record) => directoryNames.has(record.file))
        .map(async (record) => {
          const path = `${draftFolderName}/${record.file}`;
          const date = await fetchPathCommitDate(path);
          return {
            type: 'file',
            name: record.file,
            path,
            date: date || parseShanghaiDateTime(record.createdAt)?.toISOString() || '1970-01-01T00:00:00Z',
            summary: record.file,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt
          };
        })
    );
  }

  async function fetchDraftItems() {
    const items = await fetchGithubDraftItems();
    return items.sort((left, right) => new Date(right.date) - new Date(left.date));
  }

  async function fetchFolderMetadata(path) {
    const token = getToken();
    if (!token) return null;
    try {
      const metadataPath = encodeGitHubPath(`${path}/_summary.json`);
      const metadataResponse = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${metadataPath}?ref=${encodeURIComponent(config.branch)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (metadataResponse.ok) {
        const data = await metadataResponse.json();
        return normalizeProjectMetadata(JSON.parse(decodeGitHubText(data.content)), path.split('/').pop());
      }

      const summaryPath = encodeGitHubPath(`${path}/_summary.txt`);
      const summaryResponse = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${summaryPath}?ref=${encodeURIComponent(config.branch)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!summaryResponse.ok) return null;
      const data = await summaryResponse.json();
      const summary = data.content ? decodeGitHubText(data.content).trim() : '';
      return { summary: summary || path.split('/').pop(), id: '', order: 0 };
    } catch {
      return null;
    }
  }

  async function addProjectItemDetails(items, sortByOrder = false) {
    const detailedItems = await Promise.all(
      items.map(async (item) => {
        const date = item.date || (await fetchPathCommitDate(item.path));
        let summary = item.summary || item.name;
        let id = item.id ? String(item.id).trim() : '';
        let order = normalizeOrder(item.order);
        if (item.type === 'dir' && (!item.summary || !id || !order)) {
          const metadata = await fetchFolderMetadata(item.path);
          if (metadata) {
            summary = metadata.summary || summary;
            id = metadata.id || id;
            order = metadata.order;
          }
        }
        return {
          ...item,
          key: item.key || `${item.projectScope || '1'}:${item.name}`,
          publishName: item.publishName || item.name,
          date: date || '1970-01-01T00:00:00Z',
          summary,
          id,
          order
        };
      })
    );
    return detailedItems.sort((left, right) => {
      if (sortByOrder) {
        const orderDiff = right.order - left.order;
        if (orderDiff) return orderDiff;
      }
      const dateDiff = new Date(right.date) - new Date(left.date);
      if (dateDiff) return dateDiff;
      return left.name.localeCompare(right.name, 'zh-CN');
    });
  }

  async function fetchRootProjectItems(scope = 'all') {
    if (scope === draftFolderName) return fetchDraftItems();
    const rootData = await fetchGithubContents('');
    let items = [];

    if (scope !== '2') {
      items = items.concat(
        rootData
          .filter((item) => isVisibleProjectDirectory(item) && item.name !== secondaryRootFolder)
          .map((item) => ({
            ...item,
            projectScope: '1',
            publishName: item.name,
            key: `1:${item.name}`
          }))
      );
    }

    if (scope !== '1') {
      const secondRoot = rootData.find(
        (item) => item.type === 'dir' && item.name === secondaryRootFolder
      );
      if (secondRoot) {
        const secondData = await fetchGithubContents(secondaryRootFolder);
        items = items.concat(
          secondData.filter(isVisibleProjectDirectory).map((item) => ({
            ...item,
            projectScope: '2',
            publishName: item.name,
            key: `2:${item.name}`,
            parentPathOverride: ''
          }))
        );
      }
    }

    return addProjectItemDetails(items, true);
  }

  function isVisibleSidebarItem(item) {
    if (item.name === '_summary.txt' || item.name === '_summary.json' || item.name === draftIndexName || item.name === '.DS_Store') return false;
    if (item.type === 'dir') return !hiddenSidebarDirectories.has(item.name);
    return item.type === 'file' && !hiddenSidebarExtensions.has(getFileExtension(item.name));
  }

  return {
    addProjectItemDetails,
    fetchDraftItems,
    fetchGithubContents,
    fetchRootProjectItems,
    isVisibleSidebarItem,
    reset() {
      publicManifest = null;
    }
  };
}
