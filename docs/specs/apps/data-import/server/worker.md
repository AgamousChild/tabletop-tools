# apps/data-import/server/src/worker.ts

> Cloudflare Worker entry — Hono HTTP endpoints + cron handler for game data sync pipeline.

## Prompt

Hono app (NOT tRPC) with three endpoints and a cron handler. No auth middleware — this is a public data API protected only by an optional bearer token on the sync endpoint.

CORS middleware on all routes using `CORS_ORIGIN` env var (default `https://tabletop-tools.net`), allowing GET and POST.

`GET /manifest.json` — read `manifest.json` from the R2 bucket (`GAME_DATA_BUCKET`). Return 404 with error message if not found. Set `Cache-Control: public, max-age=300`.

`GET /data/:file` — validate the `:file` param ends with `.json` (return 400 otherwise). Read `data/{file}` from R2. Return 404 if not found. Set `Cache-Control: public, max-age=3600` and `Content-Type: application/json`. Return body as text (not parsed JSON — avoid double serialization).

`POST /sync` — if `SYNC_SECRET` env var is set, require `Authorization: Bearer {secret}` header (return 401 on mismatch). Parse optional JSON body for `{ force?: boolean }`. Call `runSync(bucket, githubToken, force)` and return the result as JSON. Silently ignore body parse failures (no body or non-JSON is fine).

`scheduled` handler — Cloudflare cron trigger. Call `runSync(bucket, githubToken)` inside `ctx.waitUntil()`.

Export default with both `fetch: app.fetch` and the `scheduled` handler.

## Dependencies

- `hono`, `hono/cors`
- `./types` — `Env`
- `./lib/sync` — `runSync`

## Contracts

- Env bindings: `GAME_DATA_BUCKET` (R2Bucket), `SYNC_SECRET?` (string), `CORS_ORIGIN?` (string), `GITHUB_TOKEN?` (string)
- No tRPC, no auth middleware, no database
- Uses Hono's `HonoEnv = { Bindings: Env }` pattern for typed env access
