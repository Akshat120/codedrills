# CodeDrills design (v2: Cloudflare)

A private, single-user competitive-programming judge with an original problem
bank, at `codedrills.akshatdhiman.in`. Independent of CodeReflections; the only
link between them is a URL (see the last section).

Changes from v1: the web app runs on **Cloudflare Workers** (not Vercel), the
system is split into **two repos**, problems are built by **GitHub Actions**
(not on a laptop), and the judge is a **custom `isolate` worker** that pulls
work from MongoDB (not Judge0).

## 1. Architecture and ownership

```
                         Browser (you)
                              │ HTTPS
                              ▼
 ┌─────────────── Cloudflare (free plan) ───────────────┐
 │ Static assets: SPA, CSS, KaTeX, CodeMirror  (free)   │
 │ Worker "codedrills": Express 5 API on /api/*         │
 │   login, sessions, queue submissions, admin, publish │
 │ R2 bucket "codedrills" (private)                     │
 │   tests/<sha256>.zip     backups/<date>.archive.gz   │
 └───────────────┬──────────────────────▲───────────────┘
                 │ mongodb driver        │ read tests / write backups
                 ▼                       │ (scoped R2 tokens)
        MongoDB Atlas M0  ◄──── claim jobs, write verdicts (outbound TLS) ────┐
   problems, submissions                                                       │
   (= the queue), builds,                                         Judge VPS (2 vCPU / 4 GB)
   sessions, judge status                                         worker (Node 22, systemd)
                 ▲                                                isolate 2.x, cgroup v2
                 │ build results                                  test cache on disk
                 │                                                no inbound ports (SSH only)
 GitHub: codedrills-problems (private)
   push → Actions runs ghcr.io/<you>/codedrills-toolchain:vN
   → validate, stress, generate, outputs → upload tests to R2, write build to Mongo

 GitHub: codedrills (app; public or private)
   web/ → Cloudflare (wrangler deploy)   judge/ → VPS   pipeline/ → GHCR image
```

| System | Owns | Never does |
|---|---|---|
| Cloudflare Worker | API, auth, sessions, queueing, admin, publish gate | Run submitted code, call GitHub or the judge |
| Cloudflare static assets | All pages, CSS, JS, fonts | — |
| Cloudflare R2 | Hidden test packages, DB backups | Serve tests publicly |
| MongoDB Atlas | All state; the `submissions` collection is the queue | — |
| Judge VPS | Compile and run submissions in isolate, calibration runs, nightly backup | Accept inbound connections, hold write access to tests |
| GitHub Actions (problems repo) | The build pipeline; the only writer of tests | Judge user submissions |
| `codedrills` repo | App code, toolchain image | Contain problems, solutions or tests |

Components talk only through two versioned contracts: the **test package
format** (in R2) and the **MongoDB schema**. The judge rejects a package whose
format version it doesn't support.

## 2. Web app on Workers

Same pattern as CodeReflections:

- `wrangler.toml` with `nodejs_compat`; `[assets]` serves `./public` with
  `not_found_handling = "single-page-application"`; `run_worker_first =
  ["/api/*", "/health"]`.
