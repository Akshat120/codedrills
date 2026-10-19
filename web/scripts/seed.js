// Loads sample data into the local database (replacing what's there):
//
//   npm run db:up && npm run seed
//
// The 9 sample problems and their submissions from seed-data.js as
// CD0001–CD0009, generated filler problems after them so the problemset has
// several pages, and one unpublished draft that must never be listed.
// Collections are dropped first, so index changes take effect.
import { client, collections, initDb } from "../src/db/database.js";
import { formatCode } from "../src/data/platforms.js";
import { titleWords } from "../src/repositories/problemRepository.js";
import { problems, submissions } from "./seed-data.js";

const FILLER_COUNT = 140;
const ADJECTIVES = ["Quiet", "Broken", "Golden", "Hidden", "Twin", "Lazy", "Spiral", "Frozen", "Silent", "Crooked", "Bright", "Narrow"];
const NOUNS = ["Bridges", "Lanterns", "Towers", "Gardens", "Rivers", "Tokens", "Ladders", "Mirrors", "Orchards", "Signals", "Arrays", "Paths"];
const TAGS = ["greedy", "math", "dp", "graphs", "strings", "sortings", "binary search", "data structures", "constructive algorithms", "number theory", "two pointers", "trees"];
const SOURCES = ["codeforces", "codeforces", "leetcode", "atcoder", "geeksforgeeks", "original"];

// Small deterministic generator, so every seed produces the same problems
function random(seed) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function fillerProblems() {
  const next = random(42);
  const pick = list => list[Math.floor(next() * list.length)];
  return Array.from({ length: FILLER_COUNT }, () => {
    const tagCount = 1 + Math.floor(next() * 2);
    return {
      title: `${pick(ADJECTIVES)} ${pick(NOUNS)}`,
      sourcePlatform: pick(SOURCES),
      difficulty: 800 + Math.floor(next() * 22) * 100,
      tags: [...new Set(Array.from({ length: tagCount }, () => pick(TAGS)))].sort(),
      timeLimitMs: 2000,
      memoryLimitMb: 256
    };
  });
}

function toDocument({ key: _key, ...p }, number, published = true) {
  const mine = submissions.filter(s => s.problemKey === _key && s.status === "done");
  return {
    _id: formatCode(number),
    number,
    ...p,
    titleWords: titleWords(p.title),
    // Sample data claims no real original problem, so no source id or link
    source: null,
    published,
    stats: { submissions: mine.length, accepted: mine.filter(s => s.verdict === "AC").length },
    statement: p.statement || null,
    samples: p.samples || []
  };
}

async function main() {
  await collections.problems.drop().catch(() => {});
  await collections.submissions.drop().catch(() => {});
  await initDb({ waitForIndexes: true });

  const all = [...problems, ...fillerProblems()];
  const docs = all.map((p, i) => toDocument(p, i + 1));
  docs.push(toDocument({ title: "Draft Problem", sourcePlatform: "original", difficulty: 1200, tags: ["greedy"], timeLimitMs: 1000, memoryLimitMb: 256 }, all.length + 1, false));

  const codeOf = new Map(problems.map((p, i) => [p.key, { code: formatCode(i + 1), title: p.title }]));
  const subs = submissions.map(({ problemKey, ...s }) => ({
    ...s,
    problemCode: codeOf.get(problemKey).code,
    problemTitle: codeOf.get(problemKey).title
  }));

  await collections.problems.insertMany(docs);
  await collections.submissions.insertMany(subs);
  console.log(`Seeded ${docs.length} problems (CD0001–${docs.at(-1)._id}, the last one unpublished) and ${subs.length} submissions.`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => client.close());
