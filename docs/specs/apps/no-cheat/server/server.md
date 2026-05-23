# apps/no-cheat/server/src/server.ts

> Factory with extended context — injects R2 storage for evidence photos. Same pattern as game-tracker.

## Prompt

Export `createServer(db, storage, secret)` calling `createBaseServer<Context>({ router: appRouter, db, secret, extendContext: (ctx) => ({ ...ctx, storage }) })`.
