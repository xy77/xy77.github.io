import { config, encodeGitHubPath, secondaryRootFolder } from './config.js';
import { detectType } from './editor.js';

function getExtension(type) {
  if (type === 'markdown') return '.md';
  if (type === 'json') return '.json';
  return '.html';
}

function encodeContent(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function decodeContent(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : 0;
}

const draftFolderName = 'draft';
const draftIndexName = '_index.json';
const draftDurationOptions = new Map([
  [60, '1 小时'],
  [1440, '24 小时'],
  [4320, '72 小时']
]);

function parseProjectMetadata(value, fallbackSummary) {
  if (!value || typeof value !== 'object') {
    return { summary: fallbackSummary, id: '', order: 0 };
  }
  return {
    summary: typeof value.summary === 'string' && value.summary.trim() ? value.summary.trim() : fallbackSummary,
    id: typeof value.id === 'string' || typeof value.id === 'number' ? String(value.id).trim() : '',
    order: normalizeOrder(value.order)
  };
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

function getShanghaiDateParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(new Date());
  return {
    month: parts.find((part) => part.type === 'month').value,
    day: parts.find((part) => part.type === 'day').value
  };
}

function formatShanghaiDateTime(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour') === '24' ? '00' : value('hour')}:${value('minute')}:${value('second')}`;
}

function getShanghaiCompactTimestamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const value = (type, length = 2) => (parts.find((part) => part.type === type)?.value || '').padStart(length, '0');
  return `${value('year')}${value('month')}${value('day')}${value('hour') === '24' ? '00' : value('hour')}${value('minute')}${value('second')}`;
}

function extractDraftTitle(html) {
  try {
    return new DOMParser().parseFromString(html, 'text/html').title.trim();
  } catch {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match ? match[1].replace(/<[^>]*>/g, '').trim() : '';
  }
}

function normalizeDraftFileBaseName(value) {
  const normalized = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.html$/i, '')
    .replace(/^\.+|\.+$/g, '');
  return normalized || getShanghaiCompactTimestamp();
}

function getDraftFileName(content, existingNames) {
  const baseName = normalizeDraftFileBaseName(extractDraftTitle(content));
  let fileName = `${baseName}.html`;
  let suffix = 0;
  while (existingNames.has(fileName)) {
    suffix += 1;
    fileName = `${baseName}-${suffix}.html`;
  }
  return fileName;
}

