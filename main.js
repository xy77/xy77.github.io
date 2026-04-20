// 页面载入时立即执行检查
if (typeof checkAuth === 'function') {
    checkAuth();
}

// 核心配置
const config = {
    t1: 'github_pat_11AHGFESA0J1xZLVh6IN3h_L',
    t2: 'NmZyLqLR67B9QtQ8vMypawhc2HTMBuaiFZcW',
    t3: 'L1v7sN47A25R6XvgLPIcuU',
    getToken: function() {
        return this.t1 + this.t2 + this.t3;
    },
    owner: 'xy77', 
    repo: 'zen', 
    branch: 'main' 
};

// 状态管理
let folders = [];
let selectedFolder = null;
let isNewProjectMode = false;
let editor = null;

// 初始化 Monaco Editor 并引入官方中文支持
require.config({ 
    paths: { 'vs': '[https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs](https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs)' },
    'vs/nls': { availableLanguages: { '*': 'zh-cn' } }
});
require(['vs/editor/editor.main'], function() {
    // 从本地恢复内容
    const savedContent = localStorage.getItem('zen_editor_content') || '';
    
    editor = monaco.editor.create(document.getElementById('editor'), {
        value: savedContent,
        language: 'html',
        theme: 'vs', // 浅色主题
        automaticLayout: true,
        minimap: { enabled: true }, // 默认开启缩略图
        fontSize: 16,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        scrollBeyondLastLine: false,
        roundedSelection: true,
        renderWhitespace: "none"
    });

    // 缩略图状态
    const minimapEnabledKey = editor.createContextKey('minimapEnabled', true);

    // 隐藏缩略图
    editor.addAction({
        id: 'hide-minimap-cn',
        label: '隐藏缩略图',
        contextMenuGroupId: '0_custom_top',
        contextMenuOrder: 1,
        precondition: 'minimapEnabled',
        run: function(ed) {
            ed.updateOptions({ minimap: { enabled: false } });
            minimapEnabledKey.set(false);
        }
    });

    // 显示缩略图
    editor.addAction({
        id: 'show-minimap-cn',
        label: '显示缩略图',
        contextMenuGroupId: '0_custom_top',
        contextMenuOrder: 2,
        precondition: '!minimapEnabled',
        run: function(ed) {
            ed.updateOptions({ minimap: { enabled: true } });
            minimapEnabledKey.set(true);
        }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function() {
        previewBtn.click();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, function() {
        downloadBtn.click();
    });

    // 监听键盘缩放事件
    window.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            const currentSize = editor.getOption(monaco.editor.EditorOption.fontSize);
            
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                // 限制最大字号为 44px
                editor.updateOptions({ fontSize: Math.min(44, currentSize + 2) });
            } 
            else if (e.key === '-') {
                e.preventDefault();
                editor.updateOptions({ fontSize: Math.max(8, currentSize - 2) });
            } 
            else if (e.key === '0') {
                e.preventDefault();
                editor.updateOptions({ fontSize: 16 });
            }
        }
    }, true);

    editor.addAction({
        id: 'clear-all-and-paste',
        label: '清空所有并粘贴',
        contextMenuGroupId: '0_custom_top',
        contextMenuOrder: 3, 
        run: async function(ed) {
            try {
                const text = await navigator.clipboard.readText();
                ed.setValue(text || '');
                localStorage.setItem('zen_editor_content', text || '');
            } catch (err) {
                ed.setValue('');
                localStorage.setItem('zen_editor_content', '');
                showMessage('无法直接访问剪贴板，已清空内容。请手动粘贴。', true);
            }
        }
    });

    editor.addAction({
        id: 'clear-all-content',
        label: '清空所有',
        contextMenuGroupId: '0_custom_top',
        contextMenuOrder: 4,
        run: function(ed) {
            ed.setValue('');
            localStorage.setItem('zen_editor_content', '');
        }
    });
    
    // 监听编辑器内容变化并实时保存到 localStorage
    editor.onDidChangeModelContent(() => {
        const val = editor.getValue();
        localStorage.setItem('zen_editor_content', val);
        // 动态调整编辑器语言模式
        const type = detectType(val);
        if (type === 'markdown') {
            monaco.editor.setModelLanguage(editor.getModel(), 'markdown');
        } else if (type === 'json') {
            monaco.editor.setModelLanguage(editor.getModel(), 'json');
        } else {
            monaco.editor.setModelLanguage(editor.getModel(), 'html');
        }
    });

    // 编辑器加载完成后初始化数据
    loadSidebarData('');
    editor.focus();

    // 初始化拖拽监听
    initDragAndDrop();
});

