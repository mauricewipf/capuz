/** Client-side confirm dialogs for publish/discard */
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
  }
});
