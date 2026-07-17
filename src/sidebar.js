import { config } from './config.js';

const storyUrlBase = 'https://zen.dev.mugua.team:8888/index.php?m=execution&f=storyView&storyID=';

export function initSidebar({ api, showMessage }) {
  const trigger = document.getElementById('sidebar-trigger');
  const sidebar = document.getElementById('github-sidebar');
  const list = document.getElementById('sidebar-list');
  const title = document.getElementById('sidebar-title');
  const titleStoryLink = document.getElementById('sidebar-title-story-link');
  const backButton = document.getElementById('sidebar-back-btn');
  const loading = document.getElementById('sidebar-loading');
  const scopeControl = document.getElementById('sidebar-scope-control');
  const scopeTrigger = document.getElementById('sidebar-scope-trigger');
  const scopeLabel = document.getElementById('sidebar-scope-label');
  const scopeMenu = document.getElementById('sidebar-scope-menu');
  const scopeButtons = Array.from(document.querySelectorAll('[data-sidebar-scope]'));
  const cache = new Map();
  const storyUrlCache = new Map();
  const pathNames = new Map([['', '项目列表']]);
  const pathParents = new Map();
  const pathStoryIds = new Map([['', '']]);
  let scope = 'all';
  let hideTimer = null;
  let scopeMenuHideTimer = null;
  let scopeMenuPinned = false;

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
    scopeLabel.textContent = scope === 'all' ? '全部' : scope;
  }

  function setScopeMenuOpen(isOpen) {
    scopeMenu.classList.toggle('hidden', !isOpen);
    scopeTrigger.setAttribute('aria-expanded', String(isOpen));
    scopeTrigger.classList.toggle('sidebar-scope-trigger-open', isOpen);
  }

  function clearScopeMenuHideTimer() {
    if (scopeMenuHideTimer) {
      clearTimeout(scopeMenuHideTimer);
      scopeMenuHideTimer = null;
    }
  }

  function scheduleScopeMenuClose() {
    clearScopeMenuHideTimer();
    if (scopeMenuPinned) return;
    scopeMenuHideTimer = setTimeout(() => {
      scopeMenuHideTimer = null;
      if (!scopeMenuPinned) setScopeMenuOpen(false);
    }, 150);
  }

  function closeScopeMenu() {
    clearScopeMenuHideTimer();
    scopeMenuPinned = false;
    setScopeMenuOpen(false);
  }

  function getStoryUrl(storyId) {
    const normalizedStoryId = String(storyId || '').trim();
    if (!normalizedStoryId) return '';
    if (!storyUrlCache.has(normalizedStoryId)) {
      storyUrlCache.set(normalizedStoryId, `${storyUrlBase}${encodeURIComponent(normalizedStoryId)}`);
    }
    return storyUrlCache.get(normalizedStoryId);
  }

  function cacheInitialStoryUrls(items) {
    items.slice(0, 10).forEach((item) => {
      if (item.type === 'dir' && item.id) getStoryUrl(item.id);
    });
  }

  function renderTitleStoryLink(storyId) {
    const normalizedStoryId = String(storyId || '').trim();
    titleStoryLink.classList.toggle('hidden', !normalizedStoryId);
    if (!normalizedStoryId) {
      titleStoryLink.removeAttribute('href');
      titleStoryLink.removeAttribute('title');
      titleStoryLink.removeAttribute('aria-label');
      return;
    }
    titleStoryLink.href = getStoryUrl(normalizedStoryId);
    titleStoryLink.title = `打开 ID：${normalizedStoryId}`;
    titleStoryLink.setAttribute('aria-label', `打开 ID：${normalizedStoryId}`);
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

    cacheInitialStoryUrls(items);

    items.forEach((item) => {
      const row = document.createElement('li');
      const header = document.createElement('div');
      const icon = createSidebarItemIcon(item.type);
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

      row.className = 'px-2 py-2.5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors flex flex-col group';
      header.className = 'flex items-center gap-3 w-full';
      nameWrap.className = 'flex items-center gap-1 min-w-0 flex-grow';
      name.className = 'text-[13px] leading-5 font-normal truncate text-gray-100 group-hover:text-white';
      name.textContent = displayName;
      name.title = displayName;
      date.className = 'text-[11px] text-gray-500 group-hover:text-gray-300 mt-0.5 ml-8 truncate';
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

        storyLink.className = 'sidebar-story-link ml-auto mr-0.5 shrink-0 w-7 h-7 rounded-md text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center';
        storyLink.href = getStoryUrl(item.id);
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
        storyIcon.classList.add('w-4', 'h-4');
        storyPath.setAttribute('d', 'M14 3h7v7m0-7L10 14M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6');
        storyIcon.appendChild(storyPath);
        storyLink.appendChild(storyIcon);
        header.appendChild(storyLink);
      }
      row.append(header, date);

      if (item.type === 'dir') {
        pathNames.set(item.path, displayName);
        pathStoryIds.set(item.path, item.id ? String(item.id).trim() : '');
        if (item.parentPathOverride !== undefined) pathParents.set(item.path, item.parentPathOverride);
        row.addEventListener('click', () => load(item.path, displayName, item.id));
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

  function createSidebarItemIcon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('w-5', 'h-5', 'shrink-0', 'text-slate-300');
    path.setAttribute(
      'd',
      type === 'dir'
        ? 'M3.75 6A2.25 2.25 0 0 1 6 3.75h3.56c.6 0 1.17.24 1.6.66l1.14 1.14c.14.14.33.22.53.22H18A2.25 2.25 0 0 1 20.25 8v8.25A2.25 2.25 0 0 1 18 18.5H6a2.25 2.25 0 0 1-2.25-2.25V6Z'
        : 'M6.75 3.75h6.3L17.25 8v12.25H6.75V3.75Zm6 1.8v3.2h3.2'
    );
    svg.appendChild(path);
    return svg;
  }

  async function load(path, customTitle = null, customStoryId = null) {
    loading.classList.remove('hidden');
    list.replaceChildren();
    title.textContent = customTitle || pathNames.get(path) || (path ? path.split('/').pop() : '项目列表');
    renderTitleStoryLink(customStoryId === null ? pathStoryIds.get(path) : customStoryId);
    scopeControl.classList.toggle('hidden', path !== '');
    if (path) closeScopeMenu();

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
      if (button.dataset.sidebarScope === scope) {
        closeScopeMenu();
        return;
      }
      scope = button.dataset.sidebarScope;
      renderScopeControl();
      closeScopeMenu();
      load('');
    });
  });
  scopeTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    clearScopeMenuHideTimer();
    scopeMenuPinned = true;
    setScopeMenuOpen(true);
  });
  scopeControl.addEventListener('mouseenter', () => {
    clearScopeMenuHideTimer();
    setScopeMenuOpen(true);
  });
  scopeControl.addEventListener('mouseleave', scheduleScopeMenuClose);
  document.addEventListener('click', (event) => {
    if (!scopeControl.contains(event.target)) closeScopeMenu();
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
