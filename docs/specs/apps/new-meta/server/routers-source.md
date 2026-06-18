# apps/new-meta/server/src/routers/source.ts

> Public tournament data access — list tournaments, view individual tournament details.

## Prompt

Write a tRPC router `sourceRouter` with two public endpoints.

**`tournaments`:** Accept optional `{ format, limit (1-200, default 50) }`. Query `meta_events` LEFT JOINed with `dim_faction` (for winner faction name). Optionally filter by format. Order by date desc, limit. Return `{ eventId, eventName, eventDate, format, location, playerCount, rounds, winnerFaction }`.

**`tournament`:** Accept `{ eventId }`. Query event details + all players (from `meta_event_players` joined with `dim_faction` and `dim_detachment`) ordered by placement. Also query `meta_event_win_distribution`. Return `{ event info, players[], winDistribution[] }`.

### SQL approach

Uses raw `sql` tagged templates for the multi-table JOINs. Both endpoints use LEFT JOIN for optional dimension references (winner faction, detachment may be null).

## Dependencies

- `drizzle-orm` — `sql`
- `zod` — `z`
- `../trpc.js` — `router`, `publicProcedure`
