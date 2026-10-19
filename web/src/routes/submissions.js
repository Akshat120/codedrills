import { Router } from "express";
import { languages } from "../data/languages.js";
import { normalizeCode } from "../data/platforms.js";
import { collections, dbReady } from "../db/database.js";
import { callJudge } from "../judgeClient.js";
import {
  claimSubmission,
  createSubmission,
  finishSubmission,
  getSubmission,
  listSubmissions,
  releaseSubmission
} from "../repositories/submissionRepository.js";

export const submissionRoutes = Router();

const MAX_CODE_BYTES = 64 * 1024;

submissionRoutes.get("/", async (req, res) => {
  const problemCode = req.query.problem ? normalizeCode(req.query.problem) : undefined;
  if (req.query.problem && !problemCode) return res.json({ submissions: [] });
  res.json({ submissions: await listSubmissions({ problemCode, limit: problemCode ? 10 : 50 }) });
});

submissionRoutes.get("/:id", async (req, res) => {
  const s = await getSubmission(req.params.id);
  if (!s) return res.status(404).json({ error: "Submission not found." });
  res.setHeader("Cache-Control", "no-store");
  res.json(s);
});

// Stores the submission as queued. Judging starts when the submission page
// asks for it (POST /:id/judge), so nothing slow runs in this request.
submissionRoutes.post("/", async (req, res) => {
  const { problemCode, language, code } = req.body || {};
  const problemId = normalizeCode(problemCode);
  if (!problemId) return res.status(400).json({ error: "Enter a problem code like CD0017." });
  if (!languages.some(l => l.id === language)) return res.status(400).json({ error: "Choose a supported language." });
  if (typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "The source code is empty." });
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return res.status(400).json({ error: "The source code is larger than 64 KB." });

  await dbReady();
  const problem = await collections.problems.findOne(
    { _id: problemId, published: true },
    { projection: { _id: 1, title: 1 } }
  );
  if (!problem) return res.status(400).json({ error: `No problem ${problemId}.` });

  const id = await createSubmission({ problem: { code: problem._id, title: problem.title }, language, code });
  res.status(201).json({ id: String(id) });
});

// Judges a queued submission and returns it with its verdicts. Called by the
// submission page; if the submission is already being judged or done, it
// just returns it as it is.
submissionRoutes.post("/:id/judge", async (req, res) => {
  const claimed = await claimSubmission(req.params.id);
  if (claimed) {
    const problem = await collections.problems.findOne(
      { _id: claimed.problemCode },
      { projection: { timeLimitMs: 1, memoryLimitMb: 1 } }
    );
    try {
      const result = await callJudge({
        submissionId: String(claimed.id),
        language: claimed.language,
        code: claimed.code,
        problem: { code: claimed.problemCode, timeLimitMs: problem?.timeLimitMs, memoryLimitMb: problem?.memoryLimitMb }
      });
      await finishSubmission(claimed, result);
    } catch (error) {
      console.error(`Judging submission ${claimed.id} failed:`, error.message);
      await releaseSubmission(claimed, "The judge couldn't be reached.");
    }
  }
  const s = await getSubmission(req.params.id);
  if (!s) return res.status(404).json({ error: "Submission not found." });
  res.setHeader("Cache-Control", "no-store");
  res.json(s);
});
