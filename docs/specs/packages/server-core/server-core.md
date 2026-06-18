# packages/server-core/src/ — Server Core Package

> Eliminates 7x copy-paste of trpc.ts, server.ts, worker.ts, index.ts across app servers.

## trpc.ts
`BaseContext`: `{ user: User | null, req: Request, db: Db }`. `protectedProcedure` middleware throws UNAUTHORIZED if user is null, narrows context.user to non-null. Exports: `router`, `publicProcedure`, `protectedProcedure`, `createCallerFactory`.

## server.ts
`createBaseServer({ router, db, secret, extendContext? })` — creates Hono app with CORS (credentials enabled), registers `/trpc/*` handler. Calls `validateSession(db, headers, secret)` on every request to populate ctx.user. Optional `extendContext` callback for app-specific fields (storage, gameContent, adminEmails).

## worker.ts
`createWorkerHandler<TEnv>({ createApp })` — returns `{ fetch }` handler with module-scope caching (`let cachedApp`). `createApp` called once per isolate lifetime. `BaseEnv`: `TURSO_DB_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`.

## dev.ts
`startDevServer({ port, createApp })` — wraps `@hono/node-server` serve.

## id.ts
`generateId()` — `nanoid()`, 21-char URL-safe unique IDs.

## index.ts
Barrel export of everything above.
