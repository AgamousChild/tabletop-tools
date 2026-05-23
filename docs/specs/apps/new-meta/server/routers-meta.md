# apps/new-meta/server/src/routers/meta.ts

> Public meta analytics queries — faction win rates, matchups, timelines from the cube tables.

## Prompt

Write a tRPC router `metaRouter` with public (no auth) endpoints that query the meta analytics cube.

### Frame resolution

Most endpoints accept an optional `frame` (string ID from `meta_for` table). If not provided, default to the latest quarterly frame: `SELECT id FROM meta_for WHERE type_id = 4 ORDER BY date DESC LIMIT 1`.

### Endpoints

**`factions`:** Accept optional `{ frame, minGames (default 5) }`. Query `meta_top` joined with `dim_faction` where `granularity_id = 1` (faction level) and `meta_for_id = frameId`. Filter by `minGames`. Return faction stats: winRate, drawRate, overRep, fourOhStart, event placement counts, playerPopPct, W/L/D, games, players. Order by winRate desc.

**`faction`:** Accept `{ factionId, frame? }`. Return comprehensive faction detail:
1. **Stat** from `meta_top` for this faction at faction granularity
2. **Detachments** from `fact_game_results` grouped by `dim_detachment`, min 5 games, ordered by win_rate desc
3. **Timeline** from `meta_top` joined with `meta_for` where `type_id = 2` (weekly), ordered by date asc
4. **Top lists** from `meta_event_players` joined with events and detachments, for this faction, ordered by placement asc, limit 20

**`matchups`:** Accept optional `{ frame, minGames (default 3) }`. Query `fact_game_results` self-joined to build faction-vs-faction win rates. Use `WHERE f.faction_id < f.opponent_faction_id` to avoid duplicates. Group by matchup pair. Return `{ factionA, factionB, aWins, bWins, draws, totalGames, aWinRate }`.

**`frames`:** No input. Query all `meta_for` entries joined with `dim_for_type` for type IDs 1,3,4,5,6 (event, month, quarter, year, dataslate). Return with human-readable labels: quarter → "2025 Q2", month → "2025-04", year → "2025", dataslate → strip prefix.

**`windows`:** No input. Return distinct quarterly frame IDs ordered by date desc. (Simplified version of `frames` for dropdown selectors.)

### SQL approach

All queries use raw `sql` tagged template literals from drizzle-orm (not query builder) because the cube queries involve complex JOINs and aggregations that are clearer as SQL.

## Dependencies

- `drizzle-orm` — `sql`
- `zod` — `z`
- `../trpc.js` — `router`, `publicProcedure`
