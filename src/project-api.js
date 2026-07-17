import { config, encodeGitHubPath, secondaryRootFolder } from './config.js';

const hiddenProjectDirectories = new Set(['temp', '.github', 'share']);
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

function normalizeProjectMetadata(value, fallbackSummary) {
  if (!value || typeof value !== 'object') {
    return { summary: fallbackSummary, id: '' };
  }
  return {
    summary: typeof value.summary === 'string' && value.summary.trim() ? value.summary.trim() : fallbackSummary,
    id: typeof value.id === 'string' || typeof value.id === 'number' ? String(value.id).trim() : ''
  };
}

export function createProjectApi(getToken) {
  let publicManifest = null;

  async function fetchPublicProjectManifest() {
    if (publicManifest) return publicManifest;
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
      return { summary: summary || path.split('/').pop(), id: '' };
    } catch {
      return null;
    }
  }

  async function addProjectItemDetails(items) {
    const detailedItems = await Promise.all(
      items.map(async (item) => {
        const date = item.date || (await fetchPathCommitDate(item.path));
        let summary = item.summary || item.name;
        let id = item.id ? String(item.id).trim() : '';
        if (item.type === 'dir' && (!item.summary || !id)) {
          const metadata = await fetchFolderMetadata(item.path);
          if (metadata) {
            summary = metadata.summary || summary;
            id = metadata.id || id;
          }
        }
        return {
          ...item,
          key: item.key || `${item.projectScope || '1'}:${item.name}`,
          publishName: item.publishName || item.name,
          date: date || '1970-01-01T00:00:00Z',
          summary,
          id
        };
      })
    );
    return detailedItems.sort((left, right) => new Date(right.date) - new Date(left.date));
  }

  async function fetchRootProjectItems(scope = 'all') {
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

    return addProjectItemDetails(items);
  }

  function isVisibleSidebarItem(item) {
    if (item.name === '_summary.txt' || item.name === '_summary.json' || item.name === '.DS_Store') return false;
    if (item.type === 'dir') return !hiddenSidebarDirectories.has(item.name);
    return item.type === 'file' && !hiddenSidebarExtensions.has(getFileExtension(item.name));
  }

  return {
    addProjectItemDetails,
    fetchGithubContents,
    fetchRootProjectItems,
    isVisibleSidebarItem,
    reset() {
      publicManifest = null;
    }
  };
}
