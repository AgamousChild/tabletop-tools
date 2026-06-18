# apps/admin/server/src/server.ts

> Factory with extended context — adminEmails + service binding fetchers.

## Prompt

Export `createServer(db, adminEmails, secret, bcpScraper?, contentIngestor?)` calling `createBaseServer<Context>` with `extendContext: (ctx) => ({ ...ctx, adminEmails, bcpScraper, contentIngestor })`.

Uses `Fetcher` type for `bcpScraper` (Cloudflare Workers type for service bindings). The `contentIngestor` is typed as `{ fetch(request: Request): Promise<Response> }` to avoid importing Workers types.
