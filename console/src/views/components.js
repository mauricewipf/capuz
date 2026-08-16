import { encodePagePath } from "../api-client.js";
import { escapeHtml, escapeAttr } from "../lib/escape.js";

export function componentPreviewPage({ html }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component preview</title>
  <link rel="stylesheet" href="/static/css/daisyui.css">
</head>
<body class="bg-base-200 min-h-screen p-4">
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
      const rowClass = isSelected ? "active" : "";
      return `<tr class="${rowClass}">
        <td class="font-mono text-sm">
          <a href="${escapeAttr(componentHref(name))}">${escapeHtml(name)}</a>
        </td>
        <td class="text-right">
          <div class="join join-horizontal">
            <a class="btn btn-ghost btn-xs join-item" href="${escapeAttr(previewHref(name))}" target="_blank" rel="noopener noreferrer">Preview</a>
            <a class="btn btn-ghost btn-xs join-item" href="${escapeAttr(componentHref(name))}">Source</a>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  let detailPanel = "";
  if (selected) {
    if (selectedError) {
      detailPanel = `<div class="card bg-base-100 shadow-sm mt-6">
        <div class="card-body">
          <h2 class="card-title text-lg">${escapeHtml(selected)}</h2>
          <div class="alert alert-error"><span>${escapeHtml(selectedError)}</span></div>
        </div>
      </div>`;
    } else if (selectedHtml) {
      detailPanel = `<div class="card bg-base-100 shadow-sm mt-6">
        <div class="card-body">
          <div class="flex flex-wrap justify-between items-center gap-2">
            <h2 class="card-title text-lg">${escapeHtml(selected)}</h2>
            <div class="flex items-center gap-2">
              <span class="badge badge-ghost">read-only</span>
              <a
                class="btn btn-sm btn-outline"
                href="${escapeAttr(previewHref(selected))}"
                target="_blank"
                rel="noopener noreferrer"
              >Open preview</a>
            </div>
          </div>
          <p class="text-sm text-base-content/60">Components are immutable after creation. Insert via Open WebUI MCP tools.</p>
          <pre class="bg-base-200 p-4 rounded-lg text-xs overflow-x-auto max-h-96 whitespace-pre-wrap break-words"><code>${escapeHtml(selectedHtml.html)}</code></pre>
        </div>
      </div>`;
    }
  }

  return `
    <div class="flex flex-col gap-4">
      <div>
        <h1 class="text-2xl font-bold">Components</h1>
        <p class="text-base-content/60 text-sm mt-1">Read-only catalogue (${components.length}). Website components cannot be edited from the console.</p>
      </div>
      <div class="overflow-x-auto bg-base-100 rounded-box shadow-sm">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Component</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : `<tr><td colspan="2" class="text-center text-base-content/60">No components in the library.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${detailPanel}
    </div>`;
}
