// Writes CD0001's tests into tests/ (git-ignored): run by the judge image and
// Lambda packaging builds. Deterministic: the same tests every time. The
// answers are computed here (the problem is simple); solution.cpp must
// match them, which the judge's self-test checks.
//
// This is a stand-in until the problem pipeline (milestone 3) builds tests
// with testlib generators and validators.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "tests");
mkdirSync(out, { recursive: true });

let seed = 20261020;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const answer = cases => cases.map(a => {
  let parity = 0;
  let even = 0;
  for (const x of a) {
    parity = (parity + Math.abs(x)) % 2;
    if (parity === 0) even++;
  }
  return even;
});

const format = cases => `${cases.length}\n${cases.map(a => `${a.length}\n${a.join(" ")}`).join("\n")}\n`;

const MAX_N = 200000;
const BIG = 1e9;
const tests = [
  [[1, 3, 2, 5], [7], [2, 4, 6, 8, 10]],                      // the sample
  [[1]],                                                     // minimum, odd
  [[0]],                                                     // minimum, zero
  [[-1, -3, -5, 2]],                                         // negatives
  [[BIG, -BIG, BIG - 1, -(BIG - 1), 1]],                     // extremes
  Array.from({ length: 10000 }, () => Array.from({ length: 20 }, () => int(-BIG, BIG))), // many small cases
  Array.from({ length: 1000 }, () => Array.from({ length: int(1, 200) }, () => int(-9, 9))),
  [Array.from({ length: MAX_N }, () => int(-BIG, BIG))],     // max n, random
  [Array.from({ length: MAX_N }, () => 2 * int(-BIG / 2, BIG / 2))], // max n, all even
  [Array.from({ length: MAX_N }, () => 2 * int(-BIG / 2, BIG / 2 - 1) + 1)], // max n, all odd
  [Array.from({ length: MAX_N }, () => BIG)]                 // max n, big sums
];

const names = tests.map((cases, i) => {
  const name = String(i + 1).padStart(2, "0");
  writeFileSync(path.join(out, `${name}.in`), format(cases));
  writeFileSync(path.join(out, `${name}.ans`), `${answer(cases).join("\n")}\n`);
  return name;
});

writeFileSync(path.join(dir, "problem.json"), `${JSON.stringify({
  code: "CD0001",
  title: "Even Prefixes",
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  checker: "tokens",
  tests: names
}, null, 2)}\n`);
console.log(`CD0001: wrote ${names.length} tests`);
