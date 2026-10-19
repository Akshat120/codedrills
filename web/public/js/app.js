// CodeDrills single-page app: a small history router that renders each page
// into the content column and the sidebar, in CodeReflections' layout.
import { initFooter, initTheme } from "./chrome.js";

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
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
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
  if (s.status === "judging") return `<span class="verdict-waiting"><span class="spinner" aria-hidden="true"></span> Running…</span>`;
  const text = VERDICT_TEXT[s.verdict] || s.verdict;
  if (s.verdict === "AC") return `<span class="verdict-accepted">${text}</span>`;
  if (s.verdict === "CE") return `<a class="verdict-rejected" href="/submission/${esc(s.id)}" data-link>${text}</a>`;
  const onTest = s.failedTest ? ` on test ${esc(s.failedTest)}` : "";
  const cls = s.verdict === "TLE" || s.verdict === "MLE" ? "verdict-limit" : "verdict-rejected";
  return `<span class="${cls}">${text}${onTest}</span>`;
}

function formatWhen(iso) {
  const d = new Date(iso);
  const month = d.toLocaleString("en", { month: "short" });
  const pad = n => String(n).padStart(2, "0");
  return `${month}/${pad(d.getDate())}/${d.getFullYear()}<br>${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function box(caption, body, { flush = false, footer = "" } = {}) {
  return `<section class="roundbox">
    <div class="caption">${caption}</div>
    <div class="roundbox-body${flush ? " flush" : ""}">${body}</div>
    ${footer ? `<div class="roundbox-footer">${footer}</div>` : ""}
  </section>`;
}

function intro(title, text) {
  return `<div class="page-intro"><h1 class="page-title">${title}</h1>${text ? `<p>${text}</p>` : ""}</div>`;
}

function setTitle(title) {
  document.title = title ? `${title} · CodeDrills` : "CodeDrills";
}

// Languages come from the server (src/data/languages.js), asked for once
let languagesRequest = null;
function getLanguages() {
  languagesRequest ||= api("/api/languages").then(d => d.languages);
  return languagesRequest;
}

function languageOptions(langs) {
  return langs.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("");
}

function fileAccept(langs) {
  return langs.flatMap(l => l.extensions).join(",");
}

function languageForFile(langs, name) {
  const lower = name.toLowerCase();
  return langs.find(l => l.extensions.some(ext => lower.endsWith(ext)));
}

// Page numbers to show: first, last, and a window around the current page
function paginationItems(current, total) {
  const pages = new Set([1, total]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push("…");
    items.push(p);
  });
  return items;
}

// CodeReflections' page links; each is a real link to its page's URL
function buildPagination(current, total, urlFor) {
  if (total <= 1) return "";
  const arrow = (label, page, disabled, aria) => disabled
    ? `<span class="cf-page is-disabled" aria-hidden="true">${label}</span>`
    : `<a href="${urlFor(page)}" class="cf-page" data-link aria-label="${aria}">${label}</a>`;
  return `
    <nav class="cf-pagination" aria-label="Problemset pages">
      ${arrow("←", current - 1, current === 1, "Previous page")}
      ${paginationItems(current, total).map(item => item === "…"
        ? `<span class="cf-page-gap">…</span>`
        : item === current
          ? `<span class="cf-page is-active" aria-current="page">${item}</span>`
          : `<a href="${urlFor(item)}" class="cf-page" data-link>${item}</a>`).join("")}
      ${arrow("→", current + 1, current === total, "Next page")}
    </nav>`;
}

// "cd17", "CD0017", "cd-17" → "CD0017"; null for anything else (same rule as
// normalizeCode in src/data/platforms.js)
function normalizeProblemCode(text) {
  const match = /^\s*cd\s*-?\s*(\d{1,6})\s*$/i.exec(String(text || ""));
  return match ? `CD${match[1].padStart(4, "0")}` : null;
}

// "Codeforces 1904A ↗" (linked when the original's URL is known), or the
// platform name alone; "Original" for problems not based on another site
function sourceHtml(p) {
  if (!p.source?.id) return p.sourcePlatform === "original" ? `<span class="muted">Original</span>` : esc(p.sourceName);
  const label = `${esc(p.sourceName)} ${esc(p.source.id)}`;
  return p.source.url
    ? `<a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`
    : label;
}

function renderMath(el) {
  window.renderMathInElement?.(el, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false }
    ],
    throwOnError: false
  });
}

function submissionsTable(list, { compact = false } = {}) {
  if (!list.length) return `<p class="hint" style="margin:0;padding:8px 10px">No submissions yet.</p>`;
  const head = compact
    ? `<tr><th>#</th><th>When</th><th>Verdict</th></tr>`
    : `<tr><th>#</th><th class="hide-narrow">When</th><th class="hide-narrow">Who</th><th>Problem</th><th class="hide-narrow">Lang</th><th>Verdict</th><th>Time</th><th class="hide-narrow">Memory</th></tr>`;
  const rows = list.map(s => compact
    ? `<tr>
        <td><a href="/submission/${esc(s.id)}" data-link>${esc(s.id)}</a></td>
        <td class="col-when">${formatWhen(s.createdAt)}</td>
        <td>${verdictHtml(s)}</td>
      </tr>`
    : `<tr>
        <td class="col-id"><a href="/submission/${esc(s.id)}" data-link>${esc(s.id)}</a></td>
        <td class="col-when hide-narrow">${formatWhen(s.createdAt)}</td>
        <td class="hide-narrow"><span class="user-handle">akshat</span></td>
        <td class="col-left"><a href="/problemset/problem/${esc(s.problemCode)}" data-link>${esc(s.problemCode)} - ${esc(s.problemTitle)}</a></td>
        <td class="hide-narrow">${esc(s.languageName)}</td>
        <td>${verdictHtml(s)}</td>
        <td class="col-mono">${s.status === "done" ? `${esc(s.timeMs)} ms` : ""}</td>
        <td class="col-mono hide-narrow">${s.status === "done" ? `${esc(s.memoryKb)} KB` : ""}</td>
      </tr>`).join("");
  return `<div class="table-wrap"><table class="datatable"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- sidebar widgets ----------

let judgeStatusRequest = null;

async function loadJudgeStatus() {
  const judgeStatus = await api("/api/judge/status").catch(() => ({ online: false, message: "Status unknown." }));
  const signal = document.getElementById("judge-signal");
  signal.classList.toggle("is-online", judgeStatus.online);
  signal.classList.toggle("is-offline", !judgeStatus.online);
  document.getElementById("judge-signal-text").textContent = judgeStatus.online ? "judge" : "offline";
  signal.title = judgeStatus.online ? "Judge online" : `Judge offline. ${judgeStatus.message}`;
  return judgeStatus;
}

async function payAttentionBox() {
  judgeStatusRequest ||= loadJudgeStatus();
  const status = await judgeStatusRequest;
  return box("Pay attention", `
    <div class="contest-subhead">Judge</div>
    <div class="contest-line">${status.online
      ? `<span class="verdict-accepted">Online</span>`
      : `<span class="verdict-limit"><b>Offline</b></span><br><span class="hint">${esc(status.message)}</span>`}</div>`);
}

async function progressBox(progressRequest = api("/api/problems/progress")) {
  const p = await progressRequest;
  const avg = p.averageDifficulty;
  return box("Your Progress", `
    <div class="progress-stats">
      <div class="stat-row"><span>Problems solved</span><b>${p.solved} / ${p.total}</b></div>
      <div class="stat-row"><span>Attempted, not solved</span><b>${p.attempted}</b></div>
      <div class="stat-row"><span>Submissions</span><b>${p.submissions}</b></div>
      <div class="stat-row"><span>Average difficulty</span><b class="${avg ? ratingClass(avg) : ""}">${avg ?? "—"}</b></div>
    </div>
    <p class="sidebar-more"><a href="/status" data-link>All submissions →</a></p>`);
}

// ---------- pages ----------

async function homePage() {
  setTitle("");
  main.innerHTML = `
    <article class="post-card">
      <h2 class="post-title">Welcome to CodeDrills</h2>
      <div class="post-meta">By <span class="user-handle">akshat</span></div>
      <div class="post-content-wrap">
        <p>A private practice judge with an original problem bank. Pick a problem from the
        <a href="/problemset" data-link>problemset</a>, submit a solution, and get a verdict on every test.</p>
        <p>Every problem's tests are checked before publishing: inputs are validated, the reference
        solution is stress-tested against a brute force, and its running time is measured on the judge.</p>
      </div>
      <div class="message">Sample data: problems and submissions come from <code>npm run seed</code>. Only CD0001 has tests on the judge so far.</div>
    </article>`;
  sidebar.innerHTML = (await payAttentionBox()) + (await progressBox());
}

// The problemset is drawn once (the shell), then each page change, filter or
// back/forward only swaps the rows, the page links and the count in place,
// so the layout doesn't jump. While a page is being fetched the current rows
// fade and the caption says so; a response that arrives after a newer request
// was made is dropped.
let problemsetRequestId = 0;

const PS_LOADING_DELAY_MS = 120; // fast responses swap without a flash

function problemsetShell(params) {
  main.innerHTML =
    intro("Problemset", "Problems written for CodeDrills, some inspired by Codeforces, LeetCode, AtCoder and GeeksforGeeks. Green rows are solved, red rows were attempted.") +
    `<section class="roundbox" id="problemset-box">
      <div class="caption">Problems <span id="ps-total"></span>
        <span class="fetching" id="ps-fetching" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Fetching problems…</span>
      </div>
      <div class="roundbox-body flush">
        <div class="table-wrap"><table class="datatable problemset-table">
          <colgroup><col class="w-id"><col><col class="w-source"><col class="w-difficulty"><col class="w-solved"></colgroup>
          <thead><tr><th>#</th><th class="col-left">Name</th><th class="col-source">Source</th><th><span class="label-long">Difficulty</span><span class="label-short" title="Difficulty">Diff.</span></th><th><span class="label-long">Solved</span><span class="label-short" title="Solved">AC</span></th></tr></thead>
          <tbody id="ps-rows"><tr class="loading-row"><td colspan="5"><span class="spinner" aria-hidden="true"></span>Fetching problems…</td></tr></tbody>
        </table></div>
        <div id="ps-pager"></div>
      </div>
    </section>`;

  sidebar.innerHTML = box("Filter Problems", `
    <form class="cf-filter-form" id="filter-form">
      <div>
        <label class="cf-filter-label" for="filter-q">Search problem:</label>
        <input type="text" id="filter-q" name="q" class="cf-input" placeholder="Name, CD0017 or source ID" autocomplete="off">
      </div>
      <div>
        <label class="cf-filter-label" for="filter-tag">Tag:</label>
        <select id="filter-tag" name="tag" class="cf-select"><option value="">All tags</option></select>
      </div>
      <div>
        <label class="cf-filter-label" for="filter-source">Source:</label>
        <select id="filter-source" name="source" class="cf-select"><option value="">All sources</option></select>
      </div>
      <div>
        <label class="cf-filter-label">Difficulty:</label>
        <div class="cf-difficulty-inputs">
          <input type="number" name="min" class="cf-input" min="800" max="3500" step="100" placeholder="800" aria-label="Minimum difficulty">
          <span>—</span>
          <input type="number" name="max" class="cf-input" min="800" max="3500" step="100" placeholder="3500" aria-label="Maximum difficulty">
        </div>
      </div>
      <div>
        <label class="cf-filter-label" for="filter-per-page">Per page:</label>
        <select id="filter-per-page" name="perPage" class="cf-select">
          ${[10, 25, 50, 100].map(n => `<option value="${n}">${n} problems</option>`).join("")}
        </select>
      </div>
      <div class="cf-filter-actions">
        <a class="btn" href="/problemset" data-link>Reset</a>
        <button class="btn" type="submit">Apply</button>
      </div>
    </form>`) + `<div id="ps-progress"></div>`;

  // The progress box doesn't depend on the page, so it loads once, on its own
  progressBox().then(html => {
    const slot = document.getElementById("ps-progress");
    if (slot) slot.innerHTML = html;
  }).catch(() => {});

  // Applying filters starts again from page 1; the default page size stays
  // out of the URL
  const form = document.getElementById("filter-form");
  const applyFilters = () => {
    const query = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (String(v).trim()) query.set(k, String(v).trim());
    if (query.get("perPage") === "25") query.delete("perPage");
    navigate(`/problemset${query.size ? `?${query}` : ""}`);
  };
  form.addEventListener("submit", e => {
    e.preventDefault();
    applyFilters();
  });
  document.getElementById("filter-per-page").addEventListener("change", applyFilters);
  syncFilterForm(params, null);
}

// Puts the URL's filters into the form (needed for back/forward and links)
function syncFilterForm(params, data) {
  const form = document.getElementById("filter-form");
  if (!form) return;
  const tagSelect = form.elements.tag;
  if (data && tagSelect.options.length !== data.tags.length + 1) {
    tagSelect.innerHTML = `<option value="">All tags (${data.tags.length})</option>` +
      data.tags.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  }
  const sourceSelect = form.elements.source;
  if (data && sourceSelect.options.length !== data.platforms.length + 1) {
    sourceSelect.innerHTML = `<option value="">All sources</option>` +
      data.platforms.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  }
  sourceSelect.value = params.get("source") || "";
  form.elements.q.value = params.get("q") || "";
  tagSelect.value = params.get("tag") || "";
  form.elements.min.value = params.get("min") || "";
  form.elements.max.value = params.get("max") || "";
  form.elements.perPage.value = String(data?.perPage || params.get("perPage") || 25);
}

function problemRows(problems) {
  if (!problems.length) return `<tr><td colspan="5" class="muted">No problems match.</td></tr>`;
  return problems.map(p => `
    <tr class="${p.status === "accepted" ? "accepted-problem" : p.status === "attempted" ? "rejected-problem" : ""}">
      <td class="col-id"><a href="/problemset/problem/${esc(p.code)}" data-link>${esc(p.code)}</a></td>
      <td class="col-left">
        <div class="problem-name">
          <a href="/problemset/problem/${esc(p.code)}" data-link>${esc(p.title)}</a>
          <div class="problem-tags">${p.tags.map(t => `<a href="/problemset?tag=${encodeURIComponent(t)}" data-link>${esc(t)}</a>`).join(", ")}</div>
        </div>
      </td>
      <td class="col-source">${sourceHtml(p)}</td>
      <td><span class="${ratingClass(p.difficulty)}">${esc(p.difficulty)}</span></td>
      <td>${p.acceptedCount ? `<span title="My accepted submissions">✓ x${esc(p.acceptedCount)}</span>` : ""}</td>
    </tr>`).join("");
}

async function problemsetPage() {
  setTitle("Problemset");
  const params = new URLSearchParams(location.search);
  const requestId = ++problemsetRequestId;
  if (!document.getElementById("problemset-box")) problemsetShell(params);

  const psBox = document.getElementById("problemset-box");
  const loadingTimer = setTimeout(() => psBox.classList.add("is-loading"), PS_LOADING_DELAY_MS);
  let data;
  try {
    data = await api(`/api/problems?${params}`);
  } finally {
    clearTimeout(loadingTimer);
    if (requestId === problemsetRequestId) psBox.classList.remove("is-loading");
  }
  // A newer page was asked for meanwhile, or the user left the problemset
  if (requestId !== problemsetRequestId || !document.body.contains(psBox)) return;

  // The server shows the last page when asked for one past the end
  if (params.get("page") && Number(params.get("page")) !== data.page) {
    params.set("page", data.page);
    history.replaceState(null, "", `/problemset?${params}`);
  }
  const pageUrl = page => {
    const next = new URLSearchParams(params);
    if (page > 1) next.set("page", page);
    else next.delete("page");
    return `/problemset${next.size ? `?${next}` : ""}`;
  };
  const first = (data.page - 1) * data.perPage + 1;
  const last = first + data.problems.length - 1;

  document.getElementById("ps-total").textContent = `(${data.total})`;
  document.getElementById("ps-rows").innerHTML = problemRows(data.problems);
  document.getElementById("ps-pager").innerHTML =
    buildPagination(data.page, data.totalPages, pageUrl) +
    (data.total ? `<div class="pagination-count">Showing ${first}–${last} of ${data.total}</div>` : "");
  syncFilterForm(params, data);
}

async function problemPage(code) {
  const [p, subs, langs] = await Promise.all([
    api(`/api/problems/${encodeURIComponent(code)}`),
    api(`/api/submissions?problem=${encodeURIComponent(code)}`),
    getLanguages()
  ]);
  setTitle(`${p.code} ${p.title}`);

  const samples = p.samples.map((s, i) => `
    <div class="sample-tests">
      <div class="sample-box">
        <div class="sample-title">Input <button type="button" class="btn btn-sm" data-copy="in${i}">Copy</button></div>
        <pre id="in${i}">${esc(s.input)}</pre>
      </div>
      <div class="sample-box">
        <div class="sample-title">Output <button type="button" class="btn btn-sm" data-copy="out${i}">Copy</button></div>
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
    : `<p class="hint center">The statement for this problem hasn't been written yet.</p>`;

  main.innerHTML = `<section class="roundbox">
    <div class="problem-statement">
      <div class="header">
        <div class="title">${esc(p.code)}. ${esc(p.title)}</div>
        ${p.source?.id ? `<div class="property inspired-by">Inspired by ${sourceHtml(p)}</div>` : ""}
        <div class="property"><span class="property-title">time limit per test</span> ${p.timeLimitMs / 1000} second${p.timeLimitMs === 1000 ? "" : "s"}</div>
        <div class="property"><span class="property-title">memory limit per test</span> ${esc(p.memoryLimitMb)} megabytes</div>
        <div class="property"><span class="property-title">input</span> standard input</div>
        <div class="property"><span class="property-title">output</span> standard output</div>
      </div>
      ${body}
    </div>
  </section>`;
  renderMath(main);

  main.querySelectorAll("[data-copy]").forEach(btn => btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById(btn.dataset.copy).textContent);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    } catch (_) {}
  }));

  sidebar.innerHTML =
    box("Submit?", `
      <form id="quick-submit" class="cf-filter-form">
        <div>
          <label class="cf-filter-label" for="quick-lang">Language:</label>
          <select id="quick-lang" name="language" class="cf-select">${languageOptions(langs)}</select>
        </div>
        <div>
          <label class="cf-filter-label" for="quick-file">Choose file:</label>
          <input id="quick-file" type="file" name="file" accept="${fileAccept(langs)}">
        </div>
        <div class="cf-filter-actions"><button class="btn" type="submit">Submit</button></div>
        <div id="quick-msg"></div>
      </form>`) +
    box("Last submissions", submissionsTable(subs.submissions.slice(0, 5), { compact: true }), { flush: true }) +
    box("Problem tags", `${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}<span class="tag ${ratingClass(p.difficulty)}" title="Difficulty">*${esc(p.difficulty)}</span>`);

  document.getElementById("quick-file").addEventListener("change", e => {
    const lang = e.target.files[0] && languageForFile(langs, e.target.files[0].name);
    if (lang) document.getElementById("quick-lang").value = lang.id;
  });
  document.getElementById("quick-submit").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("quick-msg");
    const file = e.target.file.files[0];
    if (!file) return showMessage(msg, "Choose a file first.", true);
    await submitCode({ problemCode: p.code, language: e.target.language.value, code: await file.text() }, msg);
  });
}

