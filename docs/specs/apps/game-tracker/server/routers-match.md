# apps/game-tracker/server/src/routers/match.ts

> Match lifecycle CRUD — start, list, get, close, delete, startFromPairing.

## Prompt

Write a tRPC router `matchRouter` for managing 40K match lifecycle. All endpoints are protected. Import `protectedProcedure` and `router` from the local `../trpc`.

### ID generation

Local `generateId()`: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

### Endpoints

**`start` (mutation):** Create a new match. Accept a large input schema with `opponentFaction` and `mission` required, everything else optional (opponentName, opponentDetachment, yourFaction, yourDetachment, listId, isTournament, terrainLayout, deploymentZone, twistCards, challengerCards, requirePhotos, attackerDefender, whoGoesFirst, date, location, tournamentName, tournamentId). Generate an ID, insert into `matches` with `userId: ctx.user.id`, `result: null` (in-progress), `closedAt: null`. Boolean fields convert to integer (0/1). Return the full match row.

**`startFromPairing` (mutation):** Create a match auto-populated from a tournament pairing. Accept `{ pairingId: string }`. Look up the pairing → find both tournament_players → determine which one is the caller (by `userId`) → look up the tournament via the round → create a match pre-filled with opponent info, mission from pairing, tournament metadata. Throw FORBIDDEN if caller isn't in the pairing, NOT_FOUND if pairing doesn't exist.

**`list` (query):** Select all matches for the current user where `hiddenAt` is null (soft-deleted matches hidden). Use `isNull(matches.hiddenAt)` from drizzle-orm.

**`get` (query):** Select a match by ID (must belong to user). Also select all `turns` and `matchSecondaries` for the match. Return `{ ...match, turns, secondaries }`. Throw NOT_FOUND if not found.

**`delete` (mutation):** If the match has a `tournamentId`, soft-delete by setting `hiddenAt = Date.now()` (tournament data preserved for standings). Otherwise, hard-delete via `ctx.db.delete(matches)` (cascade handles turns/secondaries). Ownership check first.

**`close` (mutation):** Accept `{ matchId, yourScore, theirScore }`. Call `deriveResult(yourScore, theirScore)` from `../lib/scoring/result`. Update the match with `result`, `yourFinalScore`, `theirFinalScore`, `closedAt`. Return the result.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `and`, `eq`, `isNull`
- `zod` — `z`
- `@tabletop-tools/db` — `matches`, `turns`, `matchSecondaries`, `tournaments`, `tournamentPlayers`, `pairings`, `rounds`
- `../trpc` — `protectedProcedure`, `router`
- `../lib/scoring/result` — `deriveResult`
