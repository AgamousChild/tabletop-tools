# apps/new-meta/server/src/routers/player.ts

> Public Glicko-2 player queries — leaderboard, profile, search.

## Prompt

Write a tRPC router `playerRouter` with three public endpoints.

**`leaderboard`:** Accept optional `{ limit (1-200, default 50), minGames (default 10) }`. Query `playerGlicko` where gamesPlayed >= minGames, ordered by rating desc, limited. Map each row to include `displayRating` (Math.round) and `displayBand` (Math.round(2 * ratingDeviation)) — the ±2RD uncertainty band.

**`profile`:** Accept `{ playerId }`. Look up playerGlicko by ID. If not found, return null. Also query `glickoHistory` LEFT JOINed with `importedTournamentResults` (to get event names for each rating period). Order by recordedAt desc. Return `{ player (with display fields), history[] }`.

**`search`:** Accept `{ name: string (min 1) }`. Query `playerGlicko` using `like(playerGlicko.playerName, '%${name}%')`. Return with display fields.

### Display fields

`displayRating = Math.round(rating)` — Glicko-2 ratings are floats, but users see integers.
`displayBand = Math.round(2 * ratingDeviation)` — The 95% confidence interval width.

## Dependencies

- `zod` — `z`
- `drizzle-orm` — `eq`, `desc`, `gte`, `like`
- `@tabletop-tools/db` — `playerGlicko`, `glickoHistory`, `importedTournamentResults`
- `../trpc.js` — `router`, `publicProcedure`
