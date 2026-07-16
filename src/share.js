import { config, encodeGitHubPath } from './config.js';

const shareHash = '#s';
const shareDirectory = 'share';
const shareIdBytes = 12;
const shareKeyBytes = 32;
const pagesPollAttempts = 90;
const pagesPollDelayMs = 2000;

function isShareLocation() {
  const hash = window.location.hash;
  return hash === shareHash || hash.startsWith(`${shareHash}?`) || hash.startsWith(`${shareHash}&`);
}

function getShareParamsFromLocation() {
  if (!isShareLocation()) return null;
  const query = window.location.hash.slice(shareHash.length).replace(/^[?&]/, '');
  const params = new URLSearchParams(query);
  const id = params.get('id') || '';
  const ref = params.get('ref') || '';
  const key = params.get('k') || '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || !/^[0-9a-f]{40}$/i.test(ref) || !/^[A-Za-z0-9_-]{32,96}$/.test(key)) {
    throw new Error('分享链接参数无效');
  }
  return { id, ref, key };
}

function getShareFilePath(id) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new Error('分享 ID 无效');
  return `${shareDirectory}/${id}.json`;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
}

function createRandomToken(length) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

async function importShareKey(text, usages) {
  const bytes = base64UrlToBytes(text);
  if (bytes.length !== shareKeyBytes) throw new Error('分享密钥无效');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, usages);
}

async function encryptShareText(text, keyText) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importShareKey(keyText, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

async function decryptShareText(payload, keyText) {
  const key = await importShareKey(keyText, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv || '') },
    key,
    base64ToBytes(payload.data || '')
  );
  return new TextDecoder().decode(decrypted);
}

