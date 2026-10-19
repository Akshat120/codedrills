import { Router } from "express";
import { problems, submissions } from "../data/dummy.js";

export const submissionRoutes = Router();

const MAX_CODE_BYTES = 64 * 1024;

function withProblem(s) {
  const p = problems.find(x => x.slug === s.problemSlug);
  return { ...s, problemCode: p?.code, problemTitle: p?.title, language: "GNU C++17" };
}

submissionRoutes.get("/", (req, res) => {
  const problem = String(req.query.problem || "");
  const list = submissions
    .filter(s => !problem || s.problemSlug === problem)
    .map(({ code, tests, compileOutput, ...rest }) => withProblem(rest));
  res.json({ submissions: list });
});

submissionRoutes.get("/:id", (req, res) => {
  const s = submissions.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "Submission not found." });
  res.setHeader("Cache-Control", "no-store");
  res.json(withProblem(s));
});

// Validates like the real endpoint will, but nothing is queued yet: the judge
// arrives in milestone 2.
submissionRoutes.post("/", (req, res) => {
  const { problemSlug, language, code } = req.body || {};
  if (!problems.some(p => p.slug === problemSlug)) return res.status(400).json({ error: "Choose a problem." });
  if (language !== "cpp17") return res.status(400).json({ error: "Only GNU C++17 is supported." });
  if (typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "The source code is empty." });
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return res.status(400).json({ error: "The source code is larger than 64 KB." });
  res.status(503).json({ error: "The judge isn't connected yet, so nothing was submitted (coming in milestone 2)." });
});
