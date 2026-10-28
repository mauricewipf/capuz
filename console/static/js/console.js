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

  /* --- Confirm dialogs for publish/discard/unpublish/delete --- */
  const dialog = document.getElementById("confirm-dialog");
  const acceptButton = dialog?.querySelector("[data-confirm-accept]");
  let pendingForm = null;

  const CONFIRM_COPY = {
    publish: {
      title: "Publish draft?",
      message: (page) => `Publish the latest server-side draft of ${page} to the live site?`,
      accept: "Publish",
      primary: true,
    },
    discard: {
      title: "Discard draft?",
      message: (page) => `Discard the draft of ${page}? The live published page remains unchanged.`,
      accept: "Discard",
      primary: false,
    },
    unpublish: {
      title: "Unpublish page?",
      message: (page) =>
        `Remove ${page} from the live site and keep it as a draft? You can publish again later or delete the draft.`,
      accept: "Unpublish",
      primary: false,
    },
    delete: {
      title: "Delete page?",
      message: (page) => `Permanently delete the draft of ${page}? This cannot be undone.`,
      accept: "Delete",
      primary: false,
    },
  };

  document.addEventListener("submit", (event) => {
    const form = event.target.closest(
      "form[data-confirm-publish], form[data-confirm-discard], form[data-confirm-unpublish], form[data-confirm-delete]",
    );
    if (!form || !dialog || !acceptButton) return;
    event.preventDefault();
    pendingForm = form;

    const page = form.getAttribute("data-page") || "this page";
    let kind = "discard";
    if (form.hasAttribute("data-confirm-publish")) kind = "publish";
    else if (form.hasAttribute("data-confirm-unpublish")) kind = "unpublish";
    else if (form.hasAttribute("data-confirm-delete")) kind = "delete";
    const copy = CONFIRM_COPY[kind];

    dialog.querySelector("[data-confirm-title]").textContent = copy.title;
    dialog.querySelector("[data-confirm-message]").textContent = copy.message(page);
    acceptButton.textContent = copy.accept;
    acceptButton.classList.toggle("btn-primary", copy.primary);
    acceptButton.classList.toggle("btn-error", !copy.primary);
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
