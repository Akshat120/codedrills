// CodeDrills single-page app: a small history router that renders each page
// into #cd-main and #cd-sidebar.

const main = document.getElementById("cd-main");
const sidebar = document.getElementById("cd-sidebar");

const VERDICT_TEXT = {
  AC: "Accepted",
  WA: "Wrong answer",
  TLE: "Time limit exceeded",
  MLE: "Memory limit exceeded",
  RE: "Runtime error",
  CE: "Compilation error",
  IE: "Judgement failed"
};

let pollTimer = null;

// ---------- helpers ----------

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : undefined
  });
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("Please log in.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

function ratingClass(r) {
  if (r < 1200) return "rating-gray";
  if (r < 1400) return "rating-green";
  if (r < 1600) return "rating-cyan";
  if (r < 1900) return "rating-blue";
  if (r < 2100) return "rating-violet";
  if (r < 2400) return "rating-orange";
  return "rating-red";
}

function verdictHtml(s) {
  if (s.status === "queued") return `<span class="verdict-waiting">In queue</span>`;
  if (s.status === "compiling") return `<span class="verdict-waiting">Compiling</span>`;
  if (s.status === "running") return `<span class="verdict-waiting">Running on test ${esc(s.currentTest || 1)}</span>`;
  const text = VERDICT_TEXT[s.verdict] || s.verdict;
  if (s.verdict === "AC") return `<span class="verdict-accepted">${text}</span>`;
  if (s.verdict === "CE") return `<a class="verdict-rejected" href="/submission/${esc(s.id)}" data-link>${text}</a>`;
  const onTest = s.failedTest ? ` on test ${esc(s.failedTest)}` : "";
  const cls = s.verdict === "TLE" || s.verdict === "MLE" ? "verdict-limit" : "verdict-rejected";
  return `<span class="${cls}">${text}${onTest}</span>`;
}

function formatWhen(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function box(caption, content, { flush = false, plain = false } = {}) {
  return `<div class="roundbox">
    <div class="caption${plain ? " plain" : ""}">${caption}</div>
    <div class="content${flush ? " flush" : ""}">${content}</div>
  </div>`;
}

function setMenu(key) {
  document.querySelectorAll(".cd-menu a").forEach(a => a.classList.toggle("current", a.dataset.menu === key));
}

function renderMath(el) {
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false }
      ],
      throwOnError: false
    });
  }
}