function showMessage(el, text, isError) {
  el.innerHTML = `<div class="message${isError ? " error" : ""}"></div>`;
  el.firstChild.textContent = text;
}

async function submitCode(payload, msgEl) {
  showMessage(msgEl, "Submitting…", false);
  try {
    const { id } = await api("/api/submissions", { method: "POST", body: JSON.stringify(payload) });
    navigate(`/submission/${id}`);
  } catch (err) {
    showMessage(msgEl, err.message, true);
  }
}

async function submitPage() {
  setTitle("Submit");
  const langs = await getLanguages();
  const preselect = new URLSearchParams(location.search).get("problem") || "";
  main.innerHTML =
    intro("Submit solution", `Paste the code or choose a file. Languages: ${esc(langs.map(l => l.name).join(", "))}.`) +
    box("Submit", `
      <form id="submit-form" class="submit-grid">
        <label for="sub-problem">Problem:</label>
        <div class="problem-code-field">
          <input type="text" id="sub-problem" name="problemCode" class="cf-input" placeholder="e.g. CD0017"
                 value="${esc(preselect)}" autocomplete="off" spellcheck="false" maxlength="12" aria-describedby="sub-problem-info">
          <span id="sub-problem-info" class="problem-code-info" aria-live="polite"></span>
        </div>
        <label for="sub-lang">Language:</label>
        <select id="sub-lang" name="language" class="cf-select">${languageOptions(langs)}</select>
        <label class="full" for="sub-code" style="text-align:left">Source code:</label>
        <div class="full"><textarea id="sub-code" class="code-editor" name="code" spellcheck="false"></textarea></div>
        <label for="sub-file">Or choose file:</label>
        <input id="sub-file" type="file" accept="${fileAccept(langs)}">
        <div class="full action-buttons"><button class="btn" type="submit">Submit</button></div>
        <div class="full" id="submit-msg"></div>
      </form>`);

  // The problem is typed as its code (cd17, CD0017) and looked up as you type
  const problemInput = document.getElementById("sub-problem");
  const problemInfo = document.getElementById("sub-problem-info");
  let lookupTimer = null;
  let lookupId = 0;
  let resolved = null; // { code, title } of the problem the field names, or null

  async function lookUpProblem() {
    const requestId = ++lookupId;
    resolved = null;
    const text = problemInput.value.trim();
    const code = normalizeProblemCode(text);
    if (!text) return void (problemInfo.innerHTML = "");
    if (!code) return showProblemInfo("Enter a problem code like CD0017.", true);
    showProblemInfo("Looking up…", false);
    try {
      const p = await api(`/api/problems/${code}`);
      if (requestId !== lookupId) return;
      resolved = { code: p.code, title: p.title };
      problemInfo.innerHTML = `<a href="/problemset/problem/${esc(p.code)}" data-link>${esc(p.code)}. ${esc(p.title)}</a>`;
    } catch (_) {
      if (requestId === lookupId) showProblemInfo(`No problem ${code}.`, true);
    }
  }

  function showProblemInfo(text, isError) {
    problemInfo.innerHTML = `<span class="${isError ? "error-text" : "muted"}"></span>`;
    problemInfo.firstChild.textContent = text;
  }

  problemInput.addEventListener("input", () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookUpProblem, 250);
  });
  if (preselect) lookUpProblem();

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
    if (!file) return;
    textarea.value = await file.text();
    const lang = languageForFile(langs, file.name);
    if (lang) document.getElementById("sub-lang").value = lang.id;
  });
  document.getElementById("submit-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById("submit-msg");
    clearTimeout(lookupTimer);
    if (!resolved || resolved.code !== normalizeProblemCode(problemInput.value)) await lookUpProblem();
    if (!resolved) {
      problemInput.focus();
      return showMessage(msg, problemInput.value.trim() ? "Enter the code of an existing problem, like CD0017." : "Enter the problem code.", true);
    }
    if (!textarea.value.trim()) return showMessage(msg, "The source code is empty.", true);
    await submitCode({ problemCode: resolved.code, language: form.language.value, code: textarea.value }, msg);
  });

  sidebar.innerHTML = await payAttentionBox();
}

