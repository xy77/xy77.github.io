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
  const minimap = document.getElementById('minimap');
  const mapImage = document.getElementById('map-image');
  const mapViewport = document.getElementById('map-viewport');
  let mapUrl = null;
  let pan = { x: 0, y: 0 };
  let drag = null;
  let mapDrag = null;
  let mapScale = 1;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function layout() {
    if (!dimensions) { minimap.hidden = true; return; }
    const width = dimensions.width * zoom / 100;
    const height = dimensions.height * zoom / 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const baseX = (vw - width) / 2;
    let x = baseX + pan.x;
    let y = 64 + pan.y;
    if (!embedded) {
      x = clamp(x, vw * .05 - width, vw * .95);
      y = clamp(y, vh * .05 - height, vh * .95);
      pan = { x: x - baseX, y: y - 64 };
    }
    diagram.style.transform = `translate(${x}px, ${y}px)`;
    minimap.hidden = embedded || (width <= vw && height <= vh);
    if (minimap.hidden) return;
    // Use stable diagram coordinates, including every allowed viewport position.
    const left = -.95 * vw, top = -.95 * vh;
    const worldWidth = width + 1.9 * vw;
    const worldHeight = height + 1.9 * vh;
    const scale = Math.min(280 / worldWidth, 180 / worldHeight);
    mapScale = scale;
    const ox = (300 - worldWidth * scale) / 2;
    const oy = (200 - worldHeight * scale) / 2;
    Object.assign(mapImage.style, { left: `${ox - left * scale}px`, top: `${oy - top * scale}px`, width: `${width * scale}px`, height: `${height * scale}px` });
    Object.assign(mapViewport.style, { left: `${ox + (-x - left) * scale}px`, top: `${oy + (-y - top) * scale}px`, width: `${vw * scale}px`, height: `${vh * scale}px` });
  }
  mapViewport.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    mapDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y, scale: mapScale };
    mapViewport.setPointerCapture(event.pointerId);
    mapViewport.classList.add('dragging');
  });
  mapViewport.addEventListener('pointermove', event => {
    if (!mapDrag || mapDrag.id !== event.pointerId) return;
    pan = {
      x: mapDrag.startX - (event.clientX - mapDrag.x) / mapDrag.scale,
      y: mapDrag.startY - (event.clientY - mapDrag.y) / mapDrag.scale
    };
    layout();
  });
  function stopMapDrag() {
    const previous = mapDrag;
    mapDrag = null;
    if (previous && mapViewport.hasPointerCapture(previous.id)) mapViewport.releasePointerCapture(previous.id);
    mapViewport.classList.remove('dragging');
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) mapViewport.addEventListener(name, stopMapDrag);
  window.addEventListener('blur', stopMapDrag);
  window.addEventListener('resize', stopMapDrag);
  function updateMapImage(svg) {
    if (mapUrl) URL.revokeObjectURL(mapUrl);
    mapUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    mapImage.src = mapUrl;
  }
  const dragSurface = document.body;
  dragSurface.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('#toolbar, #minimap, text, tspan, foreignObject')) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y };
    dragSurface.setPointerCapture(event.pointerId);
    dragSurface.classList.add('dragging');
  });
  dragSurface.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    pan = { x: drag.startX + event.clientX - drag.x, y: drag.startY + event.clientY - drag.y };
    layout();
  });
  function stopDrag() {
    const previous = drag;
    drag = null;
    if (previous && dragSurface.hasPointerCapture(previous.id)) dragSurface.releasePointerCapture(previous.id);
    dragSurface.classList.remove('dragging');
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) dragSurface.addEventListener(name, stopDrag);
  window.addEventListener('blur', stopDrag);
  window.addEventListener('resize', layout);
  window.addEventListener('scroll', layout);

  function resize() {
    stopMapDrag();
    const svg = diagram.querySelector('svg');
    if (svg && dimensions) {
      svg.style.maxWidth = 'none';
      svg.style.width = `${dimensions.width * zoom / 100}px`;
      svg.style.height = `${dimensions.height * zoom / 100}px`;
    }
    const select = document.getElementById('zoom');
    select.querySelector('[data-custom]')?.remove();
    if (![50, 100, 150, 200, 300].includes(zoom)) {
      const option = new Option(`${zoom}%`, String(zoom));
      option.dataset.custom = 'true';
      option.hidden = true;
      select.add(option);
    }
    select.value = String(zoom);
    layout();
  }
  document.getElementById('zoom').onchange = event => { zoom = Number(event.target.value); resize(); };
  function changeZoom(delta) {
    zoom = Math.max(50, Math.min(300, zoom + delta));
    resize();
  }
  document.getElementById('plus').onclick = () => changeZoom(20);
  document.getElementById('minus').onclick = () => changeZoom(-20);
  window.addEventListener('wheel', event => {
    if (!event.deltaY && !event.deltaX) return;
    if (!(event.ctrlKey || event.metaKey)) {
      if (!dimensions) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      pan.x -= event.deltaX * unit;
      pan.y -= event.deltaY * unit;
      layout();
      return;
    }
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
  const copyButton = document.getElementById('copy');
  const copyIcon = copyButton.innerHTML;
  copyButton.onclick = async () => {
    if (copyButton.getAttribute('aria-busy') === 'true') return;
    copyButton.innerHTML = '<svg class="spinner" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-8-8"/></svg>';
    copyButton.setAttribute('aria-busy', 'true');
    let timeout;
    try {
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('当前浏览器不支持复制图片');
      await Promise.race([
        navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob() })]),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 15000); })
      ]);
      copyButton.innerHTML = copyIcon;
      copyButton.removeAttribute('aria-busy');
    } catch {
      // Keep the loading icon on failure, as requested.
    } finally {
      clearTimeout(timeout);
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
      updateMapImage(svg);
      resize();
      status.textContent = '';
      report(content);
    } catch (error) {
      if (version !== revision) return;
      diagram.replaceChildren();
      dimensions = null;
      layout();
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