export function initPublish({ editor, api, sidebar, tokenStore, showMessage }) {
  const publishButton = document.getElementById('publish-btn');
  const modal = document.getElementById('publish-modal');
  const password = document.getElementById('publish-password');
  const temporarySwitch = document.getElementById('temporary-file-switch');
  const standardFields = document.getElementById('publish-standard-fields');
  const draftFields = document.getElementById('publish-draft-fields');
  const durationButtons = Array.from(document.querySelectorAll('.draft-duration-btn'));
  const projectContainer = document.getElementById('project-container');
  const addProjectButton = document.getElementById('add-project-btn');
  const newProjectContainer = document.getElementById('new-project-container');
  const newProjectName = document.getElementById('new-project-name');
  const newProjectSummary = document.getElementById('new-project-summary');
  const encryptionSwitch = document.getElementById('encryption-switch');
  const projectId = document.getElementById('project-id-input');
  const fileName = document.getElementById('file-name-input');
  const cancel = document.getElementById('modal-cancel');
  const confirm = document.getElementById('modal-confirm');
  const extensionLabel = document.getElementById('publish-ext-label');
  let folders = [];
  let selectedFolder = null;
  let selectedProjectKey = null;
  let isNewProjectMode = false;
  let projectButtonsExpanded = false;
  let selectedDraftDuration = 60;
  let isSubmitting = false;

  function toPublishFolder(item) {
    return {
      name: item.publishName || item.name,
      summary: item.summary || item.name,
      id: item.id ? String(item.id) : '',
      order: normalizeOrder(item.order),
      key: item.key || `${item.projectScope || '1'}:${item.name}`,
      projectScope: item.projectScope || '1'
    };
  }

  function getProjectButtonRowCount() {
    return new Set(Array.from(projectContainer.children, (button) => button.offsetTop)).size;
  }

  function renderProjectButtons(showAll = projectButtonsExpanded) {
    projectContainer.replaceChildren();
    const folderButtons = folders.map((folder) => {
      const button = document.createElement('button');
      button.className = `px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:border-blue-400 transition-all ${
        selectedProjectKey === folder.key && !isNewProjectMode ? 'folder-btn-active' : ''
      }`;
      button.textContent = folder.summary;
      button.addEventListener('click', () => {
        selectedFolder = folder.name;
        selectedProjectKey = folder.key;
        isNewProjectMode = false;
        projectId.value = folder.id;
        newProjectContainer.classList.add('hidden');
        renderProjectButtons();
      });
      return button;
    });
    projectContainer.append(...folderButtons);

    if (!showAll && getProjectButtonRowCount() > 3) {
      const moreButton = document.createElement('button');
      moreButton.className = 'px-3 py-1.5 text-sm border border-gray-300 text-blue-600 rounded-md bg-white hover:border-blue-400 transition-all';
      moreButton.textContent = '查看更多';
      moreButton.addEventListener('click', (event) => {
        event.preventDefault();
        projectButtonsExpanded = true;
        renderProjectButtons(true);
      });
      projectContainer.appendChild(moreButton);

      while (getProjectButtonRowCount() > 3 && folderButtons.length) {
        folderButtons.pop().remove();
      }
    }
  }

  async function fetchFolders() {
    projectContainer.replaceChildren();
    const loading = document.createElement('span');
    loading.className = 'text-sm text-gray-400';
    loading.textContent = '正在获取项目详情...';
    projectContainer.appendChild(loading);

    try {
      const items = sidebar.getCachedRootItems('all') || (await api.fetchRootProjectItems('all'));
      folders = items.map(toPublishFolder);
      projectButtonsExpanded = false;
      renderProjectButtons();
    } catch (error) {
      loading.className = 'text-sm text-red-500';
      loading.textContent = error.message || '无法连接到 GitHub';
    }
  }

  function renderPublishMode() {
    standardFields.hidden = temporarySwitch.checked;
    draftFields.hidden = !temporarySwitch.checked;
    draftFields.classList.remove('hidden');
  }

  function renderDraftDuration() {
    durationButtons.forEach((button) => {
      button.classList.toggle('draft-duration-btn-active', Number(button.dataset.duration) === selectedDraftDuration);
    });
  }

  function open() {
    if (!tokenStore.get()) return showMessage('发布凭据未设置', true);
    const content = editor.getContent();
    if (!content.trim()) return showMessage('不能为空', true);
    temporarySwitch.checked = false;
    selectedDraftDuration = 60;
    renderDraftDuration();
    renderPublishMode();
    extensionLabel.textContent = getExtension(detectType(content));
    modal.classList.replace('hidden', 'flex');
    tokenStore.updateStatus();
    password.value = '';
    projectId.value = '';
    fetchFolders();
    setTimeout(() => password.focus(), 100);
  }

  function close() {
    modal.classList.replace('flex', 'hidden');
    fileName.value = '';
    projectId.value = '';
  }

  async function putFile(path, content, token, message, sha = null) {
    const body = { message, content: encodeContent(content), branch: config.branch };
    if (sha) body.sha = sha;
    return fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(path)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
  }

  async function getFile(path, token) {
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(config.branch)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('读取项目资料失败');
    return response.json();
  }

  async function readProjectMetadata(folder, token, fallbackSummary) {
    const metadataFile = await getFile(`${folder}/_summary.json`, token);
    if (metadataFile) {
      try {
        return parseProjectMetadata(JSON.parse(decodeContent(metadataFile.content)), fallbackSummary);
      } catch {
        throw new Error('项目资料格式错误，无法更新 ID');
      }
    }

    const legacySummaryFile = await getFile(`${folder}/_summary.txt`, token);
    if (!legacySummaryFile) return { summary: fallbackSummary, id: '', order: 0 };
    const summary = decodeContent(legacySummaryFile.content).trim();
    return { summary: summary || fallbackSummary, id: '', order: 0 };
  }

  async function saveProjectMetadata(folder, metadata, token) {
    const metadataPath = `${folder}/_summary.json`;
    const existingFile = await getFile(metadataPath, token);
    const payload = { summary: metadata.summary };
    if (metadata.id) payload.id = metadata.id;
    payload.order = normalizeOrder(metadata.order);
    const response = await putFile(
      metadataPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      token,
      `update project metadata for ${folder}`,
      existingFile?.sha
    );
    if (!response.ok) throw new Error('项目资料保存失败');
  }

  async function readDraftState(token) {
    const [directoryFile, indexFile] = await Promise.all([
      getFile(draftFolderName, token),
      getFile(`${draftFolderName}/${draftIndexName}`, token)
    ]);
    const directoryItems = Array.isArray(directoryFile) ? directoryFile : [];
    const existingNames = new Set(
      directoryItems.filter((item) => item.type === 'file').map((item) => item.name)
    );
    let records = [];
    if (indexFile) {
      try {
        const value = JSON.parse(decodeContent(indexFile.content));
        records = Array.isArray(value?.files)
          ? value.files.filter((item) => item && typeof item.file === 'string' && item.file.trim())
          : [];
      } catch {
        throw new Error('临时文件索引格式错误');
      }
    }
    return { existingNames, records, indexSha: indexFile?.sha || null };
  }

  async function submitDraft(token) {
    if (isSubmitting) return;
    const rawContent = editor.getFormattedCode();
    if (!rawContent.trim()) return showMessage('不能为空', true);
    if (!draftDurationOptions.has(selectedDraftDuration)) return showMessage('请选择有效期', true);

    const draftState = await readDraftState(token);
    const fileName = getDraftFileName(rawContent, draftState.existingNames);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + selectedDraftDuration * 60 * 1000);
    const record = {
      file: fileName,
      createdAt: formatShanghaiDateTime(now),
      expiresAt: formatShanghaiDateTime(expiresAt)
    };
    const path = `${draftFolderName}/${fileName}`;

    close();
    publishButton.disabled = true;
    showMessage('正在推送临时文件...');

    const fileResponse = await putFile(path, rawContent, token, `deploy temporary file: ${path}`);
    if (!fileResponse.ok) throw new Error('临时文件推送失败，请检查仓库权限');

    const nextRecords = [...draftState.records, record];
    const indexResponse = await putFile(
      `${draftFolderName}/${draftIndexName}`,
      `${JSON.stringify({ files: nextRecords }, null, 2)}\n`,
      token,
      'update temporary file index',
      draftState.indexSha
    );
    if (!indexResponse.ok) throw new Error('临时文件索引更新失败');

    api.reset();
    sidebar.reset();
    const url = `${config.publicBaseUrl}/${path}`;
    await copyText(url);
    showMessage(`发布成功！已复制链接：${url}`);
  }

  async function submit() {
    if (isSubmitting) return;
    const token = tokenStore.get();
    if (!token) return showMessage('发布凭据未设置', true);
    if (temporarySwitch.checked) {
      try {
        isSubmitting = true;
        confirm.disabled = true;
        await submitDraft(token);
      } catch (error) {
        showMessage(error.message || '临时文件发布失败', true);
      } finally {
        isSubmitting = false;
        confirm.disabled = false;
        publishButton.disabled = false;
        fileName.value = '';
      }
      return;
    }

    const { month, day } = getShanghaiDateParts();
    const inputPassword = password.value.trim();
    const publishScope = inputPassword === day + day ? '1' : inputPassword === `${month}${day}` ? '2' : null;
    if (!publishScope) return showMessage('密码错误', true);

    const folderName = isNewProjectMode ? newProjectName.value.trim() : selectedFolder;
    const selectedMeta = folders.find((folder) => folder.key === selectedProjectKey);
    const enteredProjectId = projectId.value.trim();
    const safeFileName = fileName.value.trim().replace(/[^a-zA-Z0-9.+\-]/g, '');
    if (!folderName || !safeFileName) return showMessage('请确保目录名和文件名完整', true);
    if (isNewProjectMode && !/^[a-zA-Z0-9._+\-]+$/.test(folderName)) {
      return showMessage('新增项目目录仅支持字母、数字、点、加号、减号和下划线', true);
    }
    if (!isNewProjectMode && selectedMeta && selectedMeta.projectScope !== publishScope) {
      return showMessage('密码与项目不匹配，请重新选择项目', true);
    }

    const folder = publishScope === '2' ? `${secondaryRootFolder}/${folderName}` : folderName;
    const content = editor.getContent();
    const type = detectType(content);
    const extension = getExtension(type);
    let rawContent = ['markdown', 'json'].includes(type) ? content : editor.getFormattedCode();

    if (!['markdown', 'json'].includes(type) && rawContent.includes('<title>')) {
      const assetPrefix = publishScope === '2' ? '../../' : '../';
      let injected = `\n\t<link rel="icon" href="${assetPrefix}ico.svg" type="image/svg+xml">`;
      if (encryptionSwitch.checked) {
        injected += `\n<!-- 引入权限验证逻辑 -->\n\t<script src="${assetPrefix}auth.js"><\/script>\n\t<script>\n\t\tif (typeof checkAuth === 'function') checkAuth();\n\t<\/script>`;
      }
      rawContent = rawContent.replace(/(<title>.*?<\/title>)/i, `$1${injected}`);
    }

    const path = `${folder}/${safeFileName}${extension}`;
    close();
    publishButton.disabled = true;
    showMessage('正在推送...');

    try {
      const existingMetadata = await readProjectMetadata(
        folder,
        token,
        selectedMeta?.summary || folderName
      );
      const projectSummary = isNewProjectMode
        ? newProjectSummary.value.trim() || folderName
        : existingMetadata.summary || selectedMeta?.summary || folderName;
      const nextOrder = Math.max(0, ...folders.map((item) => normalizeOrder(item.order))) + 10;
      await saveProjectMetadata(
        folder,
        { summary: projectSummary, id: enteredProjectId, order: nextOrder },
        token
      );

      const getResponse = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(config.branch)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sha = getResponse.ok ? (await getResponse.json()).sha : null;
      const putResponse = await putFile(path, rawContent, token, `deploy: ${path}`, sha);
      if (!putResponse.ok) throw new Error('推送失败，请检查仓库权限');

      api.reset();
      sidebar.reset();
      const url = `${config.publicBaseUrl}/${path}`;
      await copyText(url);
      showMessage(`发布成功！已复制链接：${url}`);
      fileName.value = '';
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      publishButton.disabled = false;
      fileName.value = '';
    }
  }

  temporarySwitch.addEventListener('change', renderPublishMode);
  durationButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedDraftDuration = Number(button.dataset.duration);
      renderDraftDuration();
    });
  });

  publishButton.addEventListener('click', open);
  cancel.addEventListener('click', close);
  confirm.addEventListener('click', submit);
  addProjectButton.addEventListener('click', () => {
    isNewProjectMode = true;
    selectedFolder = null;
    selectedProjectKey = null;
    projectId.value = '';
    newProjectContainer.classList.remove('hidden');
    newProjectSummary.value = '';
    renderProjectButtons();
    newProjectName.focus();
  });

  return {
    refreshIfOpen() {
      if (!modal.classList.contains('hidden')) fetchFolders();
    }
  };
}
