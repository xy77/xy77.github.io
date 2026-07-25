const editorStorageKey = 'zen_editor_content';
const previewStorageKey = 'zen_preview_html';
const markdownPreviewDefaultEditorRatio = 70;
const markdownPreviewMinEditorRatio = 30;
const markdownPreviewMaxEditorRatio = 85;
const markdownPreviewMinWidth = 480;
const markdownScrollMessageFromEditor = 'zen-md-editor-scroll';
const markdownScrollMessageFromPreview = 'zen-md-preview-scroll';
const markdownUpdateMessageFromEditor = 'zen-md-editor-update';

export function detectType(content) {
  const trimmed = content.trim();
  if (!trimmed) return 'html';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.includes('<html') || trimmed.includes('<!DOCTYPE')) return 'html';
  if (isReactCode(trimmed)) return 'react';
  return 'markdown';
}

function isReactCode(content) {
  const hasReactImport = /(?:import|from)\s+[^;\n]*['"](?:react|react-dom\/client|lucide-react)['"]/.test(content);
  const hasDefaultExport = /\bexport\s+default\b/.test(content);
  const hasComponentDeclaration = /\b(?:function|class|const|let|var)\s+[A-Z][A-Za-z0-9_$]*\b/.test(content);
  const hasJsx = /<[A-Za-z][A-Za-z0-9_.:-]*(?:\s|>|\/)/.test(content);
  return hasReactImport || hasDefaultExport || (hasComponentDeclaration && hasJsx);
}

function getReactComponentName(content) {
  const namedDefault = content.match(
    /\bexport\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_$]*)\b/
  );
  if (namedDefault) return namedDefault[1];
  const declared = content.match(/\b(?:function|class|const|let|var)\s+(App|[A-Z][A-Za-z0-9_$]*)\b/);
  if (declared) return declared[1];
  const identifier = content.match(/\bexport\s+default\s+([A-Z][A-Za-z0-9_$]*)\s*;?\s*$/m);
  return identifier?.[1] || 'App';
}

