import { collections, dbReady } from "../db/database.js";
import { languageName } from "../data/languages.js";

// Submissions carry their problem's code and title (copied when created), so
// lists need no join with problems. Lists leave out the source code, tests and
// compiler output, and are read newest-first from the `newest` or
// `by_problem_newest` index.
//
// Lifecycle: queued → judging (claimed with a lease) → done. Whoever claims a
// submission calls the judge; a claim whose lease has expired (the caller
// gave up or crashed) can be taken again, up to MAX_ATTEMPTS.

const LIST_PROJECTION = { _id: 0, code: 0, tests: 0, compileOutput: 0, checkerMsg: 0 };
const MAX_LIST = 100;
const LEASE_MS = 3 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

const present = ({ _id, leaseUntil, ...s }) => ({ ...s, id: String(s.id), languageName: languageName(s.language) });

export async function listSubmissions({ problemCode, limit = 50 } = {}) {
  await dbReady();
  const filter = problemCode ? { problemCode } : {};
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
  const s = await collections.submissions.findOne({ id: n });
  return s && present(s);
}

async function nextSubmissionId() {
  const counter = await collections.counters.findOneAndUpdate(
    { _id: "submissions" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return counter.seq;
}

export async function createSubmission({ problem, language, code }) {
  await dbReady();
  const id = await nextSubmissionId();
  await collections.submissions.insertOne({
    id,
    problemCode: problem.code,
    problemTitle: problem.title,
    language,
    code,
    codeBytes: Buffer.byteLength(code),
    status: "queued",
    verdict: null,
    attempts: 0,
    createdAt: new Date()
  });
  return id;
}

// Takes a queued submission (or one whose judge call was abandoned) for
// judging. Returns the claimed document, or null if someone else has it or
// it's already done.
export async function claimSubmission(id) {
  const n = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(n)) return null;
  await dbReady();
  const now = new Date();
  return collections.submissions.findOneAndUpdate(
    {
      id: n,
      $or: [{ status: "queued" }, { status: "judging", leaseUntil: { $lt: now } }],
      attempts: { $lt: MAX_ATTEMPTS }
    },
    { $set: { status: "judging", leaseUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
}

// Saves the judge's result and updates the problem's solved/attempted stats
// (read by the problemset). An internal error isn't counted as an attempt.
export async function finishSubmission(submission, result) {
  const { id, problemCode } = submission;
  const done = await collections.submissions.updateOne(
    { id, status: "judging" },
    {
      $set: {
        status: "done",
        verdict: result.verdict,
        failedTest: result.failedTest ?? null,
        timeMs: result.timeMs ?? 0,
        memoryKb: result.memoryKb ?? 0,
        compileOutput: result.compileOutput || "",
        checkerMsg: result.checkerMsg || "",
        tests: Array.isArray(result.tests) ? result.tests : [],
        finishedAt: new Date()
      },
      $unset: { leaseUntil: "" }
    }
  );
  if (done.modifiedCount && result.verdict !== "IE") {
    await collections.problems.updateOne(
      { _id: problemCode },
      { $inc: { "stats.submissions": 1, "stats.accepted": result.verdict === "AC" ? 1 : 0 } }
    );
  }
}

// The judge couldn't be reached: back in the queue, or given up on after
// MAX_ATTEMPTS
export async function releaseSubmission(submission, message) {
  const giveUp = submission.attempts >= MAX_ATTEMPTS;
  await collections.submissions.updateOne(
    { id: submission.id, status: "judging" },
    giveUp
      ? { $set: { status: "done", verdict: "IE", checkerMsg: message, tests: [], finishedAt: new Date() }, $unset: { leaseUntil: "" } }
      : { $set: { status: "queued" }, $unset: { leaseUntil: "" } }
  );
}
