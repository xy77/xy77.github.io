const localKey = 'zen_publish_token';
const sessionKey = 'zen_publish_token_session';

export function initPublishToken({ showMessage, hideModalError }) {
  const modal = document.getElementById('publish-token-modal');
  const settingsButton = document.getElementById('publish-token-settings-btn');
  const status = document.getElementById('publish-token-status');
  const input = document.getElementById('publish-token-input');
  const remember = document.getElementById('remember-publish-token');
  const cancel = document.getElementById('publish-token-cancel');
  const confirm = document.getElementById('publish-token-confirm');
  const listeners = new Set();

  function get() {
    return sessionStorage.getItem(sessionKey) || localStorage.getItem(localKey) || '';
  }

  function updateStatus() {
    const hasToken = Boolean(get());
    status.textContent = hasToken ? '已设置' : '未设置';
    status.classList.toggle('text-blue-300', hasToken);
    status.classList.toggle('text-white/40', !hasToken);
  }

  function loadState() {
    const localToken = localStorage.getItem(localKey) || '';
    const sessionToken = sessionStorage.getItem(sessionKey) || '';
    input.value = sessionToken || localToken;
    remember.checked = Boolean(localToken && !sessionToken);
    updateStatus();
  }

  function save() {
    const token = input.value.trim();
    if (!token) return '';

    if (remember.checked) {
      localStorage.setItem(localKey, token);
      sessionStorage.removeItem(sessionKey);
    } else {
      sessionStorage.setItem(sessionKey, token);
      localStorage.removeItem(localKey);
    }
    return token;
  }

  function open() {
    hideModalError();
    loadState();
    modal.classList.replace('hidden', 'flex');
    setTimeout(() => input.focus(), 100);
  }

  function close() {
    modal.classList.replace('flex', 'hidden');
  }

  settingsButton.addEventListener('click', open);
  cancel.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  confirm.addEventListener('click', () => {
    if (!save()) return showMessage('请填写发布凭据', true);
    close();
    updateStatus();
    listeners.forEach((listener) => listener());
    showMessage('发布凭据已保存');
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') confirm.click();
  });

  updateStatus();

  return {
    get,
    updateStatus,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
