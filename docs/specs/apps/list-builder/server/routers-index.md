# apps/list-builder/server/src/routers/index.ts

> Root router — health + rating + list sub-routers.

## Prompt

Create the root tRPC router with three entries:
1. `health` — public query returning `{ status: 'ok' as const }`
2. `rating` — mount `ratingRouter` from `./rating`
3. `list` — mount `listRouter` from `./list`

Export `appRouter` and `AppRouter` type.

## Dependencies

- `@tabletop-tools/server-core` — `router`, `publicProcedure`
- `./rating` — `ratingRouter`
- `./list` — `listRouter`