function submissionsTable(list, { compact = false } = {}) {
  if (!list.length) return `<p class="muted" style="padding:10px;margin:0">No submissions yet.</p>`;
  const rows = list.map(s => compact
    ? `<tr>
        <td class="center"><a href="/submission/${esc(s.id)}" data-link>${esc(s.id)}</a></td>
        <td class="center small">${formatWhen(s.createdAt)}</td>
        <td class="center">${verdictHtml(s)}</td>
      </tr>`
    : `<tr>
        <td class="center"><a href="/submission/${esc(s.id)}" data-link>${esc(s.id)}</a></td>
        <td class="center small hide-narrow">${formatWhen(s.createdAt)}</td>
        <td class="center hide-narrow"><span class="rated-user">akshat</span></td>
        <td><a href="/problemset/problem/${esc(s.problemSlug)}" data-link>${esc(s.problemCode)} - ${esc(s.problemTitle)}</a></td>
        <td class="center hide-narrow">${esc(s.language)}</td>
        <td class="center">${verdictHtml(s)}</td>
        <td class="center">${s.status === "done" ? `${esc(s.timeMs)} ms` : ""}</td>
        <td class="center hide-narrow">${s.status === "done" ? `${esc(s.memoryKb)} KB` : ""}</td>
      </tr>`).join("");
  const head = compact
    ? `<tr><th>#</th><th>When</th><th>Verdict</th></tr>`
    : `<tr><th>#</th><th class="hide-narrow">When</th><th class="hide-narrow">Who</th><th>Problem</th><th class="hide-narrow">Lang</th><th>Verdict</th><th>Time</th><th class="hide-narrow">Memory</th></tr>`;
  return `<div class="table-wrap"><table class="datatable"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

async function judgeBox() {
  const status = await api("/api/judge/status").catch(() => ({ online: false, message: "Unknown." }));
  return box("Pay attention", status.online
    ? `<span class="verdict-accepted">Judge online</span>`
    : `<span class="verdict-limit">Judge offline.</span> <span class="muted">${esc(status.message)}</span>`);
}

// ---------- pages ----------

async function homePage() {
  setMenu("home");
  main.innerHTML = box("CodeDrills", `
    <h2 class="topic-title">Welcome to CodeDrills</h2>
    <div class="topic-info">By <span class="rated-user">akshat</span></div>
    <div class="topic-body">
      <p>A private practice judge with an original problem bank. Pick a problem from the
      <a href="/problemset" data-link>problemset</a>, submit GNU C++17, and get a verdict per test.</p>
      <div class="notice">This is the dummy build: problems and submissions are hard-coded, and the
      judge is not connected yet.</div>
    </div>`, { plain: true });
  sidebar.innerHTML = await judgeBox();
}

async function problemsetPage() {
  setMenu("problemset");
  const params = new URLSearchParams(location.search);
  const data = await api(`/api/problems?${params}`);

  const rows = data.problems.map(p => `
    <tr class="${p.status === "accepted" ? "accepted-problem" : p.status === "attempted" ? "rejected-problem" : ""}">
      <td class="id-col"><a href="/problemset/problem/${esc(p.slug)}" data-link>${esc(p.code)}</a></td>
      <td>
        <div class="problem-name">
          <a href="/problemset/problem/${esc(p.slug)}" data-link>${esc(p.title)}</a>
          <div class="problem-tags">${p.tags.map(t => `<a href="/problemset?tag=${encodeURIComponent(t)}" data-link>${esc(t)}</a>`).join(", ")}</div>
        </div>
      </td>
      <td class="center"><span class="${ratingClass(p.difficulty)}">${esc(p.difficulty)}</span></td>
      <td class="center">${p.acceptedCount ? `<span title="My accepted submissions">✓ x${esc(p.acceptedCount)}</span>` : ""}</td>
    </tr>`).join("");

  main.innerHTML = box("Problems", `
    <div class="table-wrap"><table class="datatable">
      <thead><tr><th>#</th><th style="text-align:left">Name</th><th>Difficulty</th><th>Solved</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="center muted">No problems match.</td></tr>`}</tbody>
    </table></div>`, { flush: true, plain: true });

  const tagOptions = data.tags.map(t => `<option value="${esc(t)}"${params.get("tag") === t ? " selected" : ""}>${esc(t)}</option>`).join("");
  sidebar.innerHTML = box("Filter Problems", `
    <form class="filter-form" id="filter-form">
      <input type="text" name="q" placeholder="Name or # (e.g. 1A)" value="${esc(params.get("q") || "")}">
      <select name="tag"><option value="">All tags</option>${tagOptions}</select>
      <div class="row">Difficulty:
        <input type="number" name="min" min="800" max="3500" step="100" placeholder="800" value="${esc(params.get("min") || "")}">
        —
        <input type="number" name="max" min="800" max="3500" step="100" placeholder="3500" value="${esc(params.get("max") || "")}">
      </div>
      <div class="row"><button class="cd-button" type="submit">Apply</button>
        <a href="/problemset" data-link>Reset</a></div>
    </form>`);

  document.getElementById("filter-form").addEventListener("submit", e => {
    e.preventDefault();
    const query = new URLSearchParams();
    for (const [k, v] of new FormData(e.target)) if (String(v).trim()) query.set(k, String(v).trim());
    navigate(`/problemset${query.size ? `?${query}` : ""}`);
  });
}

async function problemPage(slug) {
  setMenu("problemset");
  const [p, subs] = await Promise.all([
    api(`/api/problems/${encodeURIComponent(slug)}`),
    api(`/api/submissions?problem=${encodeURIComponent(slug)}`)
  ]);
  const letter = p.code.replace(/^\d+/, "");

  const samples = p.samples.map((s, i) => `
    <div class="sample-tests">
      <div class="sample-box">
        <div class="sample-title">Input <button class="copy-button" data-copy="in${i}">Copy</button></div>
        <pre id="in${i}">${esc(s.input)}</pre>
      </div>
      <div class="sample-box">
        <div class="sample-title">Output <button class="copy-button" data-copy="out${i}">Copy</button></div>
        <pre id="out${i}">${esc(s.output)}</pre>
      </div>
    </div>`).join("");

  const st = p.statement;
  // Statement HTML is trusted here (hard-coded); in the real app it is
  // rendered and sanitized by the build pipeline.
  const body = st
    ? `<div class="legend">${st.legend}</div>
       <div class="section-title">Input</div>${st.input}
       <div class="section-title">Output</div>${st.output}
       <div class="section-title">Examples</div>${samples}
       ${st.note ? `<div class="section-title">Note</div>${st.note}` : ""}`
    : `<p class="muted center">The statement for this problem has not been written yet.</p>`;

  main.innerHTML = `<div class="roundbox"><div class="content">
    <div class="problem-statement">
      <div class="header">
        <div class="title">${esc(letter)}. ${esc(p.title)}</div>
        <div class="property"><span class="property-title">time limit per test</span> ${p.timeLimitMs / 1000} second${p.timeLimitMs === 1000 ? "" : "s"}</div>
        <div class="property"><span class="property-title">memory limit per test</span> ${esc(p.memoryLimitMb)} megabytes</div>
        <div class="property"><span class="property-title">input</span> standard input</div>
        <div class="property"><span class="property-title">output</span> standard output</div>
      </div>
      ${body}
    </div>
  </div></div>`;
  renderMath(main);

  main.querySelectorAll("[data-copy]").forEach(btn => btn.addEventListener("click", async () => {
    const text = document.getElementById(btn.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    } catch (_) {}
  }));

  sidebar.innerHTML =
    box("Submit?", `
      <form id="quick-submit" class="filter-form">
        <div class="row">Language: <select name="language"><option value="cpp17">GNU C++17</option></select></div>
        <div class="row">Choose file: <input type="file" name="file" accept=".cpp,.cc,.cxx,.h"></div>
        <div class="row"><button class="cd-button" type="submit">Submit</button></div>
        <div id="quick-msg" class="small"></div>
      </form>`) +
    box("Last submissions", submissionsTable(subs.submissions.slice(0, 5), { compact: true }), { flush: true }) +
    box("Problem tags", `${p.tags.map(t => `<span class="tag-box">${esc(t)}</span>`).join("")}
      <span class="tag-box ${ratingClass(p.difficulty)}" title="Difficulty">*${esc(p.difficulty)}</span>`);

  document.getElementById("quick-submit").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("quick-msg");
    const file = e.target.file.files[0];
    if (!file) return void (msg.innerHTML = `<span class="error-text">Choose a file first.</span>`);
    await submitCode({ problemSlug: slug, language: "cpp17", code: await file.text() }, msg);
  });
}

async function submitCode(payload, msgEl) {
  msgEl.textContent = "Submitting…";
  try {
    const { id } = await api("/api/submissions", { method: "POST", body: JSON.stringify(payload) });
    navigate(`/submission/${id}`);
  } catch (err) {
    msgEl.innerHTML = `<span class="error-text">${esc(err.message)}</span>`;
  }
}

async function submitPage() {
  setMenu("submit");
  const { problems } = await api("/api/problems");
  const preselect = new URLSearchParams(location.search).get("problem");
  main.innerHTML = box("Submit solution", `
    <form id="submit-form" class="cd-form">
      <label for="sub-problem">Problem:</label>
      <select id="sub-problem" name="problemSlug">
        ${problems.map(p => `<option value="${esc(p.slug)}"${p.slug === preselect ? " selected" : ""}>${esc(p.code)} - ${esc(p.title)}</option>`).join("")}
      </select>
      <label for="sub-lang">Language:</label>
      <select id="sub-lang" name="language"><option value="cpp17">GNU C++17</option></select>
      <label for="sub-code">Source code:</label>
      <div></div>
      <div class="full"><textarea id="sub-code" class="code-editor" name="code" spellcheck="false"></textarea></div>
      <label for="sub-file">Or choose file:</label>
      <input id="sub-file" type="file" accept=".cpp,.cc,.cxx,.h">
      <div></div>
      <div><button class="cd-button" type="submit">Submit</button> <span id="submit-msg"></span></div>
    </form>`, { plain: true });

  const textarea = document.getElementById("sub-code");
  textarea.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = textarea;
    textarea.value = value.slice(0, a) + "    " + value.slice(b);
    textarea.selectionStart = textarea.selectionEnd = a + 4;
  });
  document.getElementById("sub-file").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (file) textarea.value = await file.text();
  });
  document.getElementById("submit-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById("submit-msg");
    if (!textarea.value.trim()) return void (msg.innerHTML = `<span class="error-text">The source code is empty.</span>`);
    await submitCode({ problemSlug: form.problemSlug.value, language: form.language.value, code: textarea.value }, msg);
  });

  sidebar.innerHTML = await judgeBox();
}

async function statusPage() {
  setMenu("status");
  const { submissions } = await api("/api/submissions");
  main.innerHTML = box("Status", submissionsTable(submissions), { flush: true, plain: true });
  sidebar.innerHTML = await judgeBox();
  if (submissions.some(s => s.status !== "done")) pollTimer = setTimeout(() => route(), 2000);
}

async function submissionPage(id) {
  setMenu("status");
  const s = await api(`/api/submissions/${encodeURIComponent(id)}`);

  const summary = `<div class="table-wrap"><table class="datatable">
    <thead><tr><th>#</th><th>Problem</th><th class="hide-narrow">Lang</th><th>Verdict</th><th>Time</th><th class="hide-narrow">Memory</th><th class="hide-narrow">Sent</th></tr></thead>
    <tbody><tr>
      <td class="center">${esc(s.id)}</td>
      <td class="center"><a href="/problemset/problem/${esc(s.problemSlug)}" data-link>${esc(s.problemCode)}</a></td>
      <td class="center hide-narrow">${esc(s.language)}</td>
      <td class="center">${verdictHtml(s)}</td>
      <td class="center">${s.status === "done" ? `${esc(s.timeMs)} ms` : ""}</td>
      <td class="center hide-narrow">${s.status === "done" ? `${esc(s.memoryKb)} KB` : ""}</td>
      <td class="center small hide-narrow">${formatWhen(s.createdAt)}</td>
    </tr></tbody></table></div>`;

  const tests = s.tests.length
    ? `<div class="table-wrap"><table class="datatable">
        <thead><tr><th>Test</th><th>Verdict</th><th>Time</th><th>Memory</th></tr></thead>
        <tbody>${s.tests.map(t => `<tr>
          <td class="center">${esc(t.n)}</td>
          <td class="center">${verdictHtml({ status: "done", verdict: t.verdict })}</td>
          <td class="center">${esc(t.timeMs)} ms</td>
          <td class="center">${esc(t.memoryKb)} KB</td>
        </tr>`).join("")}</tbody></table></div>
        ${s.checkerMsg ? `<p class="small" style="padding:0 10px">Checker: <code>${esc(s.checkerMsg)}</code></p>` : ""}`
    : `<p class="muted" style="padding:10px;margin:0">${s.status === "done" ? "No tests were run." : "Waiting for the judge…"}</p>`;

  main.innerHTML =
    box(`Submission ${esc(s.id)}`, summary, { flush: true, plain: true }) +
    (s.compileOutput ? box("Compilation error", `<pre class="source-code">${esc(s.compileOutput)}</pre>`, { flush: true }) : "") +
    box("Tests", tests, { flush: true }) +
    box("Source code", `<pre class="source-code">${esc(s.code)}</pre>`, { flush: true });
  sidebar.innerHTML = "";
  if (s.status !== "done") pollTimer = setTimeout(() => route(), 1000);
}

function adminPage() {
  setMenu("admin");
  main.innerHTML = box("Admin", `<p>Problem management, publishing and rejudge arrive in milestone 4.</p>`, { plain: true });
  sidebar.innerHTML = "";
}

function notFoundPage() {
  setMenu(null);
  main.innerHTML = box("Not found", `<p>This page doesn't exist. <a href="/" data-link>Go home</a>.</p>`, { plain: true });
  sidebar.innerHTML = "";
}

