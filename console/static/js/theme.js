/** Applies the saved theme before first paint to avoid a flash of the wrong theme. */
(() => {
  const THEMES = { light: "nord", dark: "dim" };
  let mode = null;
  try {
    mode = localStorage.getItem("capuz-console-mode");
  } catch {
    /* storage unavailable */
  }
  if (mode !== "light" && mode !== "dark") {
    mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = THEMES[mode];
})();
