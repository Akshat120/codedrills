# CodeDrills

A private, single-user competitive-programming practice judge with an original
problem bank, in a Codeforces-style UI. Planned home:
`codedrills.akshatdhiman.in`.

See [docs/DESIGN.md](docs/DESIGN.md) for the architecture, data model,
judge choice, hosting plan and security notes.

## Status

**Dummy stage.** The web app (`web/`) runs with hard-coded problems and
submissions. There is no database or judge yet, so submitting is validated and
then refused with a message.

| Part | Where | State |
|---|---|---|
| Web app (Express 5 on Cloudflare Workers + static SPA) | `web/` | Dummy data |
| Judge (isolate worker on a VPS) | `judge/` | Not started |
| Problem pipeline (testlib, GitHub Actions) | `pipeline/` | Not started |

## Run the web app locally

Needs Node 22 or newer.

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000. Without `APP_PASSWORD_HASH` there is no login
and the server only listens on 127.0.0.1.

To try the login, copy `web/.env.example` to `web/.env`, run
`npm run hash-password`, put the printed value in `APP_PASSWORD_HASH`, and
restart.

To run it inside the Workers runtime instead: `npm run cf:dev`.

## Deploy (Cloudflare Workers)

```bash
cd web
npx wrangler secret put APP_PASSWORD_HASH
npm run cf:deploy
```

Then attach the custom domain in the Cloudflare dashboard (Worker → Settings →
Domains & Routes). Never commit `.env` files or secrets.
