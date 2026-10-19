# CodeDrills

A private, single-user competitive-programming practice judge with an original
problem bank, in a Codeforces-style UI. Planned home:
`codedrills.akshatdhiman.in`.

See [docs/DESIGN.md](docs/DESIGN.md) for the architecture, data model,
judge choice, hosting plan and security notes.

## Status

**Sample-data stage.** The web app (`web/`) reads problems and submissions
from MongoDB, filled with sample data by `npm run seed`. There is no judge yet,
so submitting is validated and then refused with a message.

| Part | Where | State |
|---|---|---|
| Web app (Express 5 on Cloudflare Workers + static SPA) | `web/` | Sample data in MongoDB |
| Judge (isolate worker on a VPS) | `judge/` | Not started |
| Problem pipeline (testlib, GitHub Actions) | `pipeline/` | Not started |

## Run the web app locally

Needs Node 22 or newer and Docker (for the local MongoDB on port 27018).

```bash
cd web
npm install
npm run db:up
npm run seed
npm run dev
```

`npm run db:explain` prints the query plans of the list queries (which index
each uses, and how many keys and documents it reads).

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
npx wrangler secret put MONGODB_URI
npm run cf:deploy
```

Then attach the custom domain in the Cloudflare dashboard (Worker → Settings →
Domains & Routes). Never commit `.env` files or secrets.
