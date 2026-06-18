# apps/content-ingestor/server/src/worker.ts

> Cloudflare Worker entry — YouTube/web content ingest pipeline with Gladia + Claude + R2 + Vectorize.

## Prompt

Hono app (NOT tRPC) with module-scope caching. Endpoints for a multi-step ingest pipeline that converts YouTube videos and web articles into 40K knowledge graph nodes.

`GET /health` → `{ status: 'ok' }`.

`GET /test-r2` — diagnostic endpoint: tests R2 write/read/delete, reads community.json size, writes a test node, verifies re-read. Returns diagnostic JSON.

`POST /ingest/youtube` — auth-gated. Accepts `{ url, sourceName? }`. Creates ingest job record, submits YouTube URL to Gladia for transcription with callback URL derived from the request origin. Returns `{ jobId }`.

`POST /ingest/web` — auth-gated. Accepts `{ url, sourceName? }`. Full single-step ingest: fetch article → extract nodes via Claude → write to R2 + Vectorize. Returns `{ jobId }`.

`POST /ingest/callback` — Gladia webhook callback (no auth). Parses callback payload, saves transcript to the matching ingest job in DB. Returns `{ received: true, jobId, status }`.

`POST /ingest/process/:id` — auth-gated. Processes a transcribed job: extract nodes via Claude streaming API → write to R2 + Vectorize. Returns `{ nodesExtracted }`.

`GET /jobs` — auth-gated. Lists 20 most recent ingest jobs ordered by createdAt desc.

Auth: `checkAuth()` helper — if `SYNC_SECRET` is set, require `Authorization: Bearer {secret}`.

Env: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `GLADIA_API_KEY`, `ANTHROPIC_API_KEY`, `SYNC_SECRET?`, `BRAIN_BUCKET` (R2), `BRAIN_INDEX` (Vectorize), `AI` (Workers AI).

## Dependencies

- `hono`
- `@libsql/client`, `@tabletop-tools/db` — `createDbFromClient`, `ingestJobs`
- `drizzle-orm` — `desc`
- `./lib/ingest` — `startYoutubeIngest`, `saveTranscript`, `processJob`, `ingestWebArticle`
- `./lib/gladia` — `parseGladiaCallback`
