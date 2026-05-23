# apps/versus/server/src/server.ts

> Factory function that creates the Hono app for the versus server.

## Prompt

Write a one-function module that creates a Hono HTTP server for the versus app. Export a `createServer(db: Db, secret: string)` function that calls `createBaseServer` from `@tabletop-tools/server-core` with the app's tRPC router, the database instance, and the auth secret.

This is the simplest possible server — versus has no extended context (no R2 storage, no extra middleware). Just pass `{ router: appRouter, db, secret }` to `createBaseServer` and return the result.

Import the router from `./routers/index.js` (note the `.js` extension — this is ESM). Import `Db` as a type from `@tabletop-tools/db`.

## Dependencies

- `@tabletop-tools/server-core` — `createBaseServer`
- `@tabletop-tools/db` — `Db` (type only)
- `./routers/index.js` — `appRouter`

## Contracts

- Input: `db: Db`, `secret: string`
- Output: `Hono` app instance with tRPC handler, CORS, and auth middleware baked in
