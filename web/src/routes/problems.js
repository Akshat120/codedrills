import { Router } from "express";
import {
  getProblem,
  listProblemOptions,
  listProblems,
  parseListQuery,
  progressSummary
} from "../repositories/problemRepository.js";

export const problemRoutes = Router();

// GET /api/problems?q=&tag=&min=&max=&page=&perPage=
problemRoutes.get("/", async (req, res) => {
  res.json(await listProblems(parseListQuery(req.query)));
});

problemRoutes.get("/options", async (_req, res) => {
  res.json({ problems: await listProblemOptions() });
});

problemRoutes.get("/progress", async (_req, res) => {
  res.json(await progressSummary());
});

problemRoutes.get("/:slug", async (req, res) => {
  const problem = await getProblem(req.params.slug);
  if (!problem) return res.status(404).json({ error: "Problem not found." });
  res.json(problem);
});
