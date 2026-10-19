import { collections, dbReady } from "../db/database.js";
import { languageName } from "../data/languages.js";

// Submissions carry their problem's code and title (copied when created), so
// lists need no join with problems. Lists leave out the source code, tests and
// compiler output, and are read newest-first from the `newest` or
// `by_problem_newest` index.

const LIST_PROJECTION = { _id: 0, code: 0, tests: 0, compileOutput: 0, checkerMsg: 0 };
const MAX_LIST = 100;

const present = s => ({ ...s, id: String(s.id), languageName: languageName(s.language) });

export async function listSubmissions({ problemSlug, limit = 50 } = {}) {
  await dbReady();
  const filter = problemSlug ? { problemSlug: String(problemSlug) } : {};
  const rows = await collections.submissions
    .find(filter, { projection: LIST_PROJECTION })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, MAX_LIST))
    .toArray();
  return rows.map(present);
}

export async function getSubmission(id) {
  const n = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(n)) return null;
  await dbReady();
  const s = await collections.submissions.findOne({ id: n }, { projection: { _id: 0 } });
  return s && present(s);
}
