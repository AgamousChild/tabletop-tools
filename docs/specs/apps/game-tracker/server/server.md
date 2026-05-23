# apps/game-tracker/server/src/server.ts

> Factory — game-tracker uses extended context to inject R2 storage.

## Prompt

Export `createServer(db: Db, storage: R2Storage, secret: string)` that calls `createBaseServer<Context>` with an `extendContext` callback. The callback spreads `ctx` and adds `storage`.

This is the key difference from versus/list-builder: game-tracker needs `ctx.storage` available in its routers for photo uploads. The generic type parameter `<Context>` tells server-core that the context has the `storage` field.

## Dependencies

- `@tabletop-tools/server-core` — `createBaseServer`
- `@tabletop-tools/db` — `Db` (type)
- `./routers` — `appRouter`
- `./lib/storage/r2` — `R2Storage` (type)
- `./trpc` — `Context` (type)
