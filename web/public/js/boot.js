// Loaded in <head>, before the stylesheet, like CodeReflections' inline head
// scripts (the CSP here allows no inline scripts):
// 1. Theme: the saved choice, else the system preference, set before the
//    first paint so dark mode doesn't flash light.
// 2. Login gate (app pages only): the page is a static file anyone can load,
//    so it stays hidden until /api/auth/session says this visitor may see it.
(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("cf_theme");
    var dark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (_) {
    root.setAttribute("data-theme", "light");
  }

  if (root.hasAttribute("data-public")) return;
  root.classList.add("auth-pending");
  var reveal = function () { root.classList.remove("auth-pending"); };
  setTimeout(reveal, 5000); // never stay blank if the check hangs
  // Shared with app.js, so the session is asked for once
  window.__sessionCheck = fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .catch(function () { return null; });
  window.__sessionCheck.then(function (session) {
    if (session && session.authEnabled && !session.loggedIn) {
      location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search));
    } else {
      reveal();
    }
  });
})();
