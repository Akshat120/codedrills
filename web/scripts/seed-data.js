// Sample data loaded by `npm run seed` (scripts/seed.js), which also adds
// generated filler problems so pagination has something to page through.
// All problems are original placeholders; only 1A has a full statement.

export const problems = [
  {
    slug: "even-prefixes",
    code: "1A",
    title: "Even Prefixes",
    difficulty: 800,
    tags: ["implementation", "math"],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: {
      legend: `<p>Mira writes down a sequence of $n$ integers $a_1, a_2, \\ldots, a_n$. She calls a prefix of length $k$ <i>even</i> if the sum $a_1 + a_2 + \\ldots + a_k$ is even.</p>
<p>Count how many of the $n$ prefixes are even.</p>`,
      input: `<p>The first line contains a single integer $t$ ($1 \\le t \\le 10^4$) — the number of test cases.</p>
<p>The first line of each test case contains one integer $n$ ($1 \\le n \\le 2 \\cdot 10^5$). The second line contains $n$ integers $a_1, a_2, \\ldots, a_n$ ($|a_i| \\le 10^9$).</p>
<p>It is guaranteed that the sum of $n$ over all test cases does not exceed $2 \\cdot 10^5$.</p>`,
      output: `<p>For each test case, print a single integer — the number of even prefixes.</p>`,
      note: `<p>In the first test case the prefix sums are $1, 4, 6, 11$. Two of them, $4$ and $6$, are even.</p>
<p>In the third test case every element is even, so all $5$ prefixes are even.</p>`
    },
    samples: [
      { input: "3\n4\n1 3 2 5\n1\n7\n5\n2 4 6 8 10\n", output: "2\n0\n5\n" }
    ]
  },
  { slug: "lamp-corridor", code: "1B", title: "Lamp Corridor", difficulty: 1100, tags: ["greedy"], timeLimitMs: 1000, memoryLimitMb: 256 },
  { slug: "tea-stall-queue", code: "1C", title: "Tea Stall Queue", difficulty: 1300, tags: ["greedy", "sortings"], timeLimitMs: 2000, memoryLimitMb: 256 },
  { slug: "paper-bridges", code: "1D", title: "Paper Bridges", difficulty: 1500, tags: ["dfs and similar", "graphs"], timeLimitMs: 2000, memoryLimitMb: 256 },
  { slug: "rotating-signboard", code: "1E", title: "Rotating Signboard", difficulty: 1700, tags: ["hashing", "strings"], timeLimitMs: 2000, memoryLimitMb: 256 },
  { slug: "pebble-piles", code: "2A", title: "Pebble Piles", difficulty: 1000, tags: ["games", "math"], timeLimitMs: 1000, memoryLimitMb: 256 },
  { slug: "warehouse-rows", code: "2B", title: "Warehouse Rows", difficulty: 1900, tags: ["dp"], timeLimitMs: 2000, memoryLimitMb: 512 },
  { slug: "mirror-grid", code: "2C", title: "Mirror Grid", difficulty: 2200, tags: ["constructive algorithms"], timeLimitMs: 2000, memoryLimitMb: 256 },
  { slug: "toll-roads", code: "2D", title: "Toll Roads", difficulty: 2500, tags: ["data structures", "shortest paths"], timeLimitMs: 3000, memoryLimitMb: 256 }
];

const minutesAgo = m => new Date(Date.now() - m * 60 * 1000);

const SOLUTION_1A = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int t;
    scanf("%d", &t);
    while (t--) {
        int n;
        scanf("%d", &n);
        long long sum = 0;
        int even = 0;
        for (int i = 0; i < n; i++) {
            long long x;
            scanf("%lld", &x);
            sum += x;
            if (sum % 2 == 0) even++;
        }
        printf("%d\\n", even);
    }
}
`;

const tests = (count, verdictAt, failing, base = 15) =>
  Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    verdict: i + 1 === verdictAt ? failing : "AC",
    timeMs: base + ((i * 7) % 20),
    memoryKb: 3600 + i * 12
  }));

export const submissions = [
  { language: "cpp17", id: 1009, problemSlug: "toll-roads", status: "running", verdict: null, currentTest: 4, createdAt: minutesAgo(0.2), code: "// judging...\n", tests: [] },
  { language: "cpp17", id: 1008, problemSlug: "even-prefixes", status: "done", verdict: "AC", timeMs: 46, memoryKb: 3800, createdAt: minutesAgo(5), code: SOLUTION_1A, tests: tests(12, 0, null) },
  { language: "cpp17", id: 1007, problemSlug: "even-prefixes", status: "done", verdict: "WA", failedTest: 3, timeMs: 31, memoryKb: 3700, createdAt: minutesAgo(12), code: SOLUTION_1A.replace("long long sum", "int sum"), tests: tests(3, 3, "WA"), checkerMsg: "wrong answer 1st numbers differ - expected: '2', found: '1'" },
  { language: "cpp17", id: 1006, problemSlug: "tea-stall-queue", status: "done", verdict: "TLE", failedTest: 5, timeMs: 2000, memoryKb: 9100, createdAt: minutesAgo(40), code: "// O(n^2) attempt\n", tests: [...tests(4, 0, null), { n: 5, verdict: "TLE", timeMs: 2000, memoryKb: 9100 }] },
  { language: "cpp17", id: 1005, problemSlug: "lamp-corridor", status: "done", verdict: "CE", timeMs: 0, memoryKb: 0, createdAt: minutesAgo(65), code: "int main() { return 0 }\n", tests: [], compileOutput: "solution.cpp: In function 'int main()':\nsolution.cpp:1:24: error: expected ';' before '}' token\n    1 | int main() { return 0 }\n      |                        ^~\n      |                        ;" },
  { language: "cpp17", id: 1004, problemSlug: "lamp-corridor", status: "done", verdict: "RE", failedTest: 2, timeMs: 15, memoryKb: 3400, createdAt: minutesAgo(70), code: "// out-of-bounds access\n", tests: tests(2, 2, "RE"), checkerMsg: "Exit code is -1073741819 (SIGSEGV)" },
  { language: "cpp17", id: 1003, problemSlug: "warehouse-rows", status: "done", verdict: "MLE", failedTest: 7, timeMs: 343, memoryKb: 524288, createdAt: minutesAgo(130), code: "// int dp[5000][5000][3]\n", tests: tests(7, 7, "MLE") },
  { language: "cpp17", id: 1002, problemSlug: "pebble-piles", status: "done", verdict: "AC", timeMs: 15, memoryKb: 3500, createdAt: minutesAgo(1440), code: "// xor of piles\n", tests: tests(20, 0, null) },
  { language: "cpp17", id: 1001, problemSlug: "pebble-piles", status: "queued", verdict: null, createdAt: minutesAgo(0.1), code: "// waiting\n", tests: [] }
];
