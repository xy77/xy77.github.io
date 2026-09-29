import runtimeSource from './mermaid-runtime.js?raw';

export function isMermaidContent(text) {
  return /^\s*(?:```mermaid\b|(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|quadrantChart|sankey-beta|requirementDiagram|xychart-beta|block-beta|packet-beta|architecture-beta|kanban)\b)/i.test(text);
}


export function buildMermaidPreview(content) {
  const source = JSON.stringify(content).replace(/</g, '\\u003c');
  const icon = path => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">${path}</svg>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mermaid 预览</title><style>
body{margin:0;padding:64px 24px 24px;background:white;color:#334155;font:14px system-ui}#diagram{width:max-content;min-width:100%}#toolbar{position:fixed;right:16px;top:16px;display:flex;align-items:center;gap:8px;padding:6px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;z-index:10}#toolbar[hidden]{display:none}button{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:6px;background:#f1f5f9;color:#334155;cursor:pointer}button:hover{background:#e2e8f0}#status{white-space:pre-wrap;overflow-wrap:anywhere}#zoom{min-width:44px;text-align:center}
</style></head><body><nav id="toolbar" aria-label="图表工具"><button id="copy" title="复制图片" aria-label="复制图片">${icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>')}</button><button id="minus" title="缩小 20%" aria-label="缩小">${icon('<path d="M5 12h14"/>')}</button><span id="zoom">100%</span><button id="plus" title="放大 20%" aria-label="放大">${icon('<path d="M5 12h14M12 5v14"/>')}</button></nav><main id="diagram"></main><p id="status" role="status">正在加载图表…</p><script type="module">(${runtimeSource})(${source});</script></body></html>`;
}
