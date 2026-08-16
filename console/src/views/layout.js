import { config } from "../config.js";
import { escapeHtml } from "../lib/escape.js";

const NAV = [
  { href: "/pages", label: "Pages", id: "pages" },
  { href: "/components", label: "Components", id: "components" },
  { href: "/status", label: "Status", id: "status" },
];

export function layout({ title, active, identity, csrfToken, flash, content }) {
  const nav = NAV.map((item) => {
    const activeClass = item.id === active ? "menu-active" : "";
    return `<li><a class="${activeClass}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
  }).join("");

  const flashHtml = flash
    ? `<div class="alert alert-${escapeHtml(flash.type || "info")} mb-4">${escapeHtml(flash.message)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(config.appName)}</title>
  <link rel="stylesheet" href="/static/css/daisyui.css">
</head>
<body class="bg-base-200 min-h-screen">
  <div class="drawer lg:drawer-open">
    <input id="nav-drawer" type="checkbox" class="drawer-toggle" />
    <div class="drawer-content flex flex-col">
      <div class="navbar bg-base-100 border-b border-base-300 lg:hidden">
        <div class="flex-none">
          <label for="nav-drawer" class="btn btn-square btn-ghost drawer-button" aria-label="Open menu">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block h-5 w-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </label>
        </div>
        <div class="flex-1 px-2 text-lg font-semibold">${escapeHtml(config.appName)}</div>
      </div>
      <main class="p-4 md:p-6 max-w-6xl w-full mx-auto">
        ${flashHtml}
        ${content}
      </main>
    </div>
    <div class="drawer-side z-20">
      <label for="nav-drawer" class="drawer-overlay" aria-label="Close menu"></label>
      <aside class="menu bg-base-100 text-base-content min-h-full w-64 p-4 border-r border-base-300">
        <div class="mb-6">
          <div class="text-lg font-bold">${escapeHtml(config.appName)}</div>
          <div class="text-xs text-base-content/60 truncate" title="${escapeHtml(identity.email)}">${escapeHtml(identity.email)}</div>
        </div>
        <ul>${nav}</ul>
        <div class="mt-8 text-xs text-base-content/50">
          <a href="${escapeHtml(config.siteBaseUrl)}" target="_blank" rel="noopener noreferrer">Live site</a>
          ·
          <a href="${escapeHtml(config.previewBaseUrl)}" target="_blank" rel="noopener noreferrer">Preview</a>
        </div>
      </aside>
    </div>
  </div>
  <script>
    window.__CSRF__ = "${escapeHtml(csrfToken)}";
  </script>
  <script src="/static/js/console.js" defer></script>
</body>
</html>`;
}

export function forbiddenPage(identity) {
  const email = identity?.email ? escapeHtml(identity.email) : "unknown";
  return layout({
    title: "Forbidden",
    active: "",
    identity: identity || { email: "unknown", name: "unknown", groups: [] },
    csrfToken: "",
    content: `<div class="hero min-h-[50vh]">
      <div class="hero-content text-center">
        <div>
          <h1 class="text-3xl font-bold">403 — Access denied</h1>
          <p class="py-4 text-base-content/70">Signed in as ${email}, but this account is not allowed to use the console.</p>
        </div>
      </div>
    </div>`,
  });
}

export function errorPage(title, message, identity, csrfToken) {
  return layout({
    title: title,
    active: "",
    identity: identity || { email: "unknown", name: "unknown", groups: [] },
    csrfToken: csrfToken || "",
    content: `<div class="alert alert-error"><span>${escapeHtml(message)}</span></div>`,
  });
}
