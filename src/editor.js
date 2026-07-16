const editorStorageKey = 'zen_editor_content';
const previewStorageKey = 'zen_preview_html';

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
    const escapedMarkdown = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Markdown 预览</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css"><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script><style>.markdown-body{box-sizing:border-box;min-width:200px;max-width:980px;margin:0 auto;padding:45px}@media(max-width:767px){.markdown-body{padding:15px}}</style></head><body class="markdown-body"><div id="content"></div><script>document.getElementById('content').innerHTML=marked.parse(\`${escapedMarkdown}\`);<\/script></body></html>`;
  }

  return content;
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
          renderWhitespace: 'none'
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

  editor.addAction({
    id: 'share-editor-content-cn',
    label: '分享',
    contextMenuGroupId: '0_custom_top',
    contextMenuOrder: -1,
    run: onShare
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

  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', (loadEvent) => {
      editor.setValue(loadEvent.target.result);
      showMessage(`成功载入本地文件: ${file.name}`);
    });
    reader.readAsText(file);
  });

  const previewButton = document.getElementById('preview-btn');
  previewButton.addEventListener('click', () => {
    const content = getContent();
    if (!content.trim()) return showMessage('代码为空', true);
    if (detectType(content) === 'json') {
      try {
        editor.setValue(JSON.stringify(JSON.parse(content), null, 4));
        showMessage('JSON 已格式化');
      } catch {
        showMessage('JSON 格式错误，请根据编辑器红线提示修正后再试', true);
      }
      return;
    }

    let html = getFormattedCode();
    if (html.includes('<title>')) {
      html = html.replace(
        /(<title>.*?<\/title>)/i,
        '$1\n\t<link rel="icon" href="https://xy77.github.io/ico.svg" type="image/svg+xml">'
      );
    }
    try {
      localStorage.setItem(previewStorageKey, html);
      window.open('/preview.html', '_blank', 'noopener');
    } catch {
      showMessage('预览失败：内容过长', true);
    }
  });
  editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => previewButton.click());

  initDownload({ editor, showMessage, getContent, getFormattedCode });
  editor.focus();

  return { instance: editor, getContent, getFormattedCode };
}
