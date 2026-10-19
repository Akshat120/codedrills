// Loaded in <head> before the stylesheet so the saved theme applies before the
// first paint (no light flash in dark mode).
(function () {
  try {
    if (localStorage.getItem("cd-theme") === "dark") document.documentElement.dataset.theme = "dark";
  } catch (_) {}
})();
