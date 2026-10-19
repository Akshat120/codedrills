// Page chrome shared by the app and the login page: the theme toggle in the
// header and the footer year. Same behaviour as CodeReflections.

export function initTheme() {
  const toggleBtn = document.getElementById("btn-theme-toggle");
  if (!toggleBtn) return;

  function updateThemeUI(theme) {
    const isDark = theme === "dark";
    toggleBtn.querySelector(".theme-icon").textContent = isDark ? "☀️" : "🌙";
    toggleBtn.querySelector(".theme-text").textContent = isDark ? "Light Theme" : "Dark Theme";
    toggleBtn.title = isDark ? "Switch to light theme" : "Switch to dark theme";
    toggleBtn.setAttribute("aria-label", toggleBtn.title);
  }

  updateThemeUI(document.documentElement.getAttribute("data-theme") || "light");

  toggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("cf_theme", next);
    } catch (_) {}
    updateThemeUI(next);
  });
}

export function initFooter() {
  for (const el of document.querySelectorAll(".site-footer-year")) el.textContent = new Date().getFullYear();
}
