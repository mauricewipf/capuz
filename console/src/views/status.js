import { escapeHtml } from "../lib/escape.js";

function formatUptime(seconds) {
  if (seconds == null) return "—";
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function statusPage({ consoleHealth, apiStatus, apiError }) {
  const consoleOk = Boolean(consoleHealth?.ok);
  const apiOk = !apiError;

  const serviceCard = (name, ok, detail) => `
    <div class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body flex-row items-center gap-4 py-5">
        <div aria-hidden="true" class="status ${ok ? "status-success" : "status-error"} status-lg"></div>
        <div class="min-w-0">
          <div class="font-semibold">${escapeHtml(name)}</div>
          <div class="text-sm text-base-content/60">${escapeHtml(detail)}</div>
        </div>
        <div class="ml-auto">
          <span class="badge ${ok ? "badge-success" : "badge-error"} badge-soft">${ok ? "Healthy" : "Down"}</span>
        </div>
      </div>
    </div>`;

  const apiDetails = apiError
    ? `<div role="alert" class="alert alert-error alert-soft"><span>${escapeHtml(apiError)}</span></div>`
    : `<div class="stats stats-vertical sm:stats-horizontal w-full bg-base-100 border border-base-300 shadow-sm">
        <div class="stat">
          <div class="stat-title">API version</div>
          <div class="stat-value text-lg">${escapeHtml(apiStatus?.version || "—")}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Storage backend</div>
          <div class="stat-value text-lg font-mono">${escapeHtml(apiStatus?.storageBackend || "—")}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Uptime</div>
          <div class="stat-value text-lg">${formatUptime(apiStatus?.uptimeSeconds)}</div>
        </div>
        <div class="stat">
          <div class="stat-title">Preview base</div>
          <div class="stat-desc mt-1 break-all font-mono text-xs">${escapeHtml(apiStatus?.previewBaseUrl || "—")}</div>
        </div>
      </div>`;

  return `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold">Status</h1>
        <p class="mt-1 text-sm text-base-content/60">Health of the console and the cms-api service.</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        ${serviceCard("CMS Console", consoleOk, "This admin interface")}
        ${serviceCard("CMS API", apiOk, "Page storage and publishing")}
      </div>
      ${apiDetails}
    </div>`;
}