// 元素获取
const previewBtn = document.getElementById('preview-btn');
const publishBtn = document.getElementById('publish-btn');
const downloadBtn = document.getElementById('download-btn');
const statusMessage = document.getElementById('status-message');

const publishModal = document.getElementById('publish-modal');
const publishPassword = document.getElementById('publish-password');
const projectContainer = document.getElementById('project-container');
const addProjectBtn = document.getElementById('add-project-btn');
const newProjectContainer = document.getElementById('new-project-container');
const newProjectName = document.getElementById('new-project-name');
const newProjectSummary = document.getElementById('new-project-summary'); 
const encryptionSwitch = document.getElementById('encryption-switch');
const fileNameInput = document.getElementById('file-name-input');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const publishExtLabel = document.getElementById('publish-ext-label');

// 下载相关元素
const downloadModal = document.getElementById('download-modal');
const downloadFilename = document.getElementById('download-filename');
const downloadCancel = document.getElementById('download-cancel');
const downloadConfirm = document.getElementById('download-confirm');
const downloadExtLabel = document.getElementById('download-ext-label');

// 重构内容类型检测，使 JSON 始终高亮错误
function detectType(content) {
    const trimmed = content.trim();
    if (!trimmed) return 'html';
    
    // 如果是以 { 或 [ 开头，则强制识别为 JSON，以便 Monaco 进行语法高亮和错误提示
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return 'json';
    }

    if (trimmed.includes('<html') || trimmed.includes('<!DOCTYPE')) return 'html';
    if (trimmed.includes('import React') || trimmed.includes('export default')) return 'react';
    
    return 'markdown';
}

// 获取编辑器内容的辅助函数
function getFullCode() {
    return editor ? editor.getValue() : '';
}

// --- 核心交互逻辑 ---
function showMessage(text, isError = false) {
    statusMessage.textContent = text;
    statusMessage.className = `text-sm p-3 rounded-lg ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => statusMessage.classList.add('hidden'), 6000);
}

// 获取编辑器内容并智能转换为预览用 HTML 的辅助函数
function getFormattedCode() {
    let content = getFullCode();
    const type = detectType(content);

    if (type === 'react') {
        let componentName = 'App';
        const exportMatch = content.match(/export\s+default\s+([a-zA-Z0-9_]+)/);
        if (exportMatch) {
            componentName = exportMatch[1];
        }
        let processedCode = content.replace(/export\s+default\s+[a-zA-Z0-9_]+;?/g, '');
        return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>预览</title><script src="https://cdn.tailwindcss.com"><\/script><script type="importmap">{"imports": {"react": "https://esm.sh/react@18.2.0","react-dom/client": "https://esm.sh/react-dom@18.2.0/client","lucide-react": "https://esm.sh/lucide-react@0.292.0"}}<\/script><script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script></head><body><div id="root"></div><script type="text/babel" data-type="module">import { createRoot } from 'react-dom/client';${processedCode}\nconst rootElement = document.getElementById('root');if (rootElement) { const root = createRoot(rootElement); root.render(<${componentName} />); }<\/script></body></html>`;
    } else if (type === 'markdown') {
        const escapedMd = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Markdown 预览</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css"><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script><style>.markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; } @media (max-width: 767px) { .markdown-body { padding: 15px; } }</style></head><body class="markdown-body"><div id="content"></div><script>document.getElementById('content').innerHTML = marked.parse(\`${escapedMd}\`);<\/script></body></html>`;
    }
    
    return content;
}

// 初始化拖拽文件功能
function initDragAndDrop() {
    const dropZone = window;
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                if (editor) {
                    editor.setValue(content);
                    showMessage(`成功载入本地文件: ${file.name}`);
                }
            };
            reader.readAsText(file);
        }
    });
}

