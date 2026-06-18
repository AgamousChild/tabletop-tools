# apps/no-cheat/server/src/worker.ts

> Worker entry point with R2 storage for evidence photos. Same pattern as game-tracker.

## Prompt

`createWorkerHandler<Env>` with `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, and optional `EVIDENCE_BUCKET` (R2 binding). If bucket exists, use `createR2Storage(bucket, 'https://evidence.tabletop-tools.net')`, otherwise `createNullR2Storage()`. Pass to `createServer(db, storage, secret)`.

Same R2 bucket type pattern as game-tracker — inline type to avoid Cloudflare Workers type dependency.
