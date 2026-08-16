import { escapeHtml } from "../lib/escape.js";

export function statusPage({ consoleHealth, apiStatus, apiError }) {
  const apiBlock = apiError
    ? `<div class="alert alert-error"><span>${escapeHtml(apiError)}</span></div>`
    : `<div class="stats stats-vertical lg:stats-horizontal shadow bg-base-100 w-full">
        <div class="stat">
          <div class="stat-title">API version</div>
          <div class="stat-value text-lg">${escapeHtml(apiStatus?.version || "—")}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Storage</div>
          <div class="stat-value text-lg">${escapeHtml(apiStatus?.storageBackend || "—")}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Uptime</div>
          <div class="stat-value text-lg">${apiStatus?.uptimeSeconds != null ? `${apiStatus.uptimeSeconds}s` : "—"}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Preview base</div>
          <div class="stat-desc font-mono text-xs break-all">${escapeHtml(apiStatus?.previewBaseUrl || "—")}</div>
        </div>
      </div>`;

  return `
    <div class="flex flex-col gap-4">
      <div>
        <h1 class="text-2xl font-bold">Status</h1>
        <p class="text-base-content/60 text-sm mt-1">Console and cms-api health.</p>
      </div>
      <div class="stats shadow bg-base-100">
        <div class="stat">
          <div class="stat-title">Console</div>
          <div class="stat-value text-success text-lg">${consoleHealth?.ok ? "OK" : "Error"}</div>
        </div>
      </div>
      ${apiBlock}
    </div>`;
}
