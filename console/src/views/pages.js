import { livePageUrl, previewPageUrl } from "../config.js";
import { escapeHtml, escapeAttr } from "../lib/escape.js";

const EXTERNAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3 opacity-60"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>`;

function statusBadge(status) {
  switch (status) {
    case "published":
      return `<span class="badge badge-success badge-soft badge-sm">Published</span>`;
    case "modified":
      return `<span class="badge badge-warning badge-soft badge-sm">Changes</span>`;
    case "draft":
      return `<span class="badge badge-info badge-soft badge-sm">Draft</span>`;
    default:
      return `<span class="badge badge-ghost badge-sm">${escapeHtml(status)}</span>`;
  }
}

export function hasDraft(status) {
  return status === "draft" || status === "modified";
}

export function pagesPage({ pages, filter, diffPath, diff, csrfToken }) {
  const counts = {
    all: pages.length,
    published: pages.filter((p) => p.status === "published").length,
    modified: pages.filter((p) => p.status === "modified").length,
    draft: pages.filter((p) => p.status === "draft").length,
  };

  const filtered = filter ? pages.filter((p) => p.status === filter) : pages;

  const filterTabs = [
    { key: "", label: "All", count: counts.all },
    { key: "published", label: "Published", count: counts.published },
    { key: "modified", label: "Changes", count: counts.modified },
    { key: "draft", label: "Draft", count: counts.draft },
  ]
    .map((tab) => {
      const href = tab.key ? `/pages?status=${tab.key}` : "/pages";
      const active = filter === tab.key || (!filter && !tab.key) ? "tab-active" : "";
      return `<a role="tab" class="tab gap-2 ${active}" href="${href}">
        ${escapeHtml(tab.label)}
        <span class="badge badge-sm badge-ghost">${tab.count}</span>
      </a>`;
    })
    .join("");

  const rows = filtered
    .map((page) => {
      const path = page.path;
      const draft = hasDraft(page.status);
      const publish = draft
        ? `<form method="post" action="/pages/${escapeAttr(path)}/publish" class="inline" data-confirm-publish data-page="${escapeAttr(path)}">
            <input type="hidden" name="_csrf" value="${escapeAttr(csrfToken)}" />
            <button type="submit" class="btn btn-primary btn-xs">Publish</button>
          </form>`
        : "";
      const discard = draft
        ? `<form method="post" action="/pages/${escapeAttr(path)}/discard" class="inline" data-confirm-discard data-page="${escapeAttr(path)}">
            <input type="hidden" name="_csrf" value="${escapeAttr(csrfToken)}" />
            <button type="submit" class="btn btn-ghost btn-xs text-error">Discard</button>
          </form>`
        : "";
      // Delete only after any draft is discarded — avoids wiping live while a draft still exists.
      const del = draft
        ? ""
        : `<form method="post" action="/pages/${escapeAttr(path)}/delete" class="inline" data-confirm-delete data-page="${escapeAttr(path)}">
            <input type="hidden" name="_csrf" value="${escapeAttr(csrfToken)}" />
            <button type="submit" class="btn btn-ghost btn-xs text-error">Delete</button>
          </form>`;
      return `<tr data-page-row data-path="${escapeAttr(path)}" class="hover:bg-base-200/60">
        <td>
          <a class="link link-hover font-mono text-sm inline-flex items-center gap-1.5" href="${escapeAttr(previewPageUrl(path))}" target="_blank" rel="noopener noreferrer" title="Open preview">
            ${escapeHtml(path)}
            ${EXTERNAL_ICON}
          </a>
        </td>
        <td>${statusBadge(page.status)}</td>
        <td>
          <div class="flex flex-wrap items-center justify-end gap-1">
            <a class="btn btn-ghost btn-xs" href="${escapeAttr(livePageUrl(path))}" target="_blank" rel="noopener noreferrer">Live</a>
            <a class="btn btn-ghost btn-xs ${diffPath === path ? "btn-active" : ""}" href="/pages?diff=${escapeAttr(path)}">Diff</a>
            ${publish}
            ${discard}
            ${del}
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const emptyRow = `<tr><td colspan="3">
    <div class="flex flex-col items-center gap-2 py-10 text-base-content/60">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="size-8 opacity-40"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"></path><path d="M15 2v5h5"></path></svg>
      <span>No pages match this filter.</span>
    </div>
  </td></tr>`;

  const diffPanel =
    diffPath && diff
      ? `<div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="card-title text-base">
              Diff
              <span class="font-mono text-sm font-normal text-base-content/70">${escapeHtml(diffPath)}</span>
            </h2>
            <a class="btn btn-ghost btn-xs" href="/pages" aria-label="Close diff">Close</a>
          </div>
          <p class="text-sm text-base-content/60">Unified diff between published page and current draft.</p>
          <pre class="max-h-96 overflow-x-auto whitespace-pre-wrap break-words rounded-box bg-base-200 p-4 font-mono text-xs">${escapeHtml(diff.diff || "")}</pre>
        </div>
      </div>`
      : "";

  return `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">Pages</h1>
          <p class="mt-1 text-sm text-base-content/60">Publish, discard drafts, and delete pages. Edit pages in Open WebUI chat.</p>
        </div>
        <div role="tablist" class="tabs tabs-box tabs-sm bg-base-100 shadow-sm">${filterTabs}</div>
      </div>
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Status</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows : emptyRow}
            </tbody>
          </table>
        </div>
      </div>
      ${diffPanel}
      <p class="text-xs text-base-content/50">Publish and discard apply to the latest server-side draft. Discard a draft before Delete appears. Open WebUI may have newer unsaved edits in chat.</p>
    </div>`;
}
