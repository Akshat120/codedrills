import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { languages } from "./languages.mjs";

// Judges one submission: compile, run the problem's tests in order (stopping
// at the first failure, like Codeforces), compare each output with the
// expected answer, and return the verdicts. Every compile and run goes
// through bin/runner, which applies the time, memory, output and process
// limits (see runner/runner.c).

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = process.env.JUDGE_RUNNER || path.join(ROOT, "bin", "runner");
const PROBLEMS = process.env.JUDGE_PROBLEMS || path.join(ROOT, "problems");

const COMPILE = { cpuMs: 20000, wallMs: 30000, memoryMb: 1024, addressSpaceMb: 2048, outputMb: 64, processes: 64 };
// Address space allowed when re-running a crashed test (below the function's
// 2 GB, so a runaway program can't take the judge down with it)
const LOOSE_ADDRESS_SPACE_MB = 1536;
const OUTPUT_MB = 64;
const COMPILE_LOG_BYTES = 64 * 1024;
const MAX_CODE_BYTES = 64 * 1024;

// Runs `argv` under the runner and returns its report
async function limited(argv, { cpuMs, wallMs, memoryMb, addressSpaceMb, outputMb, processes, stdin, stdout, stderr }) {
  const args = [cpuMs, wallMs, memoryMb, addressSpaceMb ?? memoryMb + 64, outputMb, processes, stdin, stdout, stderr, "--", ...argv].map(String);
  const { stdout: report } = await run(RUNNER, args, { maxBuffer: 1024 * 1024 });
  return JSON.parse(report);
}

async function readTail(file, limit) {
  try {
    const text = await readFile(file, "utf8");
    return text.length > limit ? `${text.slice(0, limit)}\n… (truncated)` : text;
  } catch (_) {
    return "";
  }
}

const ordinal = n => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Token-by-token comparison, like testlib's wcmp checker
export function compareTokens(output, expected) {
  const got = output.split(/\s+/).filter(Boolean);
  const want = expected.split(/\s+/).filter(Boolean);
  for (let i = 0; i < want.length; i++) {
    if (i >= got.length) return { ok: false, message: `wrong answer Unexpected EOF in the participants output (expected ${want.length} words, found ${got.length})` };
    if (got[i] !== want[i]) {
      const clip = s => (s.length > 64 ? `${s.slice(0, 64)}…` : s);
      return { ok: false, message: `wrong answer ${ordinal(i + 1)} words differ - expected: '${clip(want[i])}', found: '${clip(got[i])}'` };
    }
  }
  if (got.length > want.length) return { ok: false, message: `wrong answer Extra tokens in the output (expected ${want.length}, found ${got.length})` };
  return { ok: true, message: `ok ${want.length} word${want.length === 1 ? "" : "s"}` };
}

async function loadProblem(code) {
  if (!/^CD\d{4,6}$/.test(String(code))) throw new Error("Invalid problem code.");
  const dir = path.join(PROBLEMS, code);
  const file = path.join(dir, "problem.json");
  if (!existsSync(file)) return null;
  const meta = JSON.parse(await readFile(file, "utf8"));
  return { dir, ...meta };
}

const failure = (verdict, extra = {}) => ({ verdict, failedTest: null, timeMs: 0, memoryKb: 0, compileOutput: "", checkerMsg: "", tests: [], ...extra });

export async function judge({ language, code, problem }) {
  const lang = languages[language];
  if (!lang) return failure("IE", { checkerMsg: `Unsupported language: ${language}` });
  if (typeof code !== "string" || Buffer.byteLength(code) > MAX_CODE_BYTES) return failure("IE", { checkerMsg: "Invalid source code." });

  const pkg = await loadProblem(problem?.code);
  if (!pkg) return failure("IE", { checkerMsg: `The judge has no tests for ${problem?.code}.` });
  const timeLimitMs = Number(problem.timeLimitMs) || pkg.timeLimitMs;
  const memoryLimitMb = Number(problem.memoryLimitMb) || pkg.memoryLimitMb;

  const work = await mkdtemp(path.join(tmpdir(), "judge-"));
  try {
    const src = path.join(work, lang.source);
    const exe = path.join(work, "solution");
    await writeFile(src, code);

    const compiled = await limited(lang.compile(src, exe), {
      ...COMPILE, stdin: "/dev/null", stdout: path.join(work, "compile.log"), stderr: path.join(work, "compile.log")
    });
    // Paths in compiler messages: "main.cpp:3:5", not "/tmp/judge-x1y2/main.cpp:3:5"
    const compileOutput = (await readTail(path.join(work, "compile.log"), COMPILE_LOG_BYTES)).replaceAll(`${work}/`, "");
    if (compiled.status !== "OK") {
      const note = compiled.status === "TLE" ? "Compilation took too long." : compiled.status === "MLE" ? "Compilation used too much memory." : "";
      return failure("CE", { compileOutput: [note, compileOutput].filter(Boolean).join("\n") || "Compilation failed." });
    }

    const tests = [];
    let verdict = "AC";
    let failedTest = null;
    let checkerMsg = "";
    for (const [i, name] of pkg.tests.entries()) {
      const n = i + 1;
      const out = path.join(work, "out.txt");
      const runTest = addressSpaceMb => limited(lang.run(exe), {
        cpuMs: timeLimitMs, wallMs: timeLimitMs * 3 + 1000, memoryMb: memoryLimitMb, addressSpaceMb, outputMb: OUTPUT_MB, processes: 1,
        stdin: path.join(pkg.dir, "tests", `${name}.in`), stdout: out, stderr: "/dev/null"
      });
      let res = await runTest();
      // A program that asks for more memory than the limit fails under the
      // address-space cap before using it (bad_alloc, or a crash at start for
      // big static arrays). Re-run a crash once with a looser cap: if it then
      // finishes, or goes past the limit, the cause was memory.
      if (res.status === "RE") {
        const loose = await runTest(Math.max(LOOSE_ADDRESS_SPACE_MB, memoryLimitMb + 512));
        if (loose.status === "OK" || loose.status === "MLE" || loose.memoryKb > memoryLimitMb * 1024) {
          res = { ...res, status: "MLE", memoryKb: Math.max(res.memoryKb, loose.memoryKb) };
        }
      }
      let testVerdict = { OK: "AC", TLE: "TLE", MLE: "MLE", RE: "RE", OLE: "RE", IE: "IE" }[res.status] || "IE";
      let message = res.status === "OLE" ? "Output limit exceeded" : "";
      if (testVerdict === "AC") {
        const [output, expected] = await Promise.all([readFile(out, "utf8"), readFile(path.join(pkg.dir, "tests", `${name}.ans`), "utf8")]);
        const checked = compareTokens(output, expected);
        if (!checked.ok) testVerdict = "WA";
        message = checked.message;
      } else if (testVerdict === "RE" && !message) {
        message = res.signal ? `Killed by signal ${res.signal}` : `Exit code is ${res.exitCode}`;
      }
      tests.push({
        n,
        verdict: testVerdict,
        timeMs: testVerdict === "TLE" ? timeLimitMs : Math.min(res.cpuMs, timeLimitMs),
        memoryKb: res.memoryKb
      });
      if (testVerdict !== "AC") {
        verdict = testVerdict;
        failedTest = n;
        checkerMsg = message;
        break;
      }
    }

    return {
      verdict,
      failedTest,
      timeMs: Math.max(0, ...tests.map(t => t.timeMs)),
      memoryKb: Math.max(0, ...tests.map(t => t.memoryKb)),
      compileOutput: compileOutput.trim() ? compileOutput : "",
      checkerMsg,
      tests
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
