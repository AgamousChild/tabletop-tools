# apps/tournament/server/src/routers/elo.ts

> ELO rating queries — get, history, leaderboard.

## Prompt

Write a tRPC router `eloRouter` with three protected read-only endpoints.

**`get`:** Accept userId (string). Look up player_elo. If not found, return default `{ rating: 1200, gamesPlayed: 0 }`.

**`history`:** Accept userId. Select all elo_history rows ordered by recordedAt descending.

**`leaderboard`:** Select all player_elo rows joined with authUsers (LEFT JOIN for display name). Order by rating descending. Return array of `{ userId, displayName, rating, gamesPlayed }`. If no user name, fall back to userId.

## Dependencies

- `drizzle-orm` — `eq`, `desc`
- `zod` — `z`
- `@tabletop-tools/db` — `playerElo`, `eloHistory`, `authUsers`
- `../trpc` — `router`, `protectedProcedure`