// 预览按钮逻辑 (如果格式错误则提示)
previewBtn.onclick = () => {
    const content = getFullCode();
    if (!content.trim()) return showMessage('代码为空', true);

    const type = detectType(content);
    
    if (type === 'json') {
        try {
            const obj = JSON.parse(content);
            const formatted = JSON.stringify(obj, null, 4);
            editor.setValue(formatted);
            showMessage('JSON 已格式化');
            return;
        } catch (e) {
            // 格式不正确时，Monaco 已经通过红色波浪线高亮了位置，此处给出文字提示
            showMessage('JSON 格式错误，请根据编辑器红线提示修正后再试', true);
            return;
        }
    }

    let htmlContent = getFormattedCode();
    if (htmlContent.includes('<title>')) {
        const injectIcon = '\n\t<link rel="icon" href="[https://xy77.github.io/zen/ico.svg](https://xy77.github.io/zen/ico.svg)" type="image/svg+xml">';
        htmlContent = htmlContent.replace(/(<title>.*?<\/title>)/i, `$1${injectIcon}`);
    }

    try {
        localStorage.setItem('zen_preview_html', htmlContent);
        window.open('preview.html', '_blank');
    } catch (e) {
        showMessage('预览失败：内容过长', true);
    }
};

async function fetchFolders() {
    const token = config.getToken();
    try {
        // 优先从左侧的缓存拿数据，减少多余请求
        if (sidebarCache[''] && sidebarCache[''].length > 0) {
            folders = sidebarCache[''].map(item => ({
                name: item.name,
                summary: item.summary || item.name,
                date: item.date
            }));
            folders.sort((a, b) => new Date(b.date) - new Date(a.date));
            renderProjectButtons(10);
            return;
        }

        const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/?t=${Date.now()}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('API 访问受限');
        const data = await res.json();
        
        projectContainer.innerHTML = '<span class="text-sm text-gray-400">正在获取项目详情...</span>';
        let targetItems = data.filter(item => item.type === 'dir' && item.name !== 'temp');
        
        const itemsWithDetails = await Promise.all(targetItems.map(async (item) => {
            const dateStr = await fetchPathCommitDate(item.path);
            const fetchedSummary = await fetchFolderSummary(item.path);
            return { 
                name: item.name, 
                summary: fetchedSummary || item.name, 
                date: dateStr || '1970-01-01T00:00:00Z' 
            };
        }));
        
        itemsWithDetails.sort((a, b) => new Date(b.date) - new Date(a.date));
        folders = itemsWithDetails;
        renderProjectButtons(10);
    } catch (err) {
        projectContainer.innerHTML = '<span class="text-sm text-red-500">无法连接到 GitHub</span>';
    }
}

function renderProjectButtons(limit = 10) {
    projectContainer.innerHTML = '';
    const list = limit ? folders.slice(0, limit) : folders;
    list.forEach(f => {
        const btn = document.createElement('button');
        btn.className = `px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:border-blue-400 transition-all ${selectedFolder === f.name && !isNewProjectMode ? 'folder-btn-active' : ''}`;
        btn.textContent = f.summary;
        btn.onclick = () => {
            selectedFolder = f.name;
            isNewProjectMode = false;
            newProjectContainer.classList.add('hidden');
            renderProjectButtons(limit);
        };
        projectContainer.appendChild(btn);
    });
    
    if (limit && folders.length > limit) {
        const moreBtn = document.createElement('button');
        moreBtn.className = "px-3 py-1.5 text-sm border-gray-300 text-blue-600 rounded-md bg-white hover:border-blue-400 transition-all";
        moreBtn.textContent = "查看更多";
        moreBtn.onclick = (e) => {
            e.preventDefault();
            renderProjectButtons(null);
        };
        projectContainer.appendChild(moreBtn);
    }
}

// 下载按钮默认后缀
downloadBtn.onclick = () => {
    const content = getFullCode();
    if (!content.trim()) return showMessage('不能为空', true);
    
    const type = detectType(content);
    let ext = '.html';
    if (type === 'markdown') ext = '.md';
    else if (type === 'json') ext = '.json';
    
    downloadExtLabel.textContent = ext;
    
    downloadModal.classList.replace('hidden', 'flex');
    setTimeout(() => downloadFilename.focus(), 100);
};

downloadCancel.onclick = () => {
    downloadModal.classList.replace('flex', 'hidden');
    downloadFilename.value = '';
};

