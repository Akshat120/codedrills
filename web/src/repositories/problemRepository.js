import { collections, dbReady } from "../db/database.js";
import { normalizeCode, platformName, platforms } from "../data/platforms.js";

// Problemset queries. How they stay cheap:
//
// - Pages are read straight from an index in `number` order (CD0001 first), so
//   MongoDB never sorts in memory, and the projection leaves out statements
//   and samples.
// - The page, the total and the tag list are three independent queries sent
//   at once: one round trip of waiting, not three.
// - "Solved" / "attempted" come from `stats` on the problem itself (kept up
//   to date when a verdict is written), not from a join with submissions.
// - A code like "CD17" is an exact match on _id. Anything else matches either
//   the original's ID ("1904A", on the `source_id` index) or word prefixes of
//   the title ("even pre" → "Even Prefixes", on the multikey `titleWords`
//   index) instead of scanning every title with a regex.
// - Page numbers use skip + limit. With every filter on index keys, the
//   skipped entries are index keys only (documents are fetched for the page
//   alone). That is fine for thousands of problems; a cursor ("after number
//   N") would only matter far beyond that.

export const PER_PAGE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PER_PAGE = 25;
const MAX_PAGE = 10000;

const LIST_PROJECTION = { _id: 0, code: "$_id", title: 1, difficulty: 1, tags: 1, sourcePlatform: 1, source: 1, stats: 1 };
const PLATFORM_IDS = new Set(platforms.map(p => p.id));

export function titleWords(text) {
  return String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
}

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildFilter({ q, tag, source, min, max }) {
  const filter = { published: true };
  if (tag) filter.tags = tag;
  if (source) filter.sourcePlatform = source;
  if (min || max) {
    filter.difficulty = {};
    if (min) filter.difficulty.$gte = min;
    if (max) filter.difficulty.$lte = max;
  }
  if (q) {
    const code = normalizeCode(q);
    if (code) {
      filter._id = code;
    } else {
      const words = titleWords(q).slice(0, 5);
      const or = [{ "source.id": q.toUpperCase() }];
      if (words.length) or.push({ titleWords: { $all: words.map(w => new RegExp(`^${escapeRegex(w)}`)) } });
      filter.$or = or;
    }
  }
  return filter;
}

function toNumber(value, { min, max }) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Reads and bounds the query string (anything invalid falls back to a default)
export function parseListQuery(query) {
  const perPage = Number(query.perPage);
  return {
    q: String(query.q || "").trim().slice(0, 60),
    tag: String(query.tag || "").trim().toLowerCase().slice(0, 40),
    source: PLATFORM_IDS.has(query.source) ? query.source : "",
    min: toNumber(query.min, { min: 0, max: 5000 }),
    max: toNumber(query.max, { min: 0, max: 5000 }),
    page: toNumber(query.page, { min: 1, max: MAX_PAGE }) || 1,
    perPage: PER_PAGE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PER_PAGE
  };
}

function withStatus({ stats = {}, ...problem }) {
  return {
    ...problem,
    sourceName: platformName(problem.sourcePlatform),
    status: stats.accepted > 0 ? "accepted" : stats.submissions > 0 ? "attempted" : null,
    acceptedCount: stats.accepted || 0
  };
}

function findPage(filter, page, perPage) {
  return collections.problems
    .find(filter, { projection: LIST_PROJECTION })
    .sort({ number: 1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .toArray();
}

export async function listProblems(options) {
  await dbReady();
  const { page, perPage } = options;
  const filter = buildFilter(options);
  const [rows, total, tags] = await Promise.all([
    findPage(filter, page, perPage),
    collections.problems.countDocuments(filter),
    collections.problems.distinct("tags", { published: true })
  ]);

  // A page past the end (old link, narrower filter): show the last page
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const actualPage = Math.min(page, totalPages);
  const pageRows = actualPage === page ? rows : await findPage(filter, actualPage, perPage);

  return {
    problems: pageRows.map(withStatus),
    tags: tags.sort(),
    platforms,
    page: actualPage,
    perPage,
    total,
    totalPages
  };
}

// Every published problem, for the Submit page's selector (code and title only)
export async function listProblemOptions() {
  await dbReady();
  return collections.problems
    .find({ published: true }, { projection: { _id: 0, code: "$_id", title: 1 } })
    .sort({ number: 1 })
    .toArray();
}

export async function getProblem(codeText) {
  const code = normalizeCode(codeText);
  if (!code) return null;
  await dbReady();
  const problem = await collections.problems.findOne({ _id: code, published: true });
  if (!problem) return null;
  const { _id, titleWords: _words, number: _number, published: _published, ...rest } = problem;
  return withStatus({ code: _id, ...rest });
}

// Sidebar "Your Progress": one pass over the problems plus the submission
// count from collection metadata
export async function progressSummary() {
  await dbReady();
  const [summary = {}] = await collections.problems.aggregate([
    { $match: { published: true } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        solved: { $sum: { $cond: [{ $gt: ["$stats.accepted", 0] }, 1, 0] } },
        attempted: {
          $sum: { $cond: [{ $and: [{ $eq: [{ $ifNull: ["$stats.accepted", 0] }, 0] }, { $gt: ["$stats.submissions", 0] }] }, 1, 0] }
        },
        solvedDifficulty: { $sum: { $cond: [{ $gt: ["$stats.accepted", 0] }, "$difficulty", 0] } }
      }
    }
  ]).toArray();
  const submissions = await collections.submissions.estimatedDocumentCount();
  return {
    total: summary.total || 0,
    solved: summary.solved || 0,
    attempted: summary.attempted || 0,
    averageDifficulty: summary.solved ? Math.round(summary.solvedDifficulty / summary.solved) : null,
    submissions
  };
}
