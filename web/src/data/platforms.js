// Problem codes and sources.
//
// Every problem has one permanent code, CD + a running number (CD0001,
// CD0002, ...), never changed or reused. Where the idea came from is stored
// separately: `sourcePlatform` (one of the ids below) and, when known,
// `source: { platform, id, url }` for the original problem, shown as
// "Inspired by". Statements and tests are always written for CodeDrills.
export const platforms = [
  { id: "codeforces", name: "Codeforces" },
  { id: "leetcode", name: "LeetCode" },
  { id: "atcoder", name: "AtCoder" },
  { id: "geeksforgeeks", name: "GeeksforGeeks" },
  { id: "original", name: "Original" }
];

const CODE_PREFIX = "CD";
const CODE_DIGITS = 4;

export const platformName = id => platforms.find(p => p.id === id)?.name || "Original";

export function formatCode(number) {
  return `${CODE_PREFIX}${String(number).padStart(CODE_DIGITS, "0")}`;
}

// "cd17", "CD0017", "cd-17" → "CD0017"; null when it isn't a problem code
export function normalizeCode(text) {
  const match = /^\s*cd\s*-?\s*(\d{1,6})\s*$/i.exec(String(text || ""));
  return match ? formatCode(Number(match[1])) : null;
}
