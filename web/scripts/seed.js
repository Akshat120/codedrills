// Loads sample data into the local database (replacing what's there):
//
//   npm run db:up && npm run seed
//
// The 9 sample problems and their submissions from seed-data.js, plus
// generated filler problems (sets 3 to 30) so the problemset has several
// pages, and one unpublished draft that must never be listed.
import { client, collections, initDb } from "../src/db/database.js";
import { titleWords } from "../src/repositories/problemRepository.js";
import { problems, submissions } from "./seed-data.js";

const LETTERS = "ABCDEFGH";
const ADJECTIVES = ["Quiet", "Broken", "Golden", "Hidden", "Twin", "Lazy", "Spiral", "Frozen", "Silent", "Crooked", "Bright", "Narrow"];
const NOUNS = ["Bridges", "Lanterns", "Towers", "Gardens", "Rivers", "Tokens", "Ladders", "Mirrors", "Orchards", "Signals", "Arrays", "Paths"];
const TAGS = ["greedy", "math", "dp", "graphs", "strings", "sortings", "binary search", "data structures", "constructive algorithms", "number theory", "two pointers", "trees"];

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
  const list = [];
  for (let set = 3; set <= 30; set++) {
    for (let i = 0; i < 5; i++) {
      const title = `${ADJECTIVES[Math.floor(next() * ADJECTIVES.length)]} ${NOUNS[Math.floor(next() * NOUNS.length)]}`;
      const tagCount = 1 + Math.floor(next() * 2);
      const tags = [...new Set(Array.from({ length: tagCount }, () => TAGS[Math.floor(next() * TAGS.length)]))].sort();
      list.push({
        slug: `${title.toLowerCase().replace(/\s+/g, "-")}-${set}${LETTERS[i].toLowerCase()}`,
        code: `${set}${LETTERS[i]}`,
        title,
        difficulty: Math.min(3500, 800 + i * 300 + Math.floor(next() * 4) * 100),
        tags,
        timeLimitMs: 2000,
        memoryLimitMb: 256
      });
    }
  }
  return list;
}

function toDocument(p, published = true) {
  const set = Number.parseInt(p.code, 10);
  const letter = p.code.slice(String(set).length);
  const mine = submissions.filter(s => s.problemSlug === p.slug && s.status === "done");
  return {
    _id: p.slug,
    ...p,
    order: set * 100 + LETTERS.indexOf(letter[0]) * 10 + (Number(letter[1]) || 0),
    titleWords: titleWords(p.title),
    published,
    stats: { submissions: mine.length, accepted: mine.filter(s => s.verdict === "AC").length },
    statement: p.statement || null,
    samples: p.samples || []
  };
}

async function main() {
  await initDb({ waitForIndexes: true });

  const docs = [...problems, ...fillerProblems()].map(p => toDocument(p));
  docs.push(toDocument({ slug: "draft-problem", code: "99Z", title: "Draft Problem", difficulty: 1200, tags: ["greedy"], timeLimitMs: 1000, memoryLimitMb: 256 }, false));

  const byCode = new Map(problems.map(p => [p.slug, p]));
  const subs = submissions.map(s => ({
    ...s,
    problemCode: byCode.get(s.problemSlug).code,
    problemTitle: byCode.get(s.problemSlug).title
  }));

  await collections.problems.deleteMany({});
  await collections.submissions.deleteMany({});
  await collections.problems.insertMany(docs);
  await collections.submissions.insertMany(subs);
  console.log(`Seeded ${docs.length} problems (1 unpublished) and ${subs.length} submissions.`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => client.close());
