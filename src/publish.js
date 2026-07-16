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

export function initPublish({ editor, api, sidebar, tokenStore, showMessage }) {
  const publishButton = document.getElementById('publish-btn');
  const modal = document.getElementById('publish-modal');
  const password = document.getElementById('publish-password');
  const projectContainer = document.getElementById('project-container');
  const addProjectButton = document.getElementById('add-project-btn');
  const newProjectContainer = document.getElementById('new-project-container');
  const newProjectName = document.getElementById('new-project-name');
  const newProjectSummary = document.getElementById('new-project-summary');
  const encryptionSwitch = document.getElementById('encryption-switch');
  const fileName = document.getElementById('file-name-input');
  const cancel = document.getElementById('modal-cancel');
  const confirm = document.getElementById('modal-confirm');
  const extensionLabel = document.getElementById('publish-ext-label');
  let folders = [];
  let selectedFolder = null;
  let selectedProjectKey = null;
  let isNewProjectMode = false;

  function toPublishFolder(item) {
    return {
      name: item.publishName || item.name,
      summary: item.summary || item.name,
      key: item.key || `${item.projectScope || '1'}:${item.name}`,
      projectScope: item.projectScope || '1'
    };
  }

  function renderProjectButtons(limit = 10) {
    projectContainer.replaceChildren();
    const visibleFolders = limit ? folders.slice(0, limit) : folders;
    visibleFolders.forEach((folder) => {
      const button = document.createElement('button');
      button.className = `px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:border-blue-400 transition-all ${
        selectedProjectKey === folder.key && !isNewProjectMode ? 'folder-btn-active' : ''
      }`;
      button.textContent = folder.summary;
      button.addEventListener('click', () => {
        selectedFolder = folder.name;
        selectedProjectKey = folder.key;
        isNewProjectMode = false;
        newProjectContainer.classList.add('hidden');
        renderProjectButtons(limit);
      });
      projectContainer.appendChild(button);
    });

    if (limit && folders.length > limit) {
      const moreButton = document.createElement('button');
      moreButton.className = 'px-3 py-1.5 text-sm border-gray-300 text-blue-600 rounded-md bg-white hover:border-blue-400 transition-all';
      moreButton.textContent = '查看更多';
      moreButton.addEventListener('click', (event) => {
        event.preventDefault();
        renderProjectButtons(null);
      });
      projectContainer.appendChild(moreButton);
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
      renderProjectButtons(10);
    } catch (error) {
      loading.className = 'text-sm text-red-500';
      loading.textContent = error.message || '无法连接到 GitHub';
    }
  }

  function open() {
    const content = editor.getContent();
    if (!content.trim()) return showMessage('不能为空', true);
    extensionLabel.textContent = getExtension(detectType(content));
    modal.classList.replace('hidden', 'flex');
    tokenStore.updateStatus();
    password.value = '';
    fetchFolders();
    setTimeout(() => password.focus(), 100);
  }

  function close() {
    modal.classList.replace('flex', 'hidden');
    fileName.value = '';
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

  async function submit() {
    const { month, day } = getShanghaiDateParts();
    const inputPassword = password.value.trim();
    const publishScope = inputPassword === day + day ? '1' : inputPassword === `${month}${day}` ? '2' : null;
    if (!publishScope) return showMessage('密码错误', true);

    const token = tokenStore.get();
    if (!token) return showMessage('请先设置发布凭据', true);
    const folderName = isNewProjectMode ? newProjectName.value.trim() : selectedFolder;
    const selectedMeta = folders.find((folder) => folder.key === selectedProjectKey);
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
      if (isNewProjectMode && newProjectSummary.value.trim()) {
        const summaryPath = `${folder}/_summary.txt`;
        const summaryResponse = await putFile(
          summaryPath,
          newProjectSummary.value.trim(),
          token,
          `add summary for ${folder}`
        );
        if (!summaryResponse.ok) throw new Error('项目名称保存失败');
      }

      const getResponse = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(config.branch)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sha = getResponse.ok ? (await getResponse.json()).sha : null;
      const putResponse = await putFile(path, rawContent, token, `deploy: ${path}`, sha);
      if (!putResponse.ok) throw new Error('推送失败，请检查仓库权限');

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

  publishButton.addEventListener('click', open);
  cancel.addEventListener('click', close);
  confirm.addEventListener('click', submit);
  addProjectButton.addEventListener('click', () => {
    isNewProjectMode = true;
    selectedFolder = null;
    selectedProjectKey = null;
    newProjectContainer.classList.remove('hidden');
    newProjectSummary.value = '';
    renderProjectButtons(10);
    newProjectName.focus();
  });

  return {
    refreshIfOpen() {
      if (!modal.classList.contains('hidden')) fetchFolders();
    }
  };
}
