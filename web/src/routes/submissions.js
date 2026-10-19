import { Router } from "express";
import { languages } from "../data/languages.js";
import { normalizeCode } from "../data/platforms.js";
import { collections, dbReady } from "../db/database.js";
import { getSubmission, listSubmissions } from "../repositories/submissionRepository.js";

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

// Validates like the real endpoint will, but nothing is queued yet: the judge
// arrives in milestone 2.
submissionRoutes.post("/", async (req, res) => {
  const { problemCode, language, code } = req.body || {};
  const problemId = normalizeCode(problemCode);
  await dbReady();
  const exists = problemId &&
    (await collections.problems.countDocuments({ _id: problemId, published: true }, { limit: 1 }));
  if (!problemId) return res.status(400).json({ error: "Enter a problem code like CD0017." });
  if (!exists) return res.status(400).json({ error: `No problem ${problemId}.` });
  if (!languages.some(l => l.id === language)) return res.status(400).json({ error: "Choose a supported language." });
  if (typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "The source code is empty." });
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return res.status(400).json({ error: "The source code is larger than 64 KB." });
  res.status(503).json({ error: "The judge isn't connected yet, so nothing was submitted (coming in milestone 2)." });
});
