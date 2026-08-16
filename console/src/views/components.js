import { encodePagePath } from "../api-client.js";
import { escapeHtml, escapeAttr } from "../lib/escape.js";

export function componentPreviewPage({ html }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="nord">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component preview</title>
  <link rel="stylesheet" href="/static/css/daisyui@5.css">
  <script src="/static/js/browser@4.js"></script>
  <link rel="stylesheet" href="/static/css/themes.css">
</head>
<body class="bg-base-200 min-h-screen p-6">
${html}
</body>
</html>`;
}

function componentHref(name) {
  return `/components/${encodePagePath(name)}`;
}

function previewHref(name) {
  return `/components/preview/${encodePagePath(name)}`;
}

export function componentsPage({ components, selected, selectedHtml, selectedError }) {
  const rows = components
    .map((name) => {
      const isSelected = name === selected;
      return `<li class="list-row items-center ${isSelected ? "bg-base-200" : ""}" data-component-row data-name="${escapeAttr(name.toLowerCase())}">
        <div class="min-w-0">
          <a class="link link-hover font-mono text-sm" href="${escapeAttr(componentHref(name))}">${escapeHtml(name)}</a>
        </div>
        <div class="flex items-center justify-end gap-1">
          <a class="btn btn-ghost btn-xs" href="${escapeAttr(previewHref(name))}" target="_blank" rel="noopener noreferrer">Preview</a>
          <a class="btn btn-ghost btn-xs ${isSelected ? "btn-active" : ""}" href="${escapeAttr(componentHref(name))}">Source</a>
        </div>
      </li>`;
    })
    .join("");

  let detailPanel = "";
  if (selected) {
    if (selectedError) {
      detailPanel = `<div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body">
          <h2 class="card-title text-base font-mono">${escapeHtml(selected)}</h2>
          <div role="alert" class="alert alert-error"><span>${escapeHtml(selectedError)}</span></div>
        </div>
      </div>`;
    } else if (selectedHtml) {
      detailPanel = `<div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="card-title text-base">
              <span class="font-mono">${escapeHtml(selected)}</span>
              <span class="badge badge-ghost badge-sm">read-only</span>
            </h2>
            <div class="flex items-center gap-1">
              <a class="btn btn-primary btn-outline btn-xs" href="${escapeAttr(previewHref(selected))}" target="_blank" rel="noopener noreferrer">Open preview</a>
              <a class="btn btn-ghost btn-xs" href="/components" aria-label="Close source view">Close</a>
            </div>
          </div>
          <p class="text-sm text-base-content/60">Components are immutable after creation. Insert via Open WebUI MCP tools.</p>
          <pre class="max-h-96 overflow-x-auto whitespace-pre-wrap break-words rounded-box bg-base-200 p-4 font-mono text-xs"><code>${escapeHtml(selectedHtml.html)}</code></pre>
        </div>
      </div>`;
    }
  }

  return `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">Components</h1>
          <p class="mt-1 text-sm text-base-content/60">Read-only catalogue of reusable website components.</p>
        </div>
        <label class="input input-sm w-full max-w-xs bg-base-100">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 opacity-50"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input type="search" placeholder="Filter components…" data-component-filter />
        </label>
      </div>
      ${detailPanel}
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <ul class="list" data-component-list>
          <li class="p-4 pb-2 text-xs uppercase tracking-wide text-base-content/50">
            ${components.length} component${components.length === 1 ? "" : "s"} in the library
          </li>
          ${rows.length ? rows : `<li class="list-row"><span class="text-base-content/60">No components in the library.</span></li>`}
          <li class="hidden p-4 text-sm text-base-content/60" data-component-empty>No components match the filter.</li>
        </ul>
      </div>
    </div>`;
}
