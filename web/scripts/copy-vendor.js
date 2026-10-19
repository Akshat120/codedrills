// Copies KaTeX into public/vendor so it is served as a static asset (both by
// Cloudflare and by the local Express server). public/vendor is git-ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["node_modules/katex/dist/katex.min.js", "public/vendor/katex/katex.min.js"],
  ["node_modules/katex/dist/katex.min.css", "public/vendor/katex/katex.min.css"],
  ["node_modules/katex/dist/contrib/auto-render.min.js", "public/vendor/katex/auto-render.min.js"],
  ["node_modules/katex/dist/fonts", "public/vendor/katex/fonts"]
];

for (const [from, to] of copies) {
  const target = path.join(root, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(path.join(root, from), target, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
