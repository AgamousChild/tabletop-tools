# apps/versus/server/src/index.ts

> Local dev server entry point for the versus app.

## Prompt

Write a dev server entry point that starts the versus tRPC server on port 3002 for local development. Import `dotenv/config` at the top to load environment variables.

Create a database connection using `createDb` from `@tabletop-tools/db` with the `TURSO_DB_URL` env var (defaulting to `'file:./dev.db'` for local SQLite) and optional `TURSO_AUTH_TOKEN`.

Call `startDevServer` from `@tabletop-tools/server-core` with port 3002 and a `createApp` callback that returns `createServer(db, secret)` where secret comes from `AUTH_SECRET` env var with a fallback of `'dev-secret-change-in-production'`.

Note: the `createApp` callback is async even though `createServer` is sync — the interface requires a Promise return.

## Dependencies

- `dotenv/config` — side-effect import for .env loading
- `@tabletop-tools/server-core` — `startDevServer`
- `@tabletop-tools/db` — `createDb`
- `./server.js` — `createServer`

## Contracts

- Starts HTTP server on localhost:3002
- Reads env: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`
