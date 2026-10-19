import app from "./app.js";
import { authEnabled } from "./auth.js";

// Local development server. On Cloudflare, src/entry.cloudflare.js serves the
// same app.
const PORT = process.env.PORT || 3000;
// Without a password there is no login, so listen on this machine only
// (not the whole network) unless HOST says otherwise.
const HOST = process.env.HOST || (authEnabled() ? "0.0.0.0" : "127.0.0.1");

app.listen(PORT, HOST, () => {
  console.log(`CodeDrills running at http://localhost:${PORT}`);
});
