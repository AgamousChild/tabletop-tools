# apps/list-builder/server/src/worker.ts

> Cloudflare Worker entry point — identical pattern to versus.

## Prompt

Write a Cloudflare Worker entry point using `createWorkerHandler<Env>` from `@tabletop-tools/server-core`. Env has `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`. Inside `createApp`, create a libSQL client with `@libsql/client/web`, wrap with `createDbFromClient`, pass to `createServer(db, secret)`.

This is the exact same pattern as versus/worker.ts — list-builder has no extended context.

## Dependencies

- `@tabletop-tools/server-core` — `createWorkerHandler`
- `@libsql/client/web` — `createClient`
- `@tabletop-tools/db` — `createDbFromClient`
- `./server` — `createServer`
