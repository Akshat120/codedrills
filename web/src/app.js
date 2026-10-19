import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { authRoutes, requireAuth } from "./auth.js";
import { problemRoutes } from "./routes/problems.js";
import { submissionRoutes } from "./routes/submissions.js";
import { languages } from "./data/languages.js";

// The Express app, shared by the local server (src/server.js) and the
// Cloudflare Worker (src/entry.cloudflare.js). On Cloudflare, static files and
// page routes are served by the CDN (see wrangler.toml); the static handlers
// here matter only locally. Workers have no files on disk, so they skip them.
const onWorkers = Boolean(process.env.CF_WORKER) || typeof import.meta.url !== "string";
const __dirname = onWorkers ? "/" : path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable("x-powered-by");

const publicDir = path.join(__dirname, "../public");

// Page routes handled by the SPA (public/js/app.js)
const clientRoutes = [
  "/",
  "/problemset",
  "/problemset/problem/:code",
  "/submit",
  "/status",
  "/submission/:id",
  "/admin"
];

// Security headers on every response (public/_headers sets the same ones for
// the static files Cloudflare serves)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'"
  );
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Cross-site request forgery guard for the API: a write must come from this
// site (Origin, when the browser sends one) and, when it has a body, be JSON.
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    let sameSite = false;
    try {
      sameSite = new URL(origin).host === host;
    } catch (_) {}
    if (!sameSite) return res.status(403).json({ error: "Cross-site request refused." });
  }
  const type = req.headers["content-type"];
  if (type && !/^application\/json\s*(;|$)/i.test(type)) {
    return res.status(415).json({ error: "Send JSON (Content-Type: application/json)." });
  }
  next();
});

app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/problems", requireAuth, problemRoutes);
app.use("/api/submissions", requireAuth, submissionRoutes);
app.get("/api/languages", requireAuth, (_req, res) => res.json({ languages }));
app.get("/api/judge/status", requireAuth, (_req, res) => {
  res.json({ online: false, message: "Judge not connected yet (milestone 2)." });
});
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

if (!onWorkers) {
  app.use(express.static(publicDir, { extensions: ["html"] }));
  for (const route of clientRoutes) {
    app.get(route, (_req, res) => res.sendFile("index.html", { root: publicDir }));
  }
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Server error." });
});

export default app;
