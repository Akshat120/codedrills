# CodeDrills

A private, single-user competitive-programming practice judge with an original
problem bank, in a Codeforces-style UI. Planned home:
`codedrills.akshatdhiman.in`.

See [docs/DESIGN.md](docs/DESIGN.md) for the architecture, data model,
judge choice, hosting plan and security notes.

## Status

**Judge running locally.** The web app (`web/`) reads problems and
submissions from MongoDB (sample data from `npm run seed`). Submissions are
judged by the judge in `judge/`, which runs in Docker locally and will run on
AWS Lambda. Only the sample problem CD0001 has tests so far.

| Part | Where | State |
|---|---|---|
| Web app (Express 5 on Cloudflare Workers + static SPA) | `web/` | Sample data in MongoDB |
| Judge (AWS Lambda; Docker locally) | `judge/` | Works locally; AWS packaging + setup guide in `judge/aws/` |
| Problem pipeline (testlib, GitHub Actions) | `pipeline/` | Not started |

## Run the web app locally

Needs Node 22 or newer and Docker (for the local MongoDB on port 27018 and
the judge on port 9001; `npm run db:up` builds and starts both).

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
