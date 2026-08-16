/** Client-side confirm dialogs and component tab switching */
document.addEventListener("click", (event) => {
  const publishForm = event.target.closest("form[data-confirm-publish]");
  if (publishForm) {
    event.preventDefault();
  if (!confirm("Publish the latest server-side draft to the live site?")) return;
    publishForm.submit();
    return;
  }

  const discardForm = event.target.closest("form[data-confirm-discard]");
  if (discardForm) {
    event.preventDefault();
    if (!confirm("Discard the draft? The live published page will remain unchanged.")) return;
    discardForm.submit();
    return;
  }

  const tabBtn = event.target.closest("[data-tab]");
  if (tabBtn) {
    const tab = tabBtn.getAttribute("data-tab");
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.classList.toggle("tab-active", btn.getAttribute("data-tab") === tab);
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      const name = panel.getAttribute("data-tab-panel");
      panel.classList.toggle("hidden", name !== tab);
    });
  }
});
