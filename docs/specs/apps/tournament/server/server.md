# apps/tournament/server/src/server.ts

> Factory — passes `Context` type parameter but no `extendContext`. Tournament uses local trpc.ts but only re-exports from server-core (no actual extension).

## Prompt

Export `createServer(db, secret)` calling `createBaseServer<Context>({ router: appRouter, db, secret })`. Import `Context` from local `./trpc`.

The `<Context>` generic is technically unnecessary here since tournament's Context IS BaseContext (just re-exported), but it's included for consistency with apps that do extend.
