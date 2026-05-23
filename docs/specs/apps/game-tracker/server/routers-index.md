# apps/game-tracker/server/src/routers/index.ts

> Root router — health + match + turn + secondary sub-routers.

## Prompt

Create the root tRPC router with four entries:
1. `health` — public query returning `{ status: 'ok' as const }`
2. `match` — mount `matchRouter` from `./match`
3. `turn` — mount `turnRouter` from `./turn`
4. `secondary` — mount `secondaryRouter` from `./secondary`

Import `router` and `publicProcedure` from the **local** `../trpc` (not server-core — game-tracker has extended context).

## Dependencies

- `../trpc` — `router`, `publicProcedure`
- `./match` — `matchRouter`
- `./turn` — `turnRouter`
- `./secondary` — `secondaryRouter`
