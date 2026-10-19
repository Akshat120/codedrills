import { Router } from "express";
import { languages } from "../data/languages.js";
import { collections, dbReady } from "../db/database.js";
import { getSubmission, listSubmissions } from "../repositories/submissionRepository.js";

export const submissionRoutes = Router();

const MAX_CODE_BYTES = 64 * 1024;

submissionRoutes.get("/", async (req, res) => {
  const problem = String(req.query.problem || "");
  res.json({ submissions: await listSubmissions({ problemSlug: problem || undefined, limit: problem ? 10 : 50 }) });
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
  const { problemSlug, language, code } = req.body || {};
  await dbReady();
  const exists = typeof problemSlug === "string" &&
    (await collections.problems.countDocuments({ _id: problemSlug, published: true }, { limit: 1 }));
  if (!exists) return res.status(400).json({ error: "Choose a problem." });
  if (!languages.some(l => l.id === language)) return res.status(400).json({ error: "Choose a supported language." });
  if (typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "The source code is empty." });
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return res.status(400).json({ error: "The source code is larger than 64 KB." });
  res.status(503).json({ error: "The judge isn't connected yet, so nothing was submitted (coming in milestone 2)." });
});
