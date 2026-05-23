# apps/tournament/server/src/routers/round.ts

> Round management — create rounds, generate Swiss pairings, view, close.

## Prompt

Write a tRPC router `roundRouter`. All endpoints protected, TO-only for mutations.

### Constants

`MISSIONS` array: 'Sweeping Engagement', 'Priority Targets', 'Scorched Earth', 'Search and Destroy', 'Take and Hold', 'Vital Ground'. `randomMission()` picks one at random.

### Endpoints

**`create`:** Accept tournamentId + optional startTime. Verify TO + tournament is IN_PROGRESS. Count existing rounds → `roundNumber = count + 1`. Insert round with status PENDING.

**`generatePairings`:** Accept roundId. The core Swiss pairing endpoint.
1. Verify round exists, look up tournament, verify TO ownership
2. Get active (non-dropped) players
3. Get all previous rounds' pairings for rematch avoidance
4. Compute current standings via `computeStandings()`
5. Map standings to `SwissPlayer` format (with wins/losses/draws/margin/SOS)
6. Call `generatePairings(swissPlayers, prevPairings)` from `../lib/swiss/pairings`
7. Insert all generated pairings with a random mission
8. If there's a bye player, insert a bye pairing (player2Id: null, result: 'BYE', confirmed: 1)
9. Activate the round (status: ACTIVE)
10. Return inserted pairings

**`get`:** Accept round ID. Return the round with enriched pairings (player names + factions resolved from tournament_players via `inArray` lookup + Map).

**`close`:** Accept round ID. Verify TO + all non-bye pairings are confirmed. Set status: COMPLETE. If any unconfirmed, throw BAD_REQUEST with count.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `eq`, `and`, `inArray`
- `zod` — `z`
- `@tabletop-tools/db` — `tournaments`, `tournamentPlayers`, `rounds`, `pairings`
- `../lib/standings/compute` — `computeStandings`
- `../lib/swiss/pairings` — `generatePairings`
- `../trpc` — `router`, `protectedProcedure`
