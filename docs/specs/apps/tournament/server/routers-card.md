# apps/tournament/server/src/routers/card.ts

> Yellow/Red card management for tournament discipline.

## Prompt

Write a tRPC router `cardRouter` with three protected endpoints.

**`issue` (mutation):** Accept tournamentId, playerId, cardType ('YELLOW'|'RED'), reason (min 1 char). Verify tournament exists + caller is TO. Verify player belongs to that tournament. Insert into tournament_cards. Return created row.

**`listForTournament` (query):** Accept tournamentId. Return all cards for that tournament. (No TO check — any authenticated user can view cards.)

**`playerHistory` (query):** Accept playerId (tournament_players.id). Look up the player → find their userId → find ALL registrations for that userId → return all cards across ALL tournaments for that user. This gives TOs a cross-tournament view of a player's discipline history.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `eq`, `and`
- `zod` — `z`
- `@tabletop-tools/db` — `tournaments`, `tournamentPlayers`, `tournamentCards`
- `../trpc` — `router`, `protectedProcedure`