downloadConfirm.onclick = () => {
    const content = getFullCode();
    const type = detectType(content);
    
    let ext = '.html';
    if (type === 'markdown') ext = '.md';
    else if (type === 'json') ext = '.json';

    const name = downloadFilename.value.trim().replace(/[^a-zA-Z0-9.+\-]/g, '') || 'index';
    const finalName = name + ext;
    
    const finalContent = (type === 'markdown' || type === 'json') ? content : getFormattedCode(); 
    
    try {
        let mimeType = 'text/html';
        if (type === 'markdown') mimeType = 'text/markdown';
        else if (type === 'json') mimeType = 'application/json';

        const blob = new Blob([finalContent], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        downloadModal.classList.replace('flex', 'hidden');
        downloadFilename.value = '';
        showMessage(`正在下载：${finalName}`);
    } catch (e) {
        showMessage('下载失败', true);
    }
};

publishBtn.onclick = () => {
    const content = getFullCode();
    if (!content.trim()) return showMessage('不能为空', true);
    
    const type = detectType(content);
    let ext = '.html';
    if (type === 'markdown') ext = '.md';
    else if (type === 'json') ext = '.json';

    publishExtLabel.textContent = ext;

    publishModal.classList.replace('hidden', 'flex');
    publishPassword.value = ''; 
    fetchFolders();
    setTimeout(() => publishPassword.focus(), 100);
};

addProjectBtn.onclick = () => {
    isNewProjectMode = true;
    selectedFolder = null;
    newProjectContainer.classList.remove('hidden');
    newProjectSummary.value = ''; 
    renderProjectButtons(10);
    newProjectName.focus();
};

modalCancel.onclick = () => {
    publishModal.classList.replace('flex', 'hidden');
    fileNameInput.value = '';
};

modalConfirm.onclick = async () => {
    const inputPass = publishPassword.value.trim();
    const dayStr = new Date().getDate().toString();
    const todayDay = dayStr + dayStr; 
    
    if (inputPass !== todayDay) {
        return showMessage('密码错误', true);
    }

    const token = config.getToken();
    const folder = isNewProjectMode ? newProjectName.value.trim() : selectedFolder;
    const fileName = fileNameInput.value.trim().replace(/[^a-zA-Z0-9.+\-]/g, '');

    if (!folder || !fileName) return showMessage('请确保目录名和文件名完整', true);

    const content = getFullCode();
    const type = detectType(content);
    
    let ext = '.html';
    if (type === 'markdown') ext = '.md';
    else if (type === 'json') ext = '.json';
    
    let rawContent = (type === 'markdown' || type === 'json') ? content : getFormattedCode(); 
    
    if (type !== 'markdown' && type !== 'json' && rawContent.includes('<title>')) {
        let injectCode = '\n\t<link rel="icon" href="../ico.svg" type="image/svg+xml">';
        if (encryptionSwitch.checked) {
            injectCode += '\n<!-- 引入权限验证逻辑 -->\n\t<script src="../auth.js"><\/script>\n\t<script>\n\t\t// 页面载入时立即执行检查\n\t\tif (typeof checkAuth === \'function\') {\n\t\t\tcheckAuth();\n\t\t}\n\t<\/script>';
        }
        rawContent = rawContent.replace(/(<title>.*?<\/title>)/i, `$1${injectCode}`);
    }

    const path = `${folder}/${fileName}${ext}`;

    publishModal.classList.replace('flex', 'hidden');
    publishBtn.disabled = true;
    showMessage('正在推送...');

    try {
        if (isNewProjectMode) {
            const summaryText = newProjectSummary.value.trim();
            if (summaryText) {
                const summaryPath = `${folder}/_summary.txt`;
                try {
                    await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${summaryPath}`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: `add summary for ${folder}`,
                            content: btoa(unescape(encodeURIComponent(summaryText))),
                            branch: config.branch
                        })
                    });
                } catch (err) { console.warn('保存摘要失败', err); }
            }
        }

        let sha = null;
        const getRes = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (getRes.ok) sha = (await getRes.json()).sha;

        const putRes = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `deploy: ${path}`,
                content: btoa(unescape(encodeURIComponent(rawContent))),
                sha: sha,
                branch: config.branch
            })
        });

        if (putRes.ok) {
            const url = `https://${config.owner}.github.io/${config.repo}/${path}`;
            const el = document.createElement("textarea"); el.value = url; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
            showMessage(`发布成功！已复制链接：${url}`);
            fileNameInput.value = '';
        } else throw new Error('推送失败，请检查仓库权限');
    } catch (e) {
        showMessage(e.message, true);
    } finally {
        publishBtn.disabled = false;
        fileNameInput.value = '';
    }
};

// ================== 左侧目录树遮罩交互逻辑 ==================
const domSidebarTrigger = document.getElementById('sidebar-trigger');
const domGithubSidebar = document.getElementById('github-sidebar');
const domSidebarList = document.getElementById('sidebar-list');
const domSidebarTitle = document.getElementById('sidebar-title');
const domSidebarBackBtn = document.getElementById('sidebar-back-btn');
const domSidebarLoading = document.getElementById('sidebar-loading');

let sidebarHideTimer = null;
let sidebarCache = {}; 
let pathNameMap = { '': '项目列表' }; 

domSidebarTrigger.addEventListener('mouseenter', () => {
    clearTimeout(sidebarHideTimer);
    domGithubSidebar.classList.remove('-translate-x-full');
});

domGithubSidebar.addEventListener('mouseenter', () => { clearTimeout(sidebarHideTimer); });

domGithubSidebar.addEventListener('mouseleave', () => {
    sidebarHideTimer = setTimeout(() => {
        domGithubSidebar.classList.add('-translate-x-full');
    }, 1000);
});

async function fetchPathCommitDate(path) {
    const token = config.getToken();
    try {
        const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/commits?path=${path}&per_page=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.length > 0 ? data[0].commit.committer.date : null;
    } catch (e) { return null; }
}

async function fetchFolderSummary(path) {
    const token = config.getToken();
    try {
        const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}/_summary.txt?ref=${config.branch}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.content ? decodeURIComponent(escape(atob(data.content))) : null;
    } catch (e) { return null; }
}

async function loadSidebarData(path, customTitle = null) {
    domSidebarLoading.classList.remove('hidden');
    domSidebarList.innerHTML = '';
    domSidebarTitle.textContent = customTitle || pathNameMap[path] || (path === '' ? '项目列表' : path.split('/').pop());
    
    if (path === '') { domSidebarBackBtn.classList.add('hidden'); } 
    else {
        domSidebarBackBtn.classList.remove('hidden');
        domSidebarBackBtn.onclick = () => {
            const parentPath = path.split('/').slice(0, -1).join('/');
            loadSidebarData(parentPath, pathNameMap[parentPath]);
        };
    }

    if (sidebarCache[path]) {
        renderSidebarList(sidebarCache[path]);
        domSidebarLoading.classList.add('hidden');
        return;
    }

    const token = config.getToken();
    try {
        const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('读取目录失败');
        const data = await res.json();
        
        // --- 过滤掉 "temp" 文件夹 ---
        let targetItems = path === '' 
            ? data.filter(item => item.type === 'dir' && item.name !== 'temp') 
            : data.filter(item => item.name !== '_summary.txt' && item.name !== '.DS_Store');

        const itemsWithDetails = await Promise.all(targetItems.map(async (item) => {
            const dateStr = await fetchPathCommitDate(item.path);
            let summary = item.name;
            if (item.type === 'dir') {
                const fetchedSummary = await fetchFolderSummary(item.path);
                if (fetchedSummary) summary = fetchedSummary;
            }
            return { ...item, date: dateStr || '1970-01-01T00:00:00Z', summary: summary };
        }));

        itemsWithDetails.sort((a, b) => new Date(b.date) - new Date(a.date));
        sidebarCache[path] = itemsWithDetails; 
        renderSidebarList(itemsWithDetails);
    } catch (e) {
        domSidebarList.innerHTML = `<li class="text-red-400 text-xs p-2 text-center mt-4">获取失败</li>`;
    } finally {
        domSidebarLoading.classList.add('hidden');
    }
}

function renderSidebarList(items) {
    domSidebarList.innerHTML = '';
    if (items.length === 0) {
        domSidebarList.innerHTML = `<li class="text-gray-400 text-xs p-2 text-center mt-4">空目录</li>`;
        return;
    }
    items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'p-2 hover:bg-white/10 rounded cursor-pointer transition-colors flex flex-col group';
        const formattedDate = item.date !== '1970-01-01T00:00:00Z' 
            ? new Date(item.date).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' })
            : '未知时间';
        const icon = item.type === 'dir' ? '📁' : '📄';
        const displayName = item.type === 'dir' ? (item.summary || item.name) : item.name;
        if (item.type === 'dir') pathNameMap[item.path] = displayName;
        
        li.innerHTML = `<div class="flex items-center space-x-2 w-full"><span class="text-sm shrink-0">${icon}</span><span class="text-[13px] truncate text-gray-200 group-hover:text-white" title="${displayName}">${displayName}</span></div><div class="text-[10px] text-gray-500 group-hover:text-gray-300 mt-1 ml-6 truncate">${formattedDate}</div>`;
        
        if (item.type === 'dir') {
            li.onclick = () => loadSidebarData(item.path, displayName);
        } else {
            li.onclick = () => {
                const fileUrl = `https://${config.owner}.github.io/${config.repo}/${item.path}`;
                const el = document.createElement("textarea"); el.value = fileUrl; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
                showMessage(`已复制链接：${fileUrl}`);
                window.open(fileUrl, '_blank');
            };
        }
        domSidebarList.appendChild(li);
    });
}

