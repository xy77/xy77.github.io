import { config } from './config.js';

const storyUrlBase = 'https://zen.dev.mugua.team:8888/index.php?m=execution&f=storyView&storyID=';

export function initSidebar({ api, showMessage }) {
  const trigger = document.getElementById('sidebar-trigger');
  const sidebar = document.getElementById('github-sidebar');
  const list = document.getElementById('sidebar-list');
  const title = document.getElementById('sidebar-title');
  const backButton = document.getElementById('sidebar-back-btn');
  const loading = document.getElementById('sidebar-loading');
  const scopeControl = document.getElementById('sidebar-scope-control');
  const scopeButtons = Array.from(document.querySelectorAll('[data-sidebar-scope]'));
  const cache = new Map();
  const pathNames = new Map([['', '项目列表']]);
  const pathParents = new Map();
  let scope = 'all';
  let hideTimer = null;

  function rootCacheKey(targetScope = scope) {
    return `__root_projects__:${targetScope}`;
  }

  function cacheKey(path) {
    return path === '' ? rootCacheKey() : path;
  }

  function renderScopeControl() {
    scopeButtons.forEach((button) => {
      button.classList.toggle('sidebar-scope-btn-active', button.dataset.sidebarScope === scope);
    });
  }

  function renderMessage(text, className) {
    list.replaceChildren();
    const item = document.createElement('li');
    item.className = className;
    item.textContent = text;
    list.appendChild(item);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  function renderList(items) {
    list.replaceChildren();
    if (!items.length) {
      renderMessage('空目录', 'text-gray-400 text-xs p-2 text-center mt-4');
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('li');
      const header = document.createElement('div');
      const icon = document.createElement('span');
      const nameWrap = document.createElement('div');
      const name = document.createElement('span');
      const date = document.createElement('div');
      const displayName = item.type === 'dir' ? item.summary || item.name : item.name;
      const formattedDate =
        item.date && item.date !== '1970-01-01T00:00:00Z'
          ? new Date(item.date).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '未知时间';

      row.className = 'p-2 hover:bg-white/10 rounded cursor-pointer transition-colors flex flex-col group';
      header.className = 'flex items-center space-x-2 w-full';
      icon.className = 'text-sm shrink-0';
      icon.textContent = item.type === 'dir' ? '📁' : '📄';
      nameWrap.className = 'flex items-center gap-1 min-w-0 flex-grow';
      name.className = 'text-[13px] truncate text-gray-200 group-hover:text-white';
      name.textContent = displayName;
      name.title = displayName;
      date.className = 'text-[10px] text-gray-500 group-hover:text-gray-300 mt-1 ml-6 truncate';
      date.textContent = formattedDate;

      nameWrap.appendChild(name);
      if (scope === 'all' && item.type === 'dir' && ['1', '2'].includes(item.projectScope)) {
        const badge = document.createElement('span');
        badge.className = `sidebar-project-scope-badge sidebar-project-scope-badge-${item.projectScope}`;
        badge.textContent = item.projectScope;
        nameWrap.appendChild(badge);
      }
      header.append(icon, nameWrap);

      if (item.type === 'dir' && item.id) {
        const storyLink = document.createElement('a');
        const storyIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const storyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        storyLink.className = 'sidebar-story-link ml-auto mr-1 shrink-0 w-6 h-6 rounded-md border border-slate-200 bg-slate-50 hover:bg-white text-blue-600 shadow-sm flex items-center justify-center';
        storyLink.href = `${storyUrlBase}${encodeURIComponent(item.id)}`;
        storyLink.target = '_blank';
        storyLink.rel = 'noopener noreferrer';
        storyLink.title = `打开 ID：${item.id}`;
        storyLink.setAttribute('aria-label', `打开 ID：${item.id}`);
        storyLink.addEventListener('click', (event) => event.stopPropagation());

        storyIcon.setAttribute('viewBox', '0 0 24 24');
        storyIcon.setAttribute('fill', 'none');
        storyIcon.setAttribute('stroke', 'currentColor');
        storyIcon.setAttribute('stroke-width', '2');
        storyIcon.setAttribute('stroke-linecap', 'round');
        storyIcon.setAttribute('stroke-linejoin', 'round');
        storyIcon.classList.add('w-3.5', 'h-3.5');
        storyPath.setAttribute('d', 'M14 3h7v7m0-7L10 14M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6');
        storyIcon.appendChild(storyPath);
        storyLink.appendChild(storyIcon);
        header.appendChild(storyLink);
      }
      row.append(header, date);

      if (item.type === 'dir') {
        pathNames.set(item.path, displayName);
        if (item.parentPathOverride !== undefined) pathParents.set(item.path, item.parentPathOverride);
        row.addEventListener('click', () => load(item.path, displayName));
      } else {
        row.addEventListener('click', async () => {
          const fileUrl = `${config.publicBaseUrl}/${item.path}`;
          await copyText(fileUrl);
          showMessage(`已复制链接：${fileUrl}`);
          window.open(fileUrl, '_blank', 'noopener');
        });
      }
      list.appendChild(row);
    });
  }

  async function load(path, customTitle = null) {
    loading.classList.remove('hidden');
    list.replaceChildren();
    title.textContent = customTitle || pathNames.get(path) || (path ? path.split('/').pop() : '项目列表');
    scopeControl.classList.toggle('hidden', path !== '');

    if (!path) {
      backButton.classList.add('hidden');
    } else {
      backButton.classList.remove('hidden');
      backButton.onclick = () => {
        const parentPath = pathParents.has(path)
          ? pathParents.get(path)
          : path.split('/').slice(0, -1).join('/');
        load(parentPath, pathNames.get(parentPath));
      };
    }

    const key = cacheKey(path);
    if (cache.has(key)) {
      renderList(cache.get(key));
      loading.classList.add('hidden');
      return;
    }

    try {
      const items = !path
        ? await api.fetchRootProjectItems(scope)
        : await api.addProjectItemDetails(
            (await api.fetchGithubContents(path)).filter(api.isVisibleSidebarItem)
          );
      cache.set(key, items);
      renderList(items);
    } catch (error) {
      renderMessage(error.message || '获取失败', 'text-red-400 text-xs p-2 text-center mt-4');
    } finally {
      loading.classList.add('hidden');
    }
  }

  scopeButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (button.dataset.sidebarScope === scope) return;
      scope = button.dataset.sidebarScope;
      renderScopeControl();
      load('');
    });
  });
  trigger.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    sidebar.classList.remove('-translate-x-full');
  });
  sidebar.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  sidebar.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => sidebar.classList.add('-translate-x-full'), 1000);
  });
  renderScopeControl();

  return {
    getCachedRootItems(targetScope = 'all') {
      return cache.get(rootCacheKey(targetScope)) || null;
    },
    load,
    reset() {
      cache.clear();
    }
  };
}
