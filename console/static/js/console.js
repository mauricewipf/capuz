/** Console interactions: confirm modals, theme toggle, drawer state, component filter. */
(() => {
  const THEMES = { light: "nord", dark: "dim" };

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  }

  /* --- Theme toggle (sun/moon swap in the navbar) --- */
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.checked = document.documentElement.dataset.theme === THEMES.dark;
    themeToggle.addEventListener("change", () => {
      const mode = themeToggle.checked ? "dark" : "light";
      document.documentElement.dataset.theme = THEMES[mode];
      storageSet("capuz-console-mode", mode);
    });
  }

  /* --- Drawer: expanded by default on desktop, remember the user's choice --- */
  const drawer = document.getElementById("app-drawer");
  const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;
  if (drawer) {
    if (isDesktop()) {
      drawer.checked = storageGet("capuz-console-drawer") !== "collapsed";
    }
    drawer.addEventListener("change", () => {
      if (isDesktop()) {
        storageSet("capuz-console-drawer", drawer.checked ? "expanded" : "collapsed");
      }
    });
  }

  /* --- Confirm dialogs for publish/discard --- */
  const dialog = document.getElementById("confirm-dialog");
  const acceptButton = dialog?.querySelector("[data-confirm-accept]");
  let pendingForm = null;

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-confirm-publish], form[data-confirm-discard]");
    if (!form || !dialog || !acceptButton) return;
    event.preventDefault();
    pendingForm = form;

    const page = form.getAttribute("data-page") || "this page";
    const isPublish = form.hasAttribute("data-confirm-publish");
    dialog.querySelector("[data-confirm-title]").textContent = isPublish
      ? "Publish draft?"
      : "Discard draft?";
    dialog.querySelector("[data-confirm-message]").textContent = isPublish
      ? `Publish the latest server-side draft of ${page} to the live site?`
      : `Discard the draft of ${page}? The live published page remains unchanged.`;
    acceptButton.textContent = isPublish ? "Publish" : "Discard";
    acceptButton.classList.toggle("btn-primary", isPublish);
    acceptButton.classList.toggle("btn-error", !isPublish);
    dialog.showModal();
  });

  acceptButton?.addEventListener("click", () => {
    const form = pendingForm;
    pendingForm = null;
    dialog.close();
    if (form) form.submit();
  });

  dialog?.addEventListener("close", () => {
    pendingForm = null;
  });

  /* --- Dismissible flash alerts --- */
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dismiss-alert]");
    if (button) button.closest('[role="alert"]')?.remove();
  });

  /* --- Component list filter --- */
  const filterInput = document.querySelector("[data-component-filter]");
  const componentRows = Array.from(document.querySelectorAll("[data-component-row]"));
  const emptyNotice = document.querySelector("[data-component-empty]");
  if (filterInput && componentRows.length) {
    filterInput.addEventListener("input", () => {
      const query = filterInput.value.trim().toLowerCase();
      let visible = 0;
      for (const row of componentRows) {
        const match = !query || (row.getAttribute("data-name") || "").includes(query);
        row.classList.toggle("hidden", !match);
        if (match) visible += 1;
      }
      emptyNotice?.classList.toggle("hidden", visible > 0);
    });
  }
})();
