# apps/content-ingestor/server/src/lib/ingest.ts

> Pipeline orchestrator — YouTube and web article ingest flows with job lifecycle management.

## Prompt

Four exported functions managing ingest job lifecycle in the `ingest_jobs` table:

**`startYoutubeIngest(opts)`** — creates job record (status=pending), submits URL to Gladia via `submitTranscription()`, updates job to status=transcribing with gladiaJobId. On failure, marks job as failed.

**`saveTranscript(opts)`** — called by Gladia callback. Looks up job by `gladiaJobId`, saves transcript text, updates status to transcribed. Throws if no matching job.

**`processJob(opts)`** — processes a transcribed job. Updates status to extracting, calls `extractNodes()` with Claude streaming API, then `writeNodesToBrain()` to write to R2 + Vectorize. Updates status to completed with nodesExtracted count. On failure, marks failed.

**`ingestWebArticle(opts)`** — single-step flow for articles. Creates job, fetches article text via `fetchArticleText()`, extracts nodes via Claude, writes to brain. Updates through status progression: pending → extracting → completed/failed.

All functions accept optional `fetch` for testability.

## Dependencies

- `@tabletop-tools/db` — `ingestJobs`, `Db`
- `@tabletop-tools/server-core` — `generateId`
- `drizzle-orm` — `eq`
- `./gladia` — `submitTranscription`
- `./extract` — `extractNodes`
- `./nodes` — `writeNodesToBrain`
- `./html` — `fetchArticleText`
