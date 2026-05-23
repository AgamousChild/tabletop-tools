# apps/tournament/server/src/routers/award.ts

> Custom tournament awards (Best Painted, Most Sportsmanlike, etc.).

## Prompt

Write a tRPC router `awardRouter` with three protected endpoints.

**`create` (mutation):** Accept tournamentId, name (min 1 char), optional description. Verify TO ownership. Insert into tournament_awards with `recipientId: null` (not yet assigned).

**`assign` (mutation):** Accept awardId + recipientId (tournament_players.id). Look up award → tournament → verify TO. Update `recipientId`.

**`list` (query):** Accept tournamentId. Return all awards for that tournament.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `eq`
- `zod` — `z`
- `@tabletop-tools/db` — `tournaments`, `tournamentAwards`
- `../trpc` — `router`, `protectedProcedure`
