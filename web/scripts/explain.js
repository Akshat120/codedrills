// Prints how MongoDB runs the app's list queries, to check they use the
// intended index and never sort in memory:
//
//   npm run db:explain
//
// For each query: the plan's stages (innermost last), the index used, and how
// many index keys and documents were read to return the rows.
import { client, collections, initDb } from "../src/db/database.js";

function stages(plan) {
  const names = [];
  for (let s = plan; s; s = s.inputStage || s.inputStages?.[0]) {
    names.push(s.indexName ? `${s.stage}(${s.indexName})` : s.stage);
  }
  return names.join(" ← ");
}

const problemList = { _id: 0, slug: 1, code: 1, title: 1, difficulty: 1, tags: 1, stats: 1 };
const listOf = filter => ({ filter, projection: problemList, sort: { order: 1 } });

const queries = [
  ["problemset page 1", "problems", { ...listOf({ published: true }), limit: 25 }],
  ["problemset page 5", "problems", { ...listOf({ published: true }), skip: 100, limit: 25 }],
  ["tag filter", "problems", { ...listOf({ published: true, tags: "greedy" }), limit: 25 }],
  ["difficulty range", "problems", { ...listOf({ published: true, difficulty: { $gte: 1400, $lte: 1900 } }), limit: 25 }],
  ["tag + difficulty", "problems", { ...listOf({ published: true, tags: "dp", difficulty: { $gte: 1400 } }), limit: 25 }],
  ["code search 12C", "problems", { ...listOf({ published: true, code: "12C" }), limit: 25 }],
  ["title search \"gold\"", "problems", { ...listOf({ published: true, titleWords: { $all: [/^gold/] } }), limit: 25 }],
  ["status page", "submissions", { filter: {}, projection: { code: 0, tests: 0 }, sort: { createdAt: -1 }, limit: 50 }],
  ["problem's last submissions", "submissions", { filter: { problemSlug: "even-prefixes" }, projection: { code: 0, tests: 0 }, sort: { createdAt: -1 }, limit: 10 }]
];

async function main() {
  await initDb({ waitForIndexes: true });
  for (const [label, name, { filter, projection, sort, skip = 0, limit }] of queries) {
    const result = await collections[name]
      .find(filter, { projection })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .explain("executionStats");
    const { executionStats: stats, queryPlanner } = result;
    const plan = queryPlanner.winningPlan.queryPlan || queryPlanner.winningPlan;
    const sortsInMemory = JSON.stringify(plan).includes('"SORT"');
    console.log(`\n${label}`);
    console.log(`  plan:     ${stages(plan)}`);
    console.log(`  examined: ${stats.totalKeysExamined} keys, ${stats.totalDocsExamined} docs → ${stats.nReturned} rows${sortsInMemory ? "  (SORTS IN MEMORY)" : ""}`);
  }

  const count = await collections.problems.countDocuments({ published: true, tags: "greedy" });
  console.log(`\ncount (tag filter) = ${count}`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => client.close());
