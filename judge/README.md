# CodeDrills judge

Compiles a submission, runs it on the problem's tests with limits, compares
the output with the expected answers and returns the verdicts. It runs as an
**AWS Lambda function** (free within Lambda's always-free allowance) and, for
local development, in Docker using AWS's own Lambda image.

```
Browser → web app (Cloudflare Worker / local Express) → saves submission as "queued"
Submission page → POST /api/submissions/:id/judge → web app claims it, calls the judge
Judge (Lambda) → compile, run tests, check → verdicts → web app saves them → page shows them
```

## What's here

| Path | What it is |
|---|---|
| `runner/runner.c` | Runs one program with CPU time, wall time, memory, output and process limits, and reports the result as JSON |
| `src/judge.mjs` | Compile, run each test (stop at the first failure), token checker, verdicts |
| `src/index.mjs` | Lambda handler: the event is the job (also accepts a function URL request) |
| `src/languages.mjs` | Compile/run commands per language (`cpp17`: `g++ -std=gnu++17 -O2 -static`) |
| `problems/<code>/` | Each problem's test package: `problem.json` + `tests/*.in`, `*.ans` (tests are generated, not committed) |
| `test/verdicts.mjs` | Checks the judge gives AC, WA, TLE, MLE, RE and CE for typical submissions |
| `Dockerfile` | Local judge: AWS's `nodejs:24` Lambda image + g++ + the runner + generated tests |
| `aws/` | Packaging for AWS Lambda (`build.sh`) and the step-by-step setup (`SETUP.md`) |

## Limits on every test

| Limit | How |
|---|---|
| CPU time | `RLIMIT_CPU` and the measured user + system time (the problem's time limit) |
| Wall time | 3 × time limit + 1 s, then the process group is killed (catches sleeping) |
| Memory | Address space capped at the limit + 64 MB, peak resident memory compared to the limit. A crash under the cap is re-run once with a looser cap to tell "needed more memory" (MLE) from a real crash (RE). |
| Output | 64 MB (`RLIMIT_FSIZE`) |
| Processes | 1: `fork()` and threads fail (the judge runs as a non-root user so this applies) |
| Network | None on AWS: the function sits in a VPC subnet with no route out and a security group with no outbound rules |

Compiling has its own limits (20 s CPU, 30 s wall, 2 GB address space).

## Run it locally

From the repo root (needs Docker):

```bash
docker compose up -d --build judge
```

Check every verdict type:

```bash
node judge/test/verdicts.mjs
```

The web app's `npm run db:up` starts it together with MongoDB, and the web app
calls it at `http://127.0.0.1:9001/2015-03-31/functions/function/invocations`.

## On AWS

Runs as the Lambda function `codedrills-judge` (Node.js 24, arm64, 2048 MB,
2 min timeout, 512 MB `/tmp`) with the compiler in the layer `codedrills-gxx`.
Build both zips with:

```bash
judge/aws/build.sh
```

| Zip | Contents | Size |
|---|---|---|
| `dist/compiler-layer.zip` | g++ 11, binutils, C/C++ headers and static libraries under `/opt/sysroot`, and the `/opt/bin/g++` wrapper | ~25 MB (85 MB unpacked) |
| `dist/judge-function.zip` | `src/`, `bin/runner`, each problem's `problem.json` and tests | ~4 MB |

Both are built on AWS's own Lambda image, so they match the system they run
on. The web app calls the function through Lambda's Invoke API, signed with the
keys of an IAM user that may only invoke this function. The function sits in
a VPC subnet with a security group that allows no outbound traffic, so
submissions can't reach the internet.

Setting it up by hand in the AWS console, step by step: [`aws/SETUP.md`](aws/SETUP.md).
Check the deployed function with `node judge/test/verdicts.mjs --aws codedrills-judge`.

## Adding a problem's tests (for now)

Until the problem pipeline exists (milestone 3), each problem in `problems/`
has a `make-tests.mjs` that writes `problem.json` and `tests/`. The Dockerfile
runs them all at build time.