function getReactPreviewSource(content) {
  if (/\bexport\s+default\b/.test(content)) return content;
  if (/\b(?:createRoot|ReactDOM\.render)\s*\(/.test(content)) return content;
  return `${content.trim()}\n\nexport default ${getReactComponentName(content)};`;
}

function toInlineScriptString(value) {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

function buildPreviewHtml(content) {
  const type = detectType(content);

  if (type === 'react') {
    const reactSource = getReactPreviewSource(content);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>预览</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <script type="importmap">
        {
            "imports": {
                "react": "https://esm.sh/react@18.2.0",
                "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
                "react/jsx-runtime": "https://esm.sh/react@18.2.0/jsx-runtime",
                "lucide-react": "https://esm.sh/lucide-react@0.292.0"
            }
        }
    <\/script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
    <style>
        #zen-preview-error { display:none; margin:24px; padding:16px; border-radius:8px; background:#fee2e2; color:#991b1b; font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; white-space:pre-wrap; }
    </style>
</head>
<body>
    <div id="root"></div>
    <pre id="zen-preview-error"></pre>
    <script type="module">
        import * as __ZenReact from 'react';
        import { createRoot as __ZenCreateRoot } from 'react-dom/client';
        const __ZenSource = ${toInlineScriptString(reactSource)};
        const __ZenErrorBox = document.getElementById('zen-preview-error');
        try {
            const __ZenCompiled = Babel.transform(__ZenSource, {
                filename: 'preview.tsx',
                sourceType: 'module',
                presets: [['react', { runtime: 'automatic' }], ['typescript', { isTSX: true, allExtensions: true }]]
            }).code;
            const __ZenUrl = URL.createObjectURL(new Blob([__ZenCompiled], { type: 'text/javascript' }));
            const __ZenModule = await import(__ZenUrl);
            URL.revokeObjectURL(__ZenUrl);
            const __ZenRootElement = document.getElementById('root');
            const __ZenComponent = __ZenModule.default;
            if (__ZenComponent && __ZenRootElement) {
                __ZenCreateRoot(__ZenRootElement).render(__ZenReact.createElement(__ZenComponent));
            } else if (__ZenRootElement && !__ZenRootElement.childNodes.length) {
                throw new Error('未找到默认导出的 React 组件');
            }
        } catch (error) {
            __ZenErrorBox.style.display = 'block';
            __ZenErrorBox.textContent = error && error.stack ? error.stack : String(error);
            console.error(error);
        }
    <\/script>
</body>
</html>`;
  }

  if (type === 'markdown') {
    const markdownSource = toInlineScriptString(content);
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Markdown 预览</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css"><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script><style>html,body{min-height:100%}.markdown-body{box-sizing:border-box;min-width:200px;max-width:980px;margin:0 auto;padding:32px;overflow:auto}.md-source-block{scroll-margin-top:0}.md-source-block>:first-child{margin-top:0}.md-source-block>:last-child{margin-bottom:1rem}@media(max-width:767px){.markdown-body{padding:16px}}</style></head><body class="markdown-body"><div id="content"></div><script>
const __ZenMarkdown = ${markdownSource};
const __ZenContent = document.getElementById('content');
let __ZenSyncing = false;
let __ZenScrollFrame = 0;

function __ZenCountLines(raw) {
  const normalized = String(raw || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  if (!normalized) return 1;
  const lines = normalized.split('\\n').length - (normalized.endsWith('\\n') ? 1 : 0);
  return Math.max(1, lines);
}

function __ZenEscapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function __ZenRenderMarkdown(markdown) {
  const tokens = marked.lexer(markdown);
  let line = 1;
  let html = '';
  tokens.forEach((token) => {
    const raw = token.raw || '';
    const startLine = line;
    line += __ZenCountLines(raw);
    if (token.type === 'space') return;
    html += '<div class="md-source-block" data-md-line="' + __ZenEscapeAttr(startLine) + '">' + marked.parser([token]) + '<\\/div>';
  });
  __ZenContent.innerHTML = html || marked.parse(markdown);
}

function __ZenBlocks() {
  return Array.from(document.querySelectorAll('[data-md-line]'));
}

function __ZenNearestBlock(line) {
  let nearest = null;
  for (const block of __ZenBlocks()) {
    const blockLine = Number(block.dataset.mdLine || 1);
    if (blockLine <= line) nearest = block;
    else break;
  }
  return nearest || __ZenBlocks()[0] || null;
}

function __ZenActiveLine() {
  const blocks = __ZenBlocks();
  if (!blocks.length) return 1;
  let active = Number(blocks[0].dataset.mdLine || 1);
  for (const block of blocks) {
    if (block.getBoundingClientRect().top <= 1) active = Number(block.dataset.mdLine || active);
    else break;
  }
  return active;
}

function __ZenScrollToLine(line) {
  const block = __ZenNearestBlock(Number(line || 1));
  if (!block) return;
  __ZenSyncing = true;
  block.scrollIntoView({ block: 'start' });
  window.setTimeout(() => {
    __ZenSyncing = false;
  }, 80);
}

window.addEventListener('message', (event) => {
  if (event.data?.type === '${markdownScrollMessageFromEditor}') __ZenScrollToLine(event.data.line);
  if (event.data?.type === '${markdownUpdateMessageFromEditor}') {
    __ZenRenderMarkdown(String(event.data.markdown || ''));
    __ZenScrollToLine(event.data.line);
  }
});

window.addEventListener('scroll', () => {
  if (__ZenSyncing) return;
  window.cancelAnimationFrame(__ZenScrollFrame);
  __ZenScrollFrame = window.requestAnimationFrame(() => {
    window.parent.postMessage({ type: '${markdownScrollMessageFromPreview}', line: __ZenActiveLine() }, '*');
  });
});

__ZenRenderMarkdown(__ZenMarkdown);
<\/script></body></html>`;
  }

  return content;
}

function addPreviewFavicon(html) {
  if (!html.includes('<title>')) return html;
  return html.replace(
    /(<title>.*?<\/title>)/i,
    '$1\n\t<link rel="icon" href="https://xy77.github.io/ico.svg" type="image/svg+xml">'
  );
}

function openPreviewPage(html, showMessage) {
  try {
    localStorage.setItem(previewStorageKey, addPreviewFavicon(html));
    window.open('/preview.html', '_blank', 'noopener');
  } catch {
    showMessage('预览失败：内容过长', true);
  }
}

function clampMarkdownPreviewRatio(ratio, container, handle) {
  const containerWidth = container.getBoundingClientRect().width;
  const handleWidth = handle?.getBoundingClientRect().width || 0;
  if (!containerWidth) return markdownPreviewDefaultEditorRatio;

  const maxRatioByPreviewWidth = ((containerWidth - handleWidth - markdownPreviewMinWidth) / containerWidth) * 100;
  const maxRatio = Math.min(markdownPreviewMaxEditorRatio, maxRatioByPreviewWidth);
  if (maxRatio < markdownPreviewMinEditorRatio) return Math.max(0, maxRatio);
  return Math.min(maxRatio, Math.max(markdownPreviewMinEditorRatio, ratio));
}

function createExternalLinkIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.classList.add('w-4', 'h-4');
  path.setAttribute('d', 'M14 3h7v7m0-7L10 14M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6');
  icon.appendChild(path);
  return icon;
}

function initMarkdownPreview({ editor, onVisibilityChange, showMessage }) {
  const container = document.getElementById('editor-container');
  const editorElement = document.getElementById('editor');
  let pane = null;
  let iframe = null;
  let handle = null;
  let openButton = null;
  let editorRatio = null;
  let isDragging = false;
  let isSyncingFromPreview = false;
  let isSyncingFromEditor = false;
  let syncingFromPreviewTimer = null;
  let syncingFromEditorTimer = null;
  let iframeLoaded = false;
  let pendingRefreshContent = null;

  function ensureElements() {
    if (pane && iframe && handle && openButton) return;

    handle = document.createElement('div');
    handle.id = 'md-preview-resizer';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.title = '拖拽调整编辑器和预览宽度';

    pane = document.createElement('div');
    pane.id = 'md-preview-pane';

    iframe = document.createElement('iframe');
    iframe.id = 'md-preview-frame';
    iframe.title = 'Markdown 预览';
    iframe.setAttribute('sandbox', 'allow-scripts');

    openButton = document.createElement('button');
    openButton.id = 'md-preview-open';
    openButton.type = 'button';
    openButton.title = '在新页面打开 Markdown 预览';
    openButton.setAttribute('aria-label', '在新页面打开 Markdown 预览');
    openButton.appendChild(createExternalLinkIcon());
    openButton.addEventListener('click', () => {
      openPreviewPage(buildPreviewHtml(editor.getValue()), showMessage);
    });

    pane.append(iframe, openButton);
    container.append(handle, pane);

    iframe.addEventListener('load', () => {
      iframeLoaded = true;
      if (pendingRefreshContent !== null) {
        postMarkdownUpdate(pendingRefreshContent);
        pendingRefreshContent = null;
        return;
      }
      syncPreviewToEditorLine(getEditorTopLine());
    });

    handle.addEventListener('pointerdown', (event) => {
      if (!container.classList.contains('has-md-preview')) return;
      isDragging = true;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('md-preview-resizing');
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      const nextRatio = ((event.clientX - rect.left) / rect.width) * 100;
      setRatio(nextRatio);
    });

    function stopDragging(event) {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('md-preview-resizing');
      if (event?.pointerId !== undefined && handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    }

    handle.addEventListener('pointerup', stopDragging);
    handle.addEventListener('pointercancel', stopDragging);
  }

  function setRatio(ratio) {
    editorRatio = clampMarkdownPreviewRatio(ratio, container, handle);
    editorElement.style.flexBasis = `${editorRatio}%`;
    editor.layout();
  }

  function show(content) {
    ensureElements();
    if (editorRatio === null) editorRatio = markdownPreviewDefaultEditorRatio;
    container.classList.add('has-md-preview');
    onVisibilityChange?.(true);
    setRatio(editorRatio);
    iframeLoaded = false;
    pendingRefreshContent = null;
    iframe.srcdoc = buildPreviewHtml(content);
  }

  function refresh(content) {
    if (!iframe || !container.classList.contains('has-md-preview')) return;
    if (!iframeLoaded) {
      pendingRefreshContent = content;
      return;
    }
    postMarkdownUpdate(content);
  }

  function getEditorTopLine() {
    return editor.getVisibleRanges()[0]?.startLineNumber || 1;
  }

  function syncPreviewToEditorLine(line) {
    if (!iframe?.contentWindow || !container.classList.contains('has-md-preview') || isSyncingFromPreview) return;
    isSyncingFromEditor = true;
    iframe.contentWindow.postMessage({ type: markdownScrollMessageFromEditor, line }, '*');
    clearTimeout(syncingFromEditorTimer);
    syncingFromEditorTimer = setTimeout(() => {
      isSyncingFromEditor = false;
    }, 120);
  }

  function postMarkdownUpdate(content) {
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: markdownUpdateMessageFromEditor, markdown: content, line: getEditorTopLine() },
      '*'
    );
  }

  function syncEditorToPreviewLine(line) {
    if (!container.classList.contains('has-md-preview') || isSyncingFromEditor) return;
    isSyncingFromPreview = true;
    editor.revealLineNearTop(Math.max(1, Number(line || 1)));
    clearTimeout(syncingFromPreviewTimer);
    syncingFromPreviewTimer = setTimeout(() => {
      isSyncingFromPreview = false;
    }, 120);
  }

  function hide() {
    if (!container.classList.contains('has-md-preview')) return;
    container.classList.remove('has-md-preview');
    onVisibilityChange?.(false);
    editorElement.style.flexBasis = '';
    editor.layout();
  }

  window.addEventListener('resize', () => {
    if (!container.classList.contains('has-md-preview')) return;
    setRatio(editorRatio ?? markdownPreviewDefaultEditorRatio);
  });

  editor.onDidScrollChange((event) => {
    if (!event.scrollTopChanged) return;
    syncPreviewToEditorLine(getEditorTopLine());
  });

  window.addEventListener('message', (event) => {
    if (event.source !== iframe?.contentWindow || event.data?.type !== markdownScrollMessageFromPreview) return;
    syncEditorToPreviewLine(event.data.line);
  });

  return { hide, isVisible: () => container.classList.contains('has-md-preview'), refresh, show };
}

