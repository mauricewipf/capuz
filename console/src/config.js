function env(name, fallback = "") {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function envInt(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: envInt("CONSOLE_PORT", 3000),
  cmsApiUrl: env("CMS_API_URL", "http://cms-api:3000").replace(/\/+$/, ""),
  cmsApiKey: env("CMS_API_KEY", ""),
  siteBaseUrl: env("SITE_BASE_URL", "http://localhost:8080").replace(/\/+$/, ""),
  previewBaseUrl: env("PREVIEW_BASE_URL", "http://preview.localhost:8080").replace(/\/+$/, ""),
  csrfSecret: env("CONSOLE_CSRF_SECRET", "dev-console-csrf-change-me"),
  allowedGroups: parseList(env("CONSOLE_ALLOWED_GROUPS", "")),
  authEmailHeader: env("CONSOLE_AUTH_EMAIL_HEADER", "X-Auth-Request-Email"),
  authUserHeader: env("CONSOLE_AUTH_USER_HEADER", "X-Auth-Request-User"),
  authGroupsHeader: env("CONSOLE_AUTH_GROUPS_HEADER", "X-Auth-Request-Groups"),
  upstreamTimeoutMs: envInt("CONSOLE_UPSTREAM_TIMEOUT_MS", 30000),
  appName: env("CONSOLE_APP_NAME", "Capuz Console"),
};

function parseList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function livePageUrl(pagePath) {
  const normalized = pagePath.replace(/^\/+/, "");
  if (normalized === "index.html") return `${config.siteBaseUrl}/`;
  if (normalized.endsWith("/index.html")) {
    const dir = normalized.slice(0, -"/index.html".length);
    return `${config.siteBaseUrl}/${dir}`;
  }
  if (normalized.endsWith(".html")) {
    return `${config.siteBaseUrl}/${normalized.slice(0, -".html".length)}`;
  }
  return `${config.siteBaseUrl}/${normalized}`;
}

export function previewPageUrl(pagePath) {
  const normalized = pagePath.replace(/^\/+/, "");
  const base = config.previewBaseUrl;
  if (normalized === "index.html") return `${base}/`;
  if (normalized.endsWith("/index.html")) {
    const dir = normalized.slice(0, -"/index.html".length);
    return `${base}/${dir}`;
  }
  if (normalized.endsWith(".html")) {
    return `${base}/${normalized.slice(0, -".html".length)}`;
  }
  return `${base}/${normalized}`;
}