// 背景动效
!function(){function o(w,v,i){return w.getAttribute(v)||i}function j(i){return document.getElementsByTagName(i)}function l(){var i=j("script"),w=i.length,v=i[w-1];return{l:w,z:o(v,"zIndex",-1),o:o(v,"opacity",0.5),c:o(v,"color","0,0,0"),n:o(v,"count",599)}}function k(){r=u.width=window.innerWidth||document.documentElement.clientWidth||document.body.clientWidth,n=u.height=window.innerHeight||document.documentElement.clientHeight||document.body.clientHeight}function b(){e.clearRect(0,0,r,n);var w=[f].concat(t);var x,v,A,B,z,y;t.forEach(function(i){i.x+=i.xa,i.y+=i.ya,i.xa*=i.x>r||i.x<0?-1:1,i.ya*=i.y>n||i.y<0?-1:1,e.fillRect(i.x-0.5,i.y-0.5,1,1);for(v=0;v<w.length;v++){x=w[v];if(i!==x&&null!==x.x&&null!==x.y){B=i.x-x.x,z=i.y-x.y,y=B*B+z*z;y<x.max&&(x===f&&y>=x.max/2&&(i.x-=0.03*B,i.y-=0.03*z),A=(x.max-y)/x.max,e.beginPath(),e.lineWidth=A/2,e.strokeStyle="rgba("+s.c+","+(A+0.2)+")",e.moveTo(i.x,i.y),e.lineTo(x.x,x.y),e.stroke())}}w.splice(w.indexOf(i),1)}),m(b)}var u=document.createElement("canvas"),s=l(),c="c_n"+s.l,e=u.getContext("2d"),r,n,m=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.oRequestAnimationFrame||window.msRequestAnimationFrame||function(i){window.setTimeout(i,1000/45)},a=Math.random,f={x:null,y:null,max:20000};u.id=c;u.style.cssText="position:fixed;top:0;left:0;z-index:"+s.z+";opacity:"+s.o+";pointer-events:none;";j("body")[0].appendChild(u);k(),window.onresize=k;window.onmousemove=function(i){i=i||window.event,f.x=i.clientX,f.y=i.clientY},window.onmouseout=function(){f.x=null,f.y=null};for(var t=[],p=0;s.n>p;p++){var h=a()*r,g=a()*n,q=2*a()-1,d=2*a()-1;t.push({x:h,y:g,xa:q,ya:d,max:6000})}setTimeout(function(){b()},100)}();

// 富强民主文明和谐点击特效
var a_idx = 0;
jQuery(document).ready(function($) {
    $("body").click(function(e) {
        var a = new Array("富强", "😄", "民主", "😊", "文明", "🤔", "和谐", "😦", "自由", "😙", "平等", "😋", "公正", "🤪" ,"法治" ,"🤠", "爱国", "🤭", "敬业", "🤩", "诚信", "🥰", "友善", "😳");
        var $i = $("<span />").text(a[a_idx]);
        a_idx = (a_idx + 1) % a.length;
        var x = e.pageX, y = e.pageY;
        $i.css({ "z-index": 9999, "top": y - 20, "left": x, "position": "absolute", "font-weight": "normal", "color": "GoldEnrod", "pointer-events": "none" });
        $("body").append($i);
        $i.animate({ "top": y - 180, "opacity": 0 }, 1000, function() { $i.remove(); });
    });
});
