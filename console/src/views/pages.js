import { livePageUrl, previewPageUrl } from "../config.js";
import { escapeHtml, escapeAttr } from "../lib/escape.js";

function statusBadge(status) {
  switch (status) {
    case "published":
      return `<span class="badge badge-success">Published</span>`;
    case "modified":
      return `<span class="badge badge-warning">Changes</span>`;
    case "draft":
      return `<span class="badge badge-neutral">Draft</span>`;
    default:
      return `<span class="badge">${escapeHtml(status)}</span>`;
  }
}

function canPublish(status) {
  return status === "draft" || status === "modified";
}

function canDiscard(status) {
  return status === "draft" || status === "modified";
}

export function pagesPage({ pages, filter, diffPath, diff, csrfToken }) {
  const counts = {
    all: pages.length,
    published: pages.filter((p) => p.status === "published").length,
    modified: pages.filter((p) => p.status === "modified").length,
    draft: pages.filter((p) => p.status === "draft").length,
  };

  const filtered = filter
    ? pages.filter((p) => p.status === filter)
  : pages;

  const filterTabs = [
    { key: "", label: "All", count: counts.all },
    { key: "published", label: "Published", count: counts.published },
    { key: "modified", label: "Changes", count: counts.modified },
    { key: "draft", label: "Draft", count: counts.draft },
  ]
    .map((tab) => {
      const href = tab.key ? `/pages?status=${tab.key}` : "/pages";
      const active = filter === tab.key || (!filter && !tab.key) ? "tab-active" : "";
      return `<a class="tab ${active}" href="${href}">${escapeHtml(tab.label)} (${tab.count})</a>`;
    })
    .join("");

  const rows = filtered
    .map((page) => {
      const path = page.path;
      const publish = canPublish(page.status)
        ? `<form method="post" action="/pages/${escapeAttr(path)}/publish" class="inline" data-confirm-publish>
            <input type="hidden" name="_csrf" value="${escapeAttr(csrfToken)}" />
            <button type="submit" class="btn btn-primary btn-xs">Publish</button>
          </form>`
        : "";
      const discard = canDiscard(page.status)
        ? `<form method="post" action="/pages/${escapeAttr(path)}/discard" class="inline" data-confirm-discard>
            <input type="hidden" name="_csrf" value="${escapeAttr(csrfToken)}" />
            <button type="submit" class="btn btn-ghost btn-xs">Discard draft</button>
          </form>`
        : "";
      return `<tr data-page-row data-path="${escapeAttr(path)}">
        <td class="font-mono text-sm"><a href="${escapeAttr(previewPageUrl(path))}" target="_blank" rel="noopener noreferrer">${escapeHtml(path)}</a></td>
        <td>${statusBadge(page.status)}</td>
        <td class="text-right">
          <div class="join join-horizontal">
            <a class="btn btn-ghost btn-xs join-item" href="${escapeAttr(livePageUrl(path))}" target="_blank" rel="noopener noreferrer">Live</a>
            <a class="btn btn-ghost btn-xs join-item" href="/pages?diff=${escapeAttr(path)}">Diff</a>
            ${publish}
            ${discard}
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const diffPanel =
    diffPath && diff
      ? `<div class="card bg-base-100 shadow-sm mt-6">
        <div class="card-body">
          <h2 class="card-title text-lg">Diff: ${escapeHtml(diffPath)}</h2>
          <p class="text-sm text-base-content/60">Unified diff between published and current draft.</p>
          <pre class="bg-base-200 p-4 rounded-lg text-xs overflow-x-auto max-h-96 whitespace-pre-wrap break-words">${escapeHtml(diff.diff || "")}</pre>
        </div>
      </div>`
      : "";

  return `
    <div class="flex flex-col gap-4">
      <div>
        <h1 class="text-2xl font-bold">Pages</h1>
        <p class="text-base-content/60 text-sm mt-1">Publish and discard drafts. Edit pages in Open WebUI chat.</p>
      </div>
      <div role="tablist" class="tabs tabs-boxed bg-base-100 p-1 flex-wrap">${filterTabs}</div>
      <div class="overflow-x-auto bg-base-100 rounded-box shadow-sm">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Page</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : `<tr><td colspan="3" class="text-center text-base-content/60">No pages match this filter.</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="text-xs text-base-content/50">Publish and discard apply to the latest server-side draft. Open WebUI may have newer unsaved edits in chat.</p>
      ${diffPanel}
    </div>`;
}
