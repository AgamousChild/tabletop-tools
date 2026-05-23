# apps/game-tracker/server/src/trpc.ts

> Local tRPC initialization — game-tracker needs its own `t` because it has extended context.

## Prompt

Write a local tRPC setup module. Game-tracker cannot re-export `protectedProcedure` from server-core because `BaseContext` doesn't include `storage`. Instead:

1. Define `Context = BaseContext & { storage: R2Storage }`
2. Create a local `t = initTRPC.context<Context>().create()`
3. Export `router`, `publicProcedure`, `createCallerFactory` from `t`
4. Export `protectedProcedure` with a middleware that checks `ctx.user` and throws `TRPCError({ code: 'UNAUTHORIZED' })` if null. Use `next({ ctx: { ...ctx, user: ctx.user } })` to narrow the type.
5. Re-export the `User` type from server-core.

### Why local tRPC

Apps with extended context (game-tracker, admin) need `initTRPC.context<ExtendedContext>().create()` locally. If they used server-core's `protectedProcedure`, TypeScript would see `BaseContext` (no `storage` field) and router handlers couldn't access `ctx.storage`.

## Dependencies

- `@tabletop-tools/server-core` — `BaseContext`, `User` (types)
- `@trpc/server` — `initTRPC`, `TRPCError`
- `./lib/storage/r2` — `R2Storage` (type)