function encodeGitHubContent(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function decodeGitHubContent(value) {
  return new TextDecoder().decode(base64ToBytes(String(value || '').replace(/\s/g, '')));
}

async function readGitHubError(response) {
  try {
    return (await response.json()).message || '';
  } catch {
    return '';
  }
}

function formatWriteError(status, detail) {
  const suffix = detail ? `（GitHub：${detail}）` : '';
  if (status === 401) return `发布凭据无效或已过期，请重新填写${suffix}`;
  if (status === 403 || status === 404) return `发布凭据没有写入 zen 仓库的权限${suffix}`;
  if (status === 409) return `分享文件写入冲突，请重新点击分享${suffix}`;
  if (status === 422) return `分享文件写入参数无效或文件已存在，请重新点击分享${suffix}`;
  return `同步分享内容失败：HTTP ${status}${suffix}`;
}

function createReadError(status, detail) {
  const suffix = detail ? `（GitHub：${detail}）` : '';
  const message = status === 404
    ? `分享内容不存在或已被删除${suffix}`
    : status === 403
      ? `读取分享内容受限，请确认 zen 仓库可公开读取${suffix}`
      : `读取分享内容失败：HTTP ${status}${suffix}`;
  const error = new Error(message);
  error.status = status;
  return error;
}

export function initShare({ editor, getToken, showMessage }) {
  const modal = document.getElementById('share-modal');
  const qrCanvas = document.getElementById('share-qr-canvas');
  const linkInput = document.getElementById('share-link-input');
  const copyButton = document.getElementById('share-copy');
  const closeButton = document.getElementById('share-close');

  async function createPayload(content, id, key) {
    if (!window.LZString) throw new Error('分享组件加载失败，请刷新后重试');
    const compressed = window.LZString.compressToEncodedURIComponent(content);
    return {
      id,
      version: Date.now(),
      updatedAt: new Date().toISOString(),
      encoding: 'lz-string-uri',
      encryption: 'aes-256-gcm-url-key',
      ...(await encryptShareText(compressed, key))
    };
  }

  async function decodePayload(payload, key) {
    if (!payload?.data) throw new Error('分享内容还未生成');
    const compressed = await decryptShareText(payload, key);
    const content = window.LZString.decompressFromEncodedURIComponent(compressed);
    if (typeof content !== 'string') throw new Error('分享内容解析失败');
    return content;
  }

  async function createPrivateShareFile(path, payload) {
    const token = getToken();
    if (!token) throw new Error('请先设置发布凭据');
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(path)}`,
      {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `share: add ${path}`,
          content: encodeGitHubContent(JSON.stringify(payload, null, 2)),
          branch: config.branch
        })
      }
    );
    if (!response.ok) throw new Error(formatWriteError(response.status, await readGitHubError(response)));
    const data = await response.json();
    if (!data.commit?.sha) throw new Error('分享文件已写入，但未获取到提交版本');
    return data.commit.sha;
  }

  async function fetchPayloadFromApi(id, ref) {
    const path = getShareFilePath(id);
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(path)}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`,
      { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }
    );
    if (!response.ok) throw createReadError(response.status, await readGitHubError(response));
    const data = await response.json();
    if (!data.content) throw new Error('分享内容为空');
    return JSON.parse(decodeGitHubContent(data.content));
  }

  async function fetchPayloadFromPages(id) {
    const response = await fetch(`${config.publicBaseUrl}/${getShareFilePath(id)}?t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!response.ok) throw createReadError(response.status, '');
    return response.json();
  }

  async function fetchPayload(id, ref) {
    let apiError;
    try {
      return await fetchPayloadFromApi(id, ref);
    } catch (error) {
      apiError = error;
      console.warn('GitHub API 分享读取失败，改用 Pages 同步读取', error);
    }

    showMessage(`GitHub API 读取失败，正在回退同步：${apiError.message}`, true);
    for (let attempt = 0; attempt < pagesPollAttempts; attempt += 1) {
      try {
        return await fetchPayloadFromPages(id);
      } catch (error) {
        if (![403, 404].includes(error.status)) throw error;
        await new Promise((resolve) => setTimeout(resolve, pagesPollDelayMs));
      }
    }
    throw new Error(`分享内容同步超时，请稍后重新扫码（API：${apiError.message}）`);
  }

  async function loadFromLocation() {
    showMessage('正在读取分享内容...');
    try {
      const params = getShareParamsFromLocation();
      const payload = await fetchPayload(params.id, params.ref);
      const content = await decodePayload(payload, params.key);
      editor.instance.setValue(content);
      localStorage.setItem('zen_editor_content', content);
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      showMessage('分享内容已载入');
    } catch (error) {
      showMessage(error.message || '分享内容载入失败', true);
    }
  }

  async function open() {
    const content = editor.getContent();
    if (!content.trim()) return showMessage('内容为空', true);
    if (!window.QRCode) return showMessage('二维码组件加载失败，请刷新后重试', true);

    try {
      showMessage('正在生成分享内容...');
      const id = createRandomToken(shareIdBytes);
      const key = createRandomToken(shareKeyBytes);
      const commit = await createPrivateShareFile(getShareFilePath(id), await createPayload(content, id, key));
      const params = new URLSearchParams({ id, ref: commit, k: key });
      const shareUrl = `${config.publicBaseUrl}/index.html${shareHash}?${params}`;
      linkInput.value = shareUrl;
      qrCanvas.replaceChildren();
      new window.QRCode(qrCanvas, {
        text: shareUrl,
        width: 224,
        height: 224,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      modal.classList.replace('hidden', 'flex');
      showMessage('分享内容已生成');
    } catch (error) {
      showMessage(error.message || '分享失败', true);
    }
  }

  function close() {
    modal.classList.replace('flex', 'hidden');
  }

  closeButton.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  copyButton.addEventListener('click', async () => {
    if (!linkInput.value) return;
    try {
      await navigator.clipboard.writeText(linkInput.value);
    } catch {
      linkInput.select();
      document.execCommand('copy');
    }
    showMessage('链接已复制');
  });

  return { isShareLocation, loadFromLocation, open };
}
