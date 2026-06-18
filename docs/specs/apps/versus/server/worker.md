# apps/versus/server/src/worker.ts

> Cloudflare Worker entry point for the versus combat simulator server.

## Prompt

Write a Cloudflare Worker entry point for a tRPC-based app server. The platform uses a shared `createWorkerHandler<Env>` factory from `@tabletop-tools/server-core` that handles module-scope caching of the Hono app instance (one app per isolate, not per request).

The Worker needs three environment bindings: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, and `AUTH_SECRET`. Inside `createApp`, create a libSQL client using `@libsql/client/web` (the web-compatible import — not the Node version, since this runs on Workers), wrap it with `createDbFromClient` from `@tabletop-tools/db`, then pass the db and secret to a local `createServer(db, secret)` function imported from `./server`.

Define the `Env` interface inline in this file — don't import it from elsewhere. The entire export is just the return value of `createWorkerHandler<Env>({ createApp })`.

## Dependencies

- `@tabletop-tools/server-core` — `createWorkerHandler`
- `@libsql/client/web` — `createClient`
- `@tabletop-tools/db` — `createDbFromClient`
- `./server` — `createServer`

## Contracts

- Input: Cloudflare Worker fetch event with `Env` bindings
- Output: Hono HTTP response (tRPC + CORS + auth middleware handled by server-core)
