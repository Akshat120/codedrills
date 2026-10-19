import { Router } from "express";
import { problems, submissions } from "../data/dummy.js";

export const problemRoutes = Router();

// accepted / attempted / null, from my submissions
function myStatus(slug) {
  const mine = submissions.filter(s => s.problemSlug === slug && s.status === "done");
  if (mine.some(s => s.verdict === "AC")) return "accepted";
  return mine.length ? "attempted" : null;
}

function summary(p) {
  return {
    slug: p.slug,
    code: p.code,
    title: p.title,
    difficulty: p.difficulty,
    tags: p.tags,
    status: myStatus(p.slug),
    acceptedCount: submissions.filter(s => s.problemSlug === p.slug && s.verdict === "AC").length
  };
}

problemRoutes.get("/", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const tag = String(req.query.tag || "").trim().toLowerCase();
  const min = Number(req.query.min) || 0;
  const max = Number(req.query.max) || Infinity;
  const list = problems
    .filter(p => !q || p.title.toLowerCase().includes(q) || p.code.toLowerCase() === q)
    .filter(p => !tag || p.tags.includes(tag))
    .filter(p => p.difficulty >= min && p.difficulty <= max)
    .map(summary);
  const tags = [...new Set(problems.flatMap(p => p.tags))].sort();
  res.json({ problems: list, tags });
});

problemRoutes.get("/:slug", (req, res) => {
  const p = problems.find(x => x.slug === req.params.slug);
  if (!p) return res.status(404).json({ error: "Problem not found." });
  res.json({ ...summary(p), timeLimitMs: p.timeLimitMs, memoryLimitMb: p.memoryLimitMb, statement: p.statement || null, samples: p.samples || [] });
});
