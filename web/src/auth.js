import crypto from "node:crypto";
import { Router } from "express";
import { parseHash, verifyPassword } from "./passwordHash.js";

// Single-user password login (always required on Cloudflare). A successful
// login sets a signed, HttpOnly session cookie.
//
// The password is set with APP_PASSWORD_HASH: an scrypt hash made by
// `npm run hash-password`, so the password itself is stored nowhere.
// Without a hash (local development only) there is no login.
//
// Dummy-stage note: sessions are stateless signed tokens and failed logins are
// only slowed down. Mongo-backed sessions and the login rate limit come with
// the database in milestone 1/2.
const COOKIE_NAME = "cd_session";
const SESSION_DAYS = 30;

function passwordHash() {
  return (process.env.APP_PASSWORD_HASH || "").trim();
}

export function authEnabled() {
  return Boolean(passwordHash());
}

// Why login can't work, or null. On Cloudflare the API refuses to run without
// a password rather than exposing anything.
function authConfigError() {
  if (passwordHash() && !parseHash(passwordHash())) {
    return "APP_PASSWORD_HASH is not a valid hash. Generate one with: npm run hash-password";
  }
  if (process.env.CF_WORKER && !authEnabled()) {
    return "No password is set on the server (APP_PASSWORD_HASH).";
  }
  return null;
}

// Signing key: SESSION_SECRET if given, otherwise derived from the stored
// hash, so changing the password logs out every existing session.
function signingKey() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  return crypto.createHash("sha256").update(`cd-session:${passwordHash()}`).digest("hex");
}

function sign(value) {
  return crypto.createHmac("sha256", signingKey()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function createToken() {
  const expiresAt = String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

function validToken(token) {
  if (!token) return false;
  const [expiresAt, signature] = String(token).split(".");
  if (!expiresAt || !signature) return false;
  return safeEqual(signature, sign(expiresAt)) && Number(expiresAt) > Date.now();
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function isHttps(req) {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function isLoggedIn(req) {
  return !authEnabled() || validToken(readCookie(req, COOKIE_NAME));
}

export const authRoutes = Router();

authRoutes.get("/session", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const configError = authConfigError();
  if (configError) return res.json({ authEnabled: true, loggedIn: false, error: configError });
  res.json({ authEnabled: authEnabled(), loggedIn: isLoggedIn(req), handle: "akshat" });
});

authRoutes.post("/login", async (req, res) => {
  const configError = authConfigError();
  if (configError) return res.status(503).json({ error: configError });
  if (!authEnabled()) return res.json({ ok: true });

  const given = req.body?.password;
  if (typeof given !== "string" || given.length > 1024 || !(await verifyPassword(given, passwordHash()))) {
    await new Promise(resolve => setTimeout(resolve, 600)); // slow down guessing
    return res.status(401).json({ error: "Wrong password." });
  }

  setSessionCookie(req, res, createToken(), SESSION_DAYS * 24 * 60 * 60);
  return res.json({ ok: true });
});

authRoutes.post("/logout", (req, res) => {
  setSessionCookie(req, res, "", 0);
  res.json({ ok: true });
});

// Guards every other /api route
export function requireAuth(req, res, next) {
  const configError = authConfigError();
  if (configError) return res.status(503).json({ error: configError });
  if (!isLoggedIn(req)) return res.status(401).json({ error: "Please log in." });
  return next();
}