function fallbackCopy(text, editor) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = 'position:fixed;left:-9999px;';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  editor.focus();
  return copied;
}

function initDownload({ editor, showMessage, getContent, getFormattedCode }) {
  const button = document.getElementById('download-btn');
  const modal = document.getElementById('download-modal');
  const filename = document.getElementById('download-filename');
  const cancel = document.getElementById('download-cancel');
  const confirm = document.getElementById('download-confirm');
  const extensionLabel = document.getElementById('download-ext-label');

  button.addEventListener('click', () => {
    const content = getContent();
    if (!content.trim()) return showMessage('不能为空', true);
    const type = detectType(content);
    extensionLabel.textContent = type === 'markdown' ? '.md' : type === 'json' ? '.json' : '.html';
    modal.classList.replace('hidden', 'flex');
    setTimeout(() => filename.focus(), 100);
  });

  cancel.addEventListener('click', () => {
    modal.classList.replace('flex', 'hidden');
    filename.value = '';
  });

  confirm.addEventListener('click', () => {
    const content = getContent();
    const type = detectType(content);
    const extension = type === 'markdown' ? '.md' : type === 'json' ? '.json' : '.html';
    const name = filename.value.trim().replace(/[^a-zA-Z0-9.+\-]/g, '') || 'index';
    const finalName = `${name}${extension}`;
    const finalContent = ['markdown', 'json'].includes(type) ? content : getFormattedCode();
    const mimeType = type === 'markdown' ? 'text/markdown' : type === 'json' ? 'application/json' : 'text/html';

    try {
      const url = URL.createObjectURL(new Blob([finalContent], { type: mimeType }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = finalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      modal.classList.replace('flex', 'hidden');
      filename.value = '';
      showMessage(`正在下载：${finalName}`);
    } catch {
      showMessage('下载失败', true);
    }
  });

  editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyD, () => button.click());
}

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function initFileDrop({ editor, showMessage }) {
  let dragDepth = 0;

  function preventFileDrag(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  window.addEventListener(
    'dragenter',
    (event) => {
      if (!isFileDrag(event)) return;
      dragDepth += 1;
      document.body.classList.add('file-dragging');
      preventFileDrag(event);
    },
    true
  );
  window.addEventListener('dragover', preventFileDrag, true);
  window.addEventListener(
    'dragleave',
    (event) => {
      if (!isFileDrag(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) document.body.classList.remove('file-dragging');
    },
    true
  );
  window.addEventListener(
    'drop',
    (event) => {
      if (!isFileDrag(event)) return;
      preventFileDrag(event);
      dragDepth = 0;
      document.body.classList.remove('file-dragging');

      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', (loadEvent) => {
        editor.setValue(String(loadEvent.target?.result || ''));
        showMessage(`成功载入本地文件: ${file.name}`);
      });
      reader.readAsText(file);
    },
    true
  );
}

function initMarkdownInsertMenu({ editor, isActive }) {
  const snippets = [
    { label: '加粗', before: '**', after: '**' },
    { label: '斜体', before: '*', after: '*' },
    { label: '标签', before: '`', after: '`' },
    { label: '删除线', before: '~~', after: '~~' },
    { label: '空格', text: '&nbsp;' },
    { label: '分隔线', text: '---\n' },
    {
      label: '表格',
      text: '| 表头1 | 表头2 |\n| --- | --- |\n| 单元格1 | 单元格2 |'
    }
  ];
  const menu = document.createElement('div');
  let lastContextMenuPoint = null;

  menu.id = 'md-insert-menu';
  menu.className = 'hidden';
  document.body.appendChild(menu);

  function close() {
    menu.classList.add('hidden');
    menu.replaceChildren();
  }

  function getInsertedCursorSelection(range, text, offset) {
    const model = editor.getModel();
    if (!model) return null;
    const end = model.getPositionAt(model.getOffsetAt(range.getStartPosition()) + (offset ?? text.length));
    return new window.monaco.Selection(end.lineNumber, end.column, end.lineNumber, end.column);
  }

  function insertSnippet(snippet) {
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    const text =
      snippet.text === undefined ? `${snippet.before}${selectedText}${snippet.after}` : snippet.text;
    const cursorOffset =
      snippet.text === undefined ? snippet.before.length + selectedText.length : snippet.text.length;

    editor.executeEdits('markdown-insert-menu', [
      {
        range: selection,
        text,
        forceMoveMarkers: true
      }
    ]);
    const nextSelection = getInsertedCursorSelection(selection, text, cursorOffset);
    if (nextSelection) editor.setSelection(nextSelection);
    editor.focus();
    close();
  }

  function open(anchorPoint = null) {
    if (!isActive()) return;
    const point = anchorPoint || lastContextMenuPoint || {
      x: editor.getDomNode().getBoundingClientRect().left + 24,
      y: editor.getDomNode().getBoundingClientRect().top + 24
    };

    menu.replaceChildren();
    snippets.forEach((snippet) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = snippet.label;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        insertSnippet(snippet);
      });
      menu.appendChild(button);
    });

    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    const left = Math.min(point.x + 16, window.innerWidth - rect.width - 8);
    const top = Math.min(point.y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  editor.getDomNode().addEventListener(
    'contextmenu',
    (event) => {
      lastContextMenuPoint = { x: event.clientX, y: event.clientY };
      close();
    },
    true
  );
  document.addEventListener('pointerdown', (event) => {
    if (!menu.contains(event.target)) close();
  });
  document.addEventListener('mouseover', (event) => {
    if (!isActive()) return;
    const item = event.target.closest('.action-item, [role="menuitem"]');
    if (!item || !item.textContent || item.textContent.trim() !== '插入') return;
    const rect = item.getBoundingClientRect();
    open({ x: rect.right - 8, y: rect.top });
  });
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);

  return { close, open };
}