async function statusPage() {
  setTitle("Status");
  const { submissions } = await api("/api/submissions");
  main.innerHTML =
    intro("Status", "All my submissions, newest first.") +
    box(`Submissions (${submissions.length})`, submissionsTable(submissions), { flush: true });
  sidebar.innerHTML = (await payAttentionBox()) + (await progressBox());
  if (submissions.some(s => s.status !== "done")) pollTimer = setTimeout(route, 2000);
}

async function submissionPage(id) {
  const s = await api(`/api/submissions/${encodeURIComponent(id)}`);
  // This page starts judging a queued submission right away, so show it as running
  const startJudging = s.status === "queued";
  if (startJudging) s.status = "judging";
  setTitle(`Submission ${s.id}`);

  const summary = `<div class="table-wrap"><table class="datatable">
    <thead><tr><th>#</th><th>Problem</th><th class="hide-narrow">Lang</th><th>Verdict</th><th>Time</th><th class="hide-narrow">Memory</th><th class="hide-narrow">Sent</th></tr></thead>
    <tbody><tr>
      <td>${esc(s.id)}</td>
      <td><a href="/problemset/problem/${esc(s.problemCode)}" data-link>${esc(s.problemCode)} - ${esc(s.problemTitle)}</a></td>
      <td class="hide-narrow">${esc(s.languageName)}</td>
      <td>${verdictHtml(s)}</td>
      <td class="col-mono">${s.status === "done" ? `${esc(s.timeMs)} ms` : ""}</td>
      <td class="col-mono hide-narrow">${s.status === "done" ? `${esc(s.memoryKb)} KB` : ""}</td>
      <td class="col-when hide-narrow">${formatWhen(s.createdAt)}</td>
    </tr></tbody></table></div>`;

  const tests = s.tests?.length
    ? `<div class="table-wrap"><table class="datatable">
        <thead><tr><th>Test</th><th>Verdict</th><th>Time</th><th>Memory</th></tr></thead>
        <tbody>${(s.tests || []).map(t => `<tr>
          <td>${esc(t.n)}</td>
          <td>${verdictHtml({ status: "done", verdict: t.verdict })}</td>
          <td class="col-mono">${esc(t.timeMs)} ms</td>
          <td class="col-mono">${esc(t.memoryKb)} KB</td>
        </tr>`).join("")}</tbody></table></div>`
    : `<p class="hint" style="margin:0;padding:8px 10px">${s.status === "done" ? "No tests were run." : "Waiting for the judge…"}</p>`;

  main.innerHTML =
    intro(`Submission ${esc(s.id)}`, "") +
    box("Summary", summary, { flush: true }) +
    (s.compileOutput ? box("Compilation error", `<pre class="source-code">${esc(s.compileOutput)}</pre>`, { flush: true }) : "") +
    box("Tests", tests, { flush: true, footer: s.checkerMsg ? `Checker: <code>${esc(s.checkerMsg)}</code>` : "" }) +
    box("Source code", `<pre class="source-code">${esc(s.code)}</pre>`, { flush: true });
  sidebar.innerHTML = await payAttentionBox();
  // A queued submission is judged by asking for it here (the request returns
  // once the verdicts are in); one being judged elsewhere is polled
  if (startJudging) {
    const judgingId = s.id;
    api(`/api/submissions/${encodeURIComponent(judgingId)}/judge`, { method: "POST", body: "{}" })
      .catch(() => {})
      .then(() => {
        if (location.pathname === `/submission/${judgingId}`) route();
      });
  } else if (s.status !== "done") {
    pollTimer = setTimeout(route, 1500);
  }
}

