// This function runs inside the generated preview document.
async function runMermaidPreview(initialContent) {
  const diagram = document.getElementById('diagram');
  const status = document.getElementById('status');
  let mermaid;
  let current = initialContent;
  let revision = 0;
  let timer;
  let zoom = 100;
  let dimensions = null;
  let queue = Promise.resolve();
  const embedded = window.parent !== window;
  document.getElementById('toolbar').hidden = embedded;

  function resize() {
    const svg = diagram.querySelector('svg');
    if (svg && dimensions) {
      svg.style.maxWidth = 'none';
      svg.style.width = `${dimensions.width * zoom / 100}px`;
      svg.style.height = `${dimensions.height * zoom / 100}px`;
    }
    document.getElementById('zoom').textContent = `${zoom}%`;
  }
  function changeZoom(delta) {
    zoom = Math.max(50, Math.min(300, zoom + delta));
    resize();
  }
  document.getElementById('plus').onclick = () => changeZoom(20);
  document.getElementById('minus').onclick = () => changeZoom(-20);
  window.addEventListener('wheel', event => {
    if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 20 : -20);
  }, { passive: false });

  async function imageBlob() {
    const svg = diagram.querySelector('svg')?.cloneNode(true);
    if (!svg || !dimensions) throw new Error('没有可复制的图');
    const width = Math.ceil(dimensions.width);
    const height = Math.ceil(dimensions.height);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败')), 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  document.getElementById('copy').onclick = async () => {
    try {
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('当前浏览器不支持复制图片');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob() })]);
      status.textContent = '图片已复制';
    } catch (error) {
      status.textContent = `复制失败：${error.message}`;
    }
  };

  function report(content, error = null) {
    if (embedded) window.parent.postMessage({ type: 'zen-mermaid-result', content, error }, '*');
  }
  async function render(content, version) {
    if (!mermaid || version !== revision) return;
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    let offset = 0;
    while (lines.length && !lines[0].trim()) { lines.shift(); offset++; }
    if (/^\s*```mermaid\b/i.test(lines[0] || '')) {
      lines.shift(); offset++;
      while (lines.length && !lines.at(-1).trim()) lines.pop();
      if (/^\s*```\s*$/.test(lines.at(-1) || '')) lines.pop();
    }
    try {
      const source = lines.join('\n');
      await mermaid.parse(source);
      const result = await mermaid.render(`mermaid-${version}`, source);
      if (version !== revision) return;
      diagram.innerHTML = result.svg;
      const svg = diagram.querySelector('svg');
      const box = svg.viewBox.baseVal;
      const rect = svg.getBoundingClientRect();
      dimensions = { width: box.width || rect.width || 800, height: box.height || rect.height || 600 };
      resize();
      status.textContent = '';
      report(content);
    } catch (error) {
      if (version !== revision) return;
      diagram.replaceChildren();
      dimensions = null;
      const message = error.message || String(error);
      const location = error.hash?.loc;
      const line = location?.first_line ?? Number(message.match(/line\s+(\d+)/i)?.[1] || 1);
      status.textContent = message;
      report(content, { message, line: offset + line });
    }
  }
  function schedule(content) {
    current = content;
    const version = ++revision;
    clearTimeout(timer);
    timer = setTimeout(() => {
      queue = queue.then(() => render(content, version));
    }, 200);
  }
  window.addEventListener('message', event => {
    if (event.source === window.parent && event.data?.type === 'zen-md-editor-update') schedule(String(event.data.markdown || ''));
  });
  try {
    // The import executes in a standalone document, without Vite's preload helpers.
    const moduleUrl = 'https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.esm.min.mjs';
    mermaid = (await import(/* @vite-ignore */ moduleUrl)).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false }, suppressErrorRendering: true });
    schedule(current);
  } catch {
    status.textContent = 'Mermaid 加载失败，请检查网络后重新预览';
  }
}