export async function initEditor({ showMessage, onShare }) {
  if (!window.require?.config) throw new Error('Monaco Editor 加载器不可用');
  window.require.config({
    paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' },
    'vs/nls': { availableLanguages: { '*': 'zh-cn' } }
  });

  const editor = await new Promise((resolve, reject) => {
    window.require(
      ['vs/editor/editor.main'],
      () => {
        const instance = window.monaco.editor.create(document.getElementById('editor'), {
          value: localStorage.getItem(editorStorageKey) || '',
          language: 'html',
          theme: 'vs',
          automaticLayout: true,
          minimap: { enabled: true },
          wordWrap: 'off',
          fontSize: 16,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          scrollBeyondLastLine: false,
          roundedSelection: true,
          renderWhitespace: 'none',
          showFoldingControls: 'always'
        });
        resolve(instance);
      },
      reject
    );
  });

  const getContent = () => editor.getValue();
  const getFormattedCode = () => buildPreviewHtml(getContent());
  const minimapKey = editor.createContextKey('minimapEnabled', true);
  const wordWrapKey = editor.createContextKey('wordWrapEnabled', false);
  const jsonContentKey = editor.createContextKey('jsonContent', detectType(getContent()) === 'json');
  const markdownPreviewVisibleKey = editor.createContextKey('markdownPreviewVisible', false);
  let isMarkdownPreviewVisible = false;
  const markdownInsertMenu = initMarkdownInsertMenu({
    editor,
    isActive: () => isMarkdownPreviewVisible
  });
  const markdownPreview = initMarkdownPreview({
    editor,
    onVisibilityChange(isVisible) {
      isMarkdownPreviewVisible = isVisible;
      markdownPreviewVisibleKey.set(isVisible);
      if (!isVisible) markdownInsertMenu.close();
    },
    showMessage
  });
  let isComposing = false;

  function refreshMarkdownPreview(value = getContent(), type = detectType(value)) {
    if (!markdownPreview.isVisible() || isComposing || type !== 'markdown') return;
    markdownPreview.refresh(value);
  }

  const editorDomNode = editor.getDomNode();
  editorDomNode.addEventListener(
    'compositionstart',
    () => {
      isComposing = true;
    },
    true
  );
  editorDomNode.addEventListener(
    'compositionend',
    () => {
      isComposing = false;
      setTimeout(() => refreshMarkdownPreview(), 0);
    },
    true
  );

  editor.addAction({
    id: 'share-editor-content-cn',
    label: '分享',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: -1,
    run: onShare
  });
  editor.addAction({
    id: 'insert-markdown-content',
    label: '插入',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: -0.9,
    precondition: 'markdownPreviewVisible',
    run() {
      markdownInsertMenu.open();
    }
  });
  editor.addAction({
    id: 'expand-all-json-content',
    label: '全部展开',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: -0.8,
    precondition: 'jsonContent',
    run(instance) {
      instance.getAction('editor.unfoldAll')?.run();
    }
  });
  editor.addAction({
    id: 'collapse-all-json-content',
    label: '全部折叠',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: -0.7,
    precondition: 'jsonContent',
    run(instance) {
      instance.getAction('editor.foldAll')?.run();
    }
  });
  editor.addAction({
    id: 'enable-word-wrap-cn',
    label: '自动换行',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: 0,
    precondition: '!wordWrapEnabled',
    run(instance) {
      instance.updateOptions({ wordWrap: 'on' });
      wordWrapKey.set(true);
    }
  });
  editor.addAction({
    id: 'disable-word-wrap-cn',
    label: '关闭自动换行',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: 0,
    precondition: 'wordWrapEnabled',
    run(instance) {
      instance.updateOptions({ wordWrap: 'off' });
      wordWrapKey.set(false);
    }
  });
  editor.addAction({
    id: 'hide-minimap-cn',
    label: '隐藏缩略图',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: 1,
    precondition: 'minimapEnabled',
    run(instance) {
      instance.updateOptions({ minimap: { enabled: false } });
      minimapKey.set(false);
    }
  });
  editor.addAction({
    id: 'show-minimap-cn',
    label: '显示缩略图',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: 2,
    precondition: '!minimapEnabled',
    run(instance) {
      instance.updateOptions({ minimap: { enabled: true } });
      minimapKey.set(true);
    }
  });
  editor.addAction({
    id: 'clear-all-and-paste',
    label: '清空所有并粘贴',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: 3,
    async run(instance) {
      try {
        instance.setValue((await navigator.clipboard.readText()) || '');
      } catch {
        instance.setValue('');
        showMessage('无法直接访问剪贴板，已清空内容。请手动粘贴。', true);
      }
    }
  });
  editor.addAction({
    id: 'clear-all-content',
    label: '清空所有',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: 4,
    run(instance) {
      instance.setValue('');
    }
  });
  editor.addAction({
    id: 'select-all-and-copy',
    label: '全选并复制',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: 5,
    async run(instance) {
      const model = instance.getModel();
      if (!model) return showMessage('复制失败', true);
      instance.setSelection(model.getFullModelRange());
      instance.focus();
      const text = instance.getValue();
      if (!text) return showMessage('内容为空', true);
      try {
        await navigator.clipboard.writeText(text);
        showMessage('已全选并复制');
      } catch {
        const copied = fallbackCopy(text, instance);
        showMessage(copied ? '已全选并复制' : '复制失败，请手动复制', !copied);
      }
    }
  });

  editor.onDidChangeModelContent(() => {
    const value = getContent();
    localStorage.setItem(editorStorageKey, value);
    const type = detectType(value);
    window.monaco.editor.setModelLanguage(editor.getModel(), ['markdown', 'json'].includes(type) ? type : 'html');
    jsonContentKey.set(type === 'json');
    refreshMarkdownPreview(value, type);
  });

  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const currentSize = editor.getOption(window.monaco.editor.EditorOption.fontSize);
      if (event.key === '=' || event.key === '+') editor.updateOptions({ fontSize: Math.min(44, currentSize + 2) });
      else if (event.key === '-') editor.updateOptions({ fontSize: Math.max(8, currentSize - 2) });
      else if (event.key === '0') editor.updateOptions({ fontSize: 16 });
      else return;
      event.preventDefault();
    },
    true
  );

  initFileDrop({ editor, showMessage });

  const previewButton = document.getElementById('preview-btn');
  previewButton.addEventListener('click', () => {
    const content = getContent();
    if (!content.trim()) return showMessage('代码为空', true);
    const type = detectType(content);
    if (type === 'json') {
      markdownPreview.hide();
      try {
        editor.setValue(JSON.stringify(JSON.parse(content), null, 4));
        showMessage('JSON 已格式化');
      } catch {
        showMessage('JSON 格式错误，请根据编辑器红线提示修正后再试', true);
      }
      return;
    }

    if (type === 'markdown') {
      markdownPreview.show(content);
      showMessage('Markdown 预览已更新');
      return;
    }

    markdownPreview.hide();
    openPreviewPage(getFormattedCode(), showMessage);
  });
  editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => previewButton.click());

  initDownload({ editor, showMessage, getContent, getFormattedCode });
  editor.focus();

  return { instance: editor, getContent, getFormattedCode };
}
