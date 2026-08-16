import { config, previewPageUrl } from "../config.js";
import { componentFrameCsp } from "../lib/security-headers.js";
import { escapeHtml, escapeAttr } from "../lib/escape.js";

function buildFrameDoc(innerHtml, siteBaseUrl) {
  const csp = componentFrameCsp(siteBaseUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${escapeAttr(siteBaseUrl)}/assets/css/daisyui@5.css">
  <link rel="stylesheet" href="${escapeAttr(siteBaseUrl)}/assets/css/themes.css">
</head>
<body class="p-4">
${innerHtml}
</body>
</html>`;
}

export function componentsPage({ components, selected, selectedHtml }) {
  const list = components
    .map((name) => {
      const active = name === selected ? "menu-active" : "";
      return `<li><a class="${active}" href="/components?name=${escapeAttr(name)}">${escapeHtml(name)}</a></li>`;
    })
    .join("");

  let detail = "";
  if (selected && selectedHtml) {
    const frameDoc = buildFrameDoc(selectedHtml.html, config.siteBaseUrl);
    detail = `
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <div class="flex justify-between items-center gap-2">
            <h2 class="card-title">${escapeHtml(selected)}</h2>
            <span class="badge badge-ghost">read-only</span>
          </div>
          <p class="text-sm text-base-content/60">Components are immutable after creation. Insert via Open WebUI MCP tools.</p>
          <div class="tabs tabs-boxed bg-base-200 mt-2">
            <button type="button" class="tab tab-active" data-tab="preview">Preview</button>
            <button type="button" class="tab" data-tab="source">Source</button>
          </div>
          <div class="mt-4" data-tab-panel="preview">
            <iframe
              class="w-full border border-base-300 rounded-lg bg-base-200"
              sandbox=""
              title="Component preview"
              srcdoc="${escapeAttr(frameDoc)}"
              style="min-height: 12rem;"
            ></iframe>
          </div>
          <div class="mt-4 hidden" data-tab-panel="source">
            <pre class="bg-base-200 p-4 rounded-lg text-xs overflow-x-auto max-h-96"><code>${escapeHtml(selectedHtml.html)}</code></pre>
          </div>
        </div>
      </div>`;
  } else if (components.length === 0) {
    detail = `<div class="alert"><span>No components in the library.</span></div>`;
  } else {
    detail = `<div class="alert alert-info"><span>Select a component from the list.</span></div>`;
  }

  return `
    <div class="flex flex-col gap-4">
      <div>
        <h1 class="text-2xl font-bold">Components</h1>
        <p class="text-base-content/60 text-sm mt-1">Read-only catalogue. Website components cannot be edited from the console.</p>
      </div>
      <div class="grid lg:grid-cols-[14rem_1fr] gap-4">
        <aside class="bg-base-100 rounded-box shadow-sm p-2">
          <ul class="menu menu-sm">${list || "<li class=\"text-base-content/50\">No components</li>"}</ul>
        </aside>
        <div>${detail}</div>
      </div>
    </div>`;
}
