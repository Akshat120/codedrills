const form = document.getElementById("login-form");
const msg = document.getElementById("login-msg");

function showError(text) {
  msg.innerHTML = `<span class="error-text"></span>`;
  msg.firstChild.textContent = text;
}

const session = await fetch("/api/auth/session").then(r => r.json()).catch(() => ({}));
if (session.error) showError(session.error);
else if (!session.authEnabled || session.loggedIn) location.href = "/";

form.addEventListener("submit", async e => {
  e.preventDefault();
  msg.textContent = "";
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: form.password.value })
  });
  if (res.ok) return void (location.href = "/");
  const data = await res.json().catch(() => ({}));
  showError(data.error || "Login failed.");
});
