# apps/tournament/server/src/routers/index.ts

> Root router — 7 sub-routers, the most of any app.

## Prompt

Create the root tRPC router with:
1. `health` — public query → `{ status: 'ok' as const }`
2. `tournament` — `tournamentRouter`
3. `player` — `playerRouter`
4. `round` — `roundRouter`
5. `result` — `resultRouter`
6. `elo` — `eloRouter`
7. `card` — `cardRouter`
8. `award` — `awardRouter`

Import `router`, `publicProcedure` from `../trpc`.

## Dependencies

- `../trpc` — `router`, `publicProcedure`
- `./tournament`, `./player`, `./round`, `./result`, `./elo`, `./card`, `./award`