- `src/entry.cloudflare.js` wraps the Express app with `httpServerHandler`; a
  MongoDB client per request (Workers can't share connections between requests).
- The same Express app runs with plain Node locally (`npm run dev`).
- Password: scrypt hash in `APP_PASSWORD_HASH` (`npm run hash-password`), set
  as a Worker secret.
- Heavy work stays off the Worker: Markdown + KaTeX are rendered to sanitized
  HTML by the build pipeline; compiling and judging happen on the VPS.
- Free-plan budget: ~100k dynamic requests/day shared with CodeReflections.
  Expected use is a few thousand on a busy day. Fallback: Workers Paid ($5/mo),
  no code change.

## 3. Judge: custom `isolate` worker (not Judge0)

| | Judge0 | `isolate` worker |
|---|---|---|
| Sandbox | Privileged Docker container (CVE-2024-28185/28189 host escapes) | isolate on the host, no privileged container |
| cgroups | Needs cgroup v1 (boot flag on Ubuntu 24.04) | cgroup v2 |
| Multi-test | One compile per test, test data sent per call | Compile once, tests from local cache |
| testlib checkers | Awkward | Native |
| Services | API, Postgres, Redis, workers | One Node process |

Worker loop: atomically claim the oldest `queued` submission (lease 2 min,
renewed while running) → fetch the test package by sha256 if not cached →
compile in a box (30 s wall, 1 GB, 64 KB log) → run tests in order, stop at the
first failure, update `currentTest` after each → run the checker in its own box
→ write verdicts. Expired leases are reclaimed; after 3 attempts the verdict is
"Judgement failed".

Languages: not C++ only. Each language is an entry with an id, a compile
command (or none) and a run command; the web app lists the same ids in
`web/src/data/languages.js`. C++17 is the first; which others to add is open.

Per-run limits: `--cg-mem` = memory limit, CPU = TL, wall = 3×TL,
`--processes=1`, `--fsize` 64 MB, no network, empty env, read-only mounts,
stack = memory limit. Compile flags: `g++ -std=gnu++17 -O2 -pipe -static
-DONLINE_JUDGE`. One run at a time, pinned to one core.

## 4. Problem pipeline (GitHub Actions, `codedrills-problems` repo)

Triggered by a push touching `problems/<slug>/**` (or manually from the Actions
tab). Runs in the pinned toolchain image, which uses the same g++ as the judge.

1. Compile solution, brute, gen, validator, checker (testlib.h).
2. Validate every manual and generated input.
3. Stress solution vs brute on N small seeds; stop at the first mismatch and
   print seed, input and both outputs.
4. Generate final tests from `tests.txt` (manual files + generator lines,
   including max sizes).
5. Produce answers; reference max time must be ≤ TL/3 on the runner.
6. Render the statement to HTML, zip the tests, upload to R2 by sha256, write
   the build record (step results, `sourceHash`, commit SHA) to MongoDB.
7. Queue a calibration run on the judge: reference must get AC with max time
   ≤ TL/2.

Publishing is refused unless every step passed for the current `sourceHash`.

## 5. Data model (MongoDB)

```js
problems    { _id, slug, code, title, statementHtml, samples: [{input, output}],
              timeLimitMs, memoryLimitMb, tags, difficulty, checker,
              published, buildId, createdAt, updatedAt }
builds      { _id, slug, commit, sourceHash, status: requested|running|passed|failed,
              steps: [{name, ok, ms, log}], package: {sha256, r2Key, formatVersion, testCount},
              localMaxMs, judgeMaxMs, logUrl, createdAt }
submissions { _id, problemId, problemSlug, language /* id, e.g. "cpp17" */, code, codeBytes,
              status: queued|compiling|running|done, verdict: AC|WA|TLE|MLE|RE|CE|IE|null,
              failedTest, currentTest, timeMs, memoryKb, compileOutput,
              tests: [{n, verdict, timeMs, memoryKb, checkerMsg}],
              buildId, kind: user|calibration, lease: {workerId, until},
              attempts, createdAt, finishedAt }
sessions      { _id, createdAt, expiresAt }   TTL index
loginAttempts { key, at }                     TTL index
judgeStatus   { workerId, lastHeartbeat, version }
```

## 6. API routes (Worker)

```
POST /api/auth/login | POST /api/auth/logout | GET /api/auth/me
GET  /api/problems?q=&tags=&min=&max=&page=
GET  /api/problems/:slug
POST /api/submissions            {problemSlug, language, code}
GET  /api/submissions?problem=&page=
GET  /api/submissions/:id        polled every 1 s until done
GET  /api/judge/status
GET  /api/admin/problems
PUT  /api/admin/problems/:slug   tags, difficulty, code (not statement/tests)
POST /api/admin/problems/:slug/publish | /unpublish
POST /api/admin/submissions/:id/rejudge
POST /api/admin/problems/:slug/rejudge
GET  /api/admin/builds?slug=
```

Pages (static SPA): `/`, `/problemset`, `/problemset/problem/:slug`, `/submit`,
`/status`, `/submission/:id`, `/admin`.

## 7. Hosting and cost

| Item | Choice | $/month |
|---|---|---|
| Web | Cloudflare Workers Free + static assets | 0 |
| Tests, backups | Cloudflare R2 (< 10 GB) | 0 |
| Database | MongoDB Atlas M0 | 0 |
| Builds | GitHub Actions (~2–5 min/build of 2,000 free) | 0 |
| Toolchain image | GHCR | 0 |
| Judge | Hetzner shared 2 vCPU / 4 GB (~€5) or dedicated (~€14) | 5–15 |
| **Total** | | **≈ 5–15** |

## 8. Security

| Risk | Handling |
|---|---|
| Sandbox escape | isolate (namespaces + cgroup v2), sandboxed compile, no network; VPS holds only a judge-scoped Mongo user, a read-only R2 token for `tests/`, a write-only token for `backups/`; unattended upgrades |
| Judge exposure | Pull model, no inbound ports; ufw + key-only SSH (or Tailscale) |
| Password brute force | scrypt, constant-time compare, rate limit in Mongo plus a Cloudflare rate-limiting rule on `/api/auth/login` |
| Session theft / CSRF | Random session id in Mongo, `HttpOnly; Secure; SameSite=Strict`, Origin check on mutations |
| XSS | Statements sanitized at build; compiler/checker output via `textContent`; CSP in `public/_headers` |
| Test leakage | Tests only in private R2 and the judge cache; no route serves them |
| Queue abuse | 64 KB code cap, per-minute submit limit, queue cap, leases + retry limit |
| DB misuse | Separate Atlas users for Worker, judge and Actions; schema validation on input |
| Secrets in git | `.env*` ignored, `.env.example` only, gitleaks hook; Worker secrets via `wrangler secret`, GitHub Actions secrets, systemd env file |
| Data loss | Nightly `mongodump` to R2 (30 days); tests content-addressed; sources in git |

## 9. Milestones

1. `codedrills` repo, local dev (Express on Node + `wrangler dev`; Docker
   Compose for MongoDB + judge), login, Codeforces-style layout, problem list
   and page with a hard-coded sample problem.
2. Submission flow end to end with the isolate worker and per-test verdicts.
3. Toolchain image, pipeline CLI, `codedrills-problems` repo with the Actions
   workflow, 3 complete problems.
4. Admin: metadata, publish/unpublish (build-gated), rejudge, build status.
5. Deploy: Worker on `codedrills.akshatdhiman.in`, VPS hardening, backups,
   README deployment guide.
6. CodeReflections link (documented URL format only).

## 10. CodeReflections link

```
https://codereflections.akshatdhiman.in/new?platform=codedrills
  &title=<urlencoded>&url=<urlencoded problem URL>
  &difficulty=1600&tags=greedy,dp&externalId=<slug>
```

CodeReflections needs a `platform` field to accept this; CodeDrills only
documents the format.
