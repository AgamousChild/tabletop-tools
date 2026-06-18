# apps/new-meta/server/src/worker.ts

> Worker entry point with `ADMIN_EMAILS` extended context.

## Prompt

`createWorkerHandler<Env>` with `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, and optional `ADMIN_EMAILS` (comma-separated string). Parse `ADMIN_EMAILS` into `string[]`: split on comma, trim, filter empty. Pass to `createServer(db, adminEmails, secret)`.

Same pattern as admin app — new-meta has its own admin import endpoints gated by email allowlist.
