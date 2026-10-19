// Cloudflare Workers entry: wraps the same Express app used locally. Static
// files and pages are served by Cloudflare's assets (see wrangler.toml); only
// /api/* and /health reach this Worker.
import http from "node:http";
import { httpServerHandler } from "cloudflare:node";
import app from "./app.js";

http.createServer(app).listen(3000);
export default httpServerHandler({ port: 3000 });
