// Checks the judge gives the right verdict for typical submissions to
// CD0001. Run against a running judge (default: the local Docker one):
//
//   node judge/test/verdicts.mjs [invoke-url]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

let failed = 0;
for (const [name, expected, code] of cases) {
  const started = Date.now();
  const res = await fetch(url, { method: "POST", body: JSON.stringify({ submissionId: name, language: "cpp17", code, problem }) });
  const result = await res.json();
  const ok = result.verdict === expected;
  if (!ok) failed++;
  const detail = result.failedTest ? ` on test ${result.failedTest}` : "";
  const msg = result.checkerMsg || (result.compileOutput || "").split("\n").find(l => l.includes("error")) || "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} expected ${expected.padEnd(3)} got ${result.verdict}${detail}  ${result.timeMs} ms ${result.memoryKb} KB  ${(Date.now() - started) / 1000}s  ${msg.slice(0, 80)}`);
}
console.log(failed ? `\n${failed} failed` : "\nall verdicts correct");
process.exitCode = failed ? 1 : 0;
