# apps/admin/server/src/worker.ts

> Worker with extended context — `adminEmails` + service bindings for BCP scraper and content ingestor.

## Prompt

`createWorkerHandler<Env>` with `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `ADMIN_EMAILS` (comma-separated), and two optional service bindings: `BCP_SCRAPER` and `CONTENT_INGESTOR` (both typed as `{ fetch(request: Request): Promise<Response> }`).

Parse ADMIN_EMAILS to string array. Pass all to `createServer(db, adminEmails, secret, bcpScraper, contentIngestor)`.

### Service bindings

The admin dashboard can trigger BCP scrapes and content ingestion via Workers service bindings. These are zero-latency intra-Cloudflare calls. If the bindings aren't configured, the corresponding trigger mutations return "not configured" errors.