async function adminPage() {
  setTitle("Admin");
  main.innerHTML =
    intro("Admin", "Problem management, publishing and rejudging arrive in milestone 4.") +
    box("Coming later", `<p style="margin:0">Nothing to manage yet: problems come from the sample data (<code>npm run seed</code>).</p>`);
  sidebar.innerHTML = await payAttentionBox();
}

function notFoundPage() {
  setTitle("Not found");
  main.innerHTML = intro("Page not found", `This page doesn't exist. <a href="/" data-link>Go home</a>.`);
  sidebar.innerHTML = "";
}

// ---------- router and navigation ----------

const routes = [
  [/^\/$/, "home", homePage],
  [/^\/problemset\/?$/, "problemset", problemsetPage],
  [/^\/problemset\/problem\/([\w-]+)\/?$/, "problemset", problemPage],
  [/^\/submit\/?$/, "submit", submitPage],
  [/^\/status\/?$/, "status", statusPage],
  [/^\/submission\/(\w+)\/?$/, "status", submissionPage],
  [/^\/admin\/?$/, "admin", adminPage]
];

const navBar = document.querySelector(".main-nav");
const navToggle = document.getElementById("nav-toggle");

function setNavOpen(open) {
  navBar.classList.toggle("nav-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
}

function setActiveNav(key) {
  document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.menu === key));
  const active = document.querySelector(".nav-link.active");
  document.getElementById("nav-toggle-label").textContent = active ? active.textContent.trim() : "Menu";
  setNavOpen(false);
}

