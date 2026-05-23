# apps/game-tracker/server/src/worker.ts

> Cloudflare Worker entry point — game-tracker has extended context (R2 storage for photos).

## Prompt

Write a Worker entry point using `createWorkerHandler<Env>`. Unlike versus/list-builder, game-tracker needs R2 storage for match photos.

Env bindings: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, and optional `PHOTOS_BUCKET` (R2 bucket binding). The `PHOTOS_BUCKET` type is inline: `{ put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType: string } }): Promise<unknown> }` — this avoids importing Cloudflare Workers types into the client build.

Inside `createApp`:
1. Create libSQL client + wrap with `createDbFromClient`
2. Create storage: if `env.PHOTOS_BUCKET` exists, use `createR2Storage(bucket, 'https://photos.tabletop-tools.net')`, otherwise `createNullR2Storage()`
3. Return `createServer(db, storage, env.AUTH_SECRET)`

## Dependencies

- `@tabletop-tools/server-core` — `createWorkerHandler`
- `@libsql/client/web` — `createClient`
- `@tabletop-tools/db` — `createDbFromClient`
- `./server` — `createServer`
- `./lib/storage/r2` — `createR2Storage`, `createNullR2Storage`
