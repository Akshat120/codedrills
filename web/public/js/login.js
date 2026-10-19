import { initFooter, initTheme } from "./chrome.js";

initTheme();
initFooter();

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");

// Only same-site paths are allowed as the post-login destination
function nextPath() {
  const next = new URLSearchParams(location.search).get("next") || "/";
  try {
    const url = new URL(next, location.origin);
    if (url.origin === location.origin) return url.pathname + url.search + url.hash;
  } catch (_) {}
  return "/";
}

const session = await fetch("/api/auth/session", { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
if (session.error) errorEl.textContent = session.error;
else if (!session.authEnabled || session.loggedIn) location.replace(nextPath());

form.addEventListener("submit", async e => {
  e.preventDefault();
  errorEl.textContent = "";
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: form.password.value })
  });
  if (res.ok) return void location.replace(nextPath());
  const data = await res.json().catch(() => ({}));
  errorEl.textContent = data.error || "Login failed.";
});