// ---------- router ----------

const routes = [
  [/^\/$/, homePage],
  [/^\/problemset\/?$/, problemsetPage],
  [/^\/problemset\/problem\/([\w-]+)\/?$/, problemPage],
  [/^\/submit\/?$/, submitPage],
  [/^\/status\/?$/, statusPage],
  [/^\/submission\/(\w+)\/?$/, submissionPage],
  [/^\/admin\/?$/, adminPage]
];

async function route() {
  clearTimeout(pollTimer);
  const path = location.pathname;
  const match = routes.find(([re]) => re.test(path));
  try {
    if (!match) return notFoundPage();
    const [re, page] = match;
    await page(...path.match(re).slice(1));
  } catch (err) {
    main.innerHTML = box("Error", `<p class="error-text">${esc(err.message)}</p>`, { plain: true });
  }
}

function navigate(url) {
  history.pushState(null, "", url);
  window.scrollTo(0, 0);
  route();
}

document.addEventListener("click", e => {
  const link = e.target.closest("a[data-link]");
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(link.getAttribute("href"));
});
window.addEventListener("popstate", route);

// ---------- header: session, logout, theme ----------

const themeButton = document.getElementById("cd-theme");
function updateThemeButton() {
  themeButton.textContent = document.documentElement.dataset.theme === "dark" ? "Light mode" : "Dark mode";
}
themeButton.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("cd-theme", dark ? "dark" : "light"); } catch (_) {}
  updateThemeButton();
});
updateThemeButton();

document.getElementById("cd-logout").addEventListener("click", async e => {
  e.preventDefault();
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/login";
});

const session = await fetch("/api/auth/session").then(r => r.json()).catch(() => ({}));
if (session.authEnabled && !session.loggedIn) {
  location.href = "/login";
} else {
  document.getElementById("cd-handle").textContent = session.handle || "akshat";
  if (!session.authEnabled) {
    document.getElementById("cd-logout").hidden = true;
    document.querySelector("#cd-logout + .cd-sep").hidden = true;
  }
  route();
}