async function route() {
  clearTimeout(pollTimer);
  const path = location.pathname;
  const match = routes.find(([re]) => re.test(path));
  setActiveNav(match?.[1]);
  try {
    if (!match) return notFoundPage();
    const [re, , page] = match;
    await page(...path.match(re).slice(1));
  } catch (err) {
    main.innerHTML = intro("Something went wrong", "") + `<div class="message error">${esc(err.message)}</div>`;
  }
}

function navigate(url) {
  history.pushState(null, "", url);
  window.scrollTo(0, 0);
  route();
}

document.addEventListener("click", e => {
  const link = e.target.closest("a[data-link]");
  if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    navigate(link.getAttribute("href"));
  }
  if (!navBar.contains(e.target)) setNavOpen(false);
});
window.addEventListener("popstate", route);

navToggle.addEventListener("click", () => setNavOpen(!navBar.classList.contains("nav-open")));
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && navBar.classList.contains("nav-open")) {
    setNavOpen(false);
    navToggle.focus();
  }
});

// Header search: jump to a problem by its code (CD17, cd0017), else search
document.getElementById("nav-search").addEventListener("submit", async e => {
  e.preventDefault();
  const input = document.getElementById("nav-search-input");
  const q = input.value.trim();
  if (!q) return;
  const code = normalizeProblemCode(q);
  input.value = "";
  navigate(code ? `/problemset/problem/${code}` : `/problemset?q=${encodeURIComponent(q)}`);
});

// ---------- start ----------

initTheme();
initFooter();

const session = (await window.__sessionCheck) || {};
if (session.authEnabled && session.loggedIn) {
  const logout = document.getElementById("btn-logout");
  logout.classList.remove("hidden");
  logout.addEventListener("click", async e => {
    e.preventDefault();
    await fetch("/api/auth/logout", { method: "POST" });
    location.replace("/login");
  });
}
if (!session.authEnabled || session.loggedIn) {
  judgeStatusRequest = loadJudgeStatus();
  route();
}
