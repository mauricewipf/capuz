import { config } from "../config.js";
import { escapeHtml, escapeAttr } from "../lib/escape.js";

// Bump when static assets change so cached copies (max-age=86400) are refreshed.
export const ASSET_VERSION = "5";

const ICONS = {
  pages: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"></path><path d="M15 2v5h5"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>`,
  components: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><rect width="7" height="7" x="14" y="3" rx="1"></rect><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"></path></svg>`,
  status: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"></path></svg>`,
  chat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
};

const NAV = [
  { href: "/pages", label: "Pages", id: "pages" },
  { href: "/components", label: "Components", id: "components" },
  { href: "/status", label: "Status", id: "status" },
];

const FLASH_ICONS = {
  success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5 shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><path d="m9 11 3 3L22 4"></path></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5 shrink-0"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5 shrink-0"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`,
};

export function layout({ title, active, identity, csrfToken, flash, content }) {
  const nav = NAV.map((item) => {
    const activeClass = item.id === active ? "menu-active" : "";
    return `<li>
      <a class="${activeClass}" href="${escapeHtml(item.href)}" title="${escapeHtml(item.label)}">
        ${ICONS[item.id]}
        <span class="is-drawer-close:hidden">${escapeHtml(item.label)}</span>
      </a>
    </li>`;
  }).join("");

  const flashType = flash && FLASH_ICONS[flash.type] ? flash.type : "info";
  const flashHtml = flash
    ? `<div role="alert" class="alert alert-${flashType} alert-soft mb-6">
        ${FLASH_ICONS[flashType]}
        <span>${escapeHtml(flash.message)}</span>
        <button type="button" class="btn btn-ghost btn-xs btn-circle" data-dismiss-alert aria-label="Dismiss">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" data-theme="nord">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="${escapeHtml(csrfToken)}">
  <title>${escapeHtml(title)} — ${escapeHtml(config.appName)}</title>
  <link rel="stylesheet" href="/static/css/daisyui@5.css">
  <script src="/static/js/browser@4.js"></script>
  <link rel="stylesheet" href="/static/css/themes.css">
  <style type="text/tailwindcss">
    @custom-variant is-drawer-open (&:is(.drawer:has(.drawer-toggle:checked) *));
    @custom-variant is-drawer-close (&:is(.drawer:not(:has(.drawer-toggle:checked)) *));
  </style>
  <script src="/static/js/theme.js?v=${ASSET_VERSION}"></script>
</head>
<body class="bg-base-200 min-h-screen">
  <div class="drawer lg:drawer-open">
    <input id="app-drawer" type="checkbox" class="drawer-toggle inline" />
    <div class="drawer-content flex min-h-screen flex-col overflow-x-clip overflow-y-visible">
      <header class="navbar sticky top-0 z-10 border-b border-base-300 bg-base-100 min-h-14 px-3 gap-1">
        <label for="app-drawer" class="btn btn-square btn-ghost btn-sm drawer-button" aria-label="Toggle sidebar" title="Toggle sidebar">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path></svg>
        </label>
        <div class="px-2 font-semibold">${escapeHtml(title)}</div>
        <div class="flex-1"></div>
        <label class="btn btn-ghost btn-circle btn-sm swap swap-rotate" aria-label="Toggle light and dark mode" title="Toggle light and dark mode">
          <input type="checkbox" id="theme-toggle" />
          <svg class="swap-off size-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,0,0-1.41-1.41l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,.71.29ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>
          <svg class="swap-on size-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Z"/></svg>
        </label>
      </header>
      <main class="w-full max-w-5xl mx-auto flex-1 p-4 md:p-8">
        ${flashHtml}
        ${content}
      </main>
    </div>
    <div class="drawer-side z-20 is-drawer-close:overflow-visible">
      <label for="app-drawer" class="drawer-overlay" aria-label="Close sidebar"></label>
      <aside class="flex min-h-full flex-col border-r border-base-300 bg-base-100 is-drawer-close:w-16 is-drawer-open:w-60">
        <div class="flex h-14 items-center px-3 is-drawer-close:justify-center">
          <a href="/pages" class="btn btn-ghost btn-square btn-sm text-primary" aria-label="Home" title="Home">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path></svg>
          </a>
        </div>
        <ul class="menu w-full grow gap-1 px-2">
          <li>
            <a href="${escapeAttr(config.editorUrl)}" target="_blank" rel="noopener noreferrer" title="Open WebUI chat">
              ${ICONS.chat}
              <span class="is-drawer-close:hidden">Chat</span>
            </a>
          </li>
          ${nav}
        </ul>
      </aside>
    </div>
  </div>
  <dialog id="confirm-dialog" class="modal">
    <div class="modal-box max-w-sm">
      <h3 class="text-lg font-bold" data-confirm-title>Are you sure?</h3>
      <p class="py-4 text-base-content/70" data-confirm-message></p>
      <div class="modal-action">
        <form method="dialog"><button class="btn btn-ghost">Cancel</button></form>
        <button class="btn btn-primary" data-confirm-accept>Confirm</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Cancel">close</button></form>
  </dialog>
  <script src="/static/js/console.js?v=${ASSET_VERSION}" defer></script>
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
    content: `<div role="alert" class="alert alert-error">${FLASH_ICONS.error}<span>${escapeHtml(message)}</span></div>`,
  });
}
