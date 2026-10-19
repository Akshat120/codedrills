// Checks the judge gives the right verdict for typical submissions to
// CD0001. Run against a running judge (default: the local Docker one):
//
//   node judge/test/verdicts.mjs [invoke-url]
//   node judge/test/verdicts.mjs --aws codedrills-judge    (the deployed function,
//                                                           through the AWS CLI)
//
// On AWS it also checks that a submission can't reach the internet.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const awsFunction = process.argv[2] === "--aws" ? process.argv[3] : null;
const url = process.argv[2] || "http://127.0.0.1:9001/2015-03-31/functions/function/invocations";
const dir = path.dirname(fileURLToPath(import.meta.url));
const solution = readFileSync(path.join(dir, "../problems/CD0001/solution.cpp"), "utf8");
const problem = { code: "CD0001", timeLimitMs: 1000, memoryLimitMb: 256 };

const cases = [
  ["accepted", "AC", solution],
  ["wrong answer", "WA", solution.replace("if (sum % 2 == 0) even++;", "if (sum % 2 == 0 && i > 0) even++;")],
  ["time limit (infinite loop)", "TLE", "int main() { volatile long long x = 0; for (;;) x++; }"],
  ["time limit (sleeping)", "TLE", "#include <unistd.h>\nint main() { sleep(10); }"],
  ["memory limit (vector)", "MLE", "#include <bits/stdc++.h>\nint main() { std::vector<int> v(200'000'000, 1); printf(\"%d\", v[12345]); }"],
  ["memory limit (static array)", "MLE", "#include <cstdio>\nint a[300'000'000];\nint main() { a[5] = 1; printf(\"%d\", a[5]); }"],
  ["runtime error (segfault)", "RE", "int main() { int *p = nullptr; *p = 1; return 0; }"],
  ["runtime error (exit code)", "RE", "int main() { return 3; }"],
  ["compilation error", "CE", "int main() { return 0 }"],
  ["fork is blocked", "WA", "#include <unistd.h>\n#include <cstdio>\nint main() { pid_t p = fork(); printf(\"%s\\n\", p < 0 ? \"blocked\" : \"forked\"); }"],
  ["output limit", "RE", "#include <cstdio>\nint main() { for (;;) fputs(\"spam spam spam spam spam spam spam spam\\n\", stdout); }"]
];

// Tries to open a connection to 1.1.1.1:443 for up to 2 s and prints what happened
const NETWORK_PROBE = `#include <arpa/inet.h>
#include <cstdio>
#include <fcntl.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
int main() {
  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) { puts("blocked"); return 0; }
  fcntl(s, F_SETFL, O_NONBLOCK);
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(443); inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
  connect(s, (sockaddr*)&a, sizeof a);
  pollfd p{s, POLLOUT, 0};
  int err = 1; socklen_t len = sizeof err;
  if (poll(&p, 1, 2000) == 1) getsockopt(s, SOL_SOCKET, SO_ERROR, &err, &len);
  puts(err == 0 ? "connected" : "blocked");
}`;
if (awsFunction) cases.push(["no internet access", "WA", NETWORK_PROBE, "found: 'blocked'"]);

// Sends one job to the judge: over HTTP, or with `aws lambda invoke`
const exec = promisify(execFile);
async function invoke(job) {
  if (!awsFunction) {
    const res = await fetch(url, { method: "POST", body: JSON.stringify(job) });
    return res.json();
  }
  const dir = await mkdtemp(path.join(tmpdir(), "verdicts-"));
  try {
    const out = path.join(dir, "out.json");
    await writeFile(path.join(dir, "job.json"), JSON.stringify(job));
    await exec("aws", ["lambda", "invoke", "--function-name", awsFunction, "--cli-binary-format", "raw-in-base64-out",
      "--payload", `fileb://${path.join(dir, "job.json")}`, out]);
    return JSON.parse(await readFile(out, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let failed = 0;
for (const [name, expected, code, mustSay] of cases) {
  const started = Date.now();
  const result = await invoke({ submissionId: name, language: "cpp17", code, problem });
  const ok = result.verdict === expected && (!mustSay || (result.checkerMsg || "").includes(mustSay));
  if (!ok) failed++;
  const detail = result.failedTest ? ` on test ${result.failedTest}` : "";
  const msg = result.checkerMsg || (result.compileOutput || "").split("\n").find(l => l.includes("error")) || "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} expected ${expected.padEnd(3)} got ${result.verdict}${detail}  ${result.timeMs} ms ${result.memoryKb} KB  ${(Date.now() - started) / 1000}s  ${msg.slice(0, 80)}`);
}
console.log(failed ? `\n${failed} failed` : "\nall verdicts correct");
process.exitCode = failed ? 1 : 0;
