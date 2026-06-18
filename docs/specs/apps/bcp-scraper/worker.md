# apps/bcp-scraper/server/src/worker.ts

> Cloudflare Worker entry — BCP tournament scraper with cron trigger.

## Prompt

Hono app (NOT tRPC, NOT server-core) with module-scope caching for the Hono instance. Creates Turso DB from env vars per-request (not cached — DB client is lightweight).

`GET /health` → `{ status: 'ok' }`.

`POST /scrape` — bearer token auth via `SYNC_SECRET`. Creates DB, runs the full scrape pipeline: `runScrape()` → `runPipeline()` → `parsePendingLists()`. Returns scrape result.

`scheduled` handler — same pipeline in `ctx.waitUntil()`, triggered by cron. Chains the three steps with `.then()`.

Env: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `BCP_EMAIL`, `BCP_PASSWORD`, `SYNC_SECRET?`.

## Dependencies

- `hono`
- `@libsql/client` — `createClient`
- `@tabletop-tools/db` — `createDbFromClient`
- `./lib/scrape` — `runScrape`
- `./lib/pipeline` — `runPipeline`
- `./lib/parse-lists` — `parsePendingLists`

## Contracts

- Three-step pipeline: scrape BCP API → build analytics cube → parse army lists
- No auth middleware (not a tRPC app) — simple bearer token check
- Module-scope caching only for the Hono app, not DB (DB created per-request from env)
