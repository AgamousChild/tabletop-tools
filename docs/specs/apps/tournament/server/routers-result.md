# apps/tournament/server/src/routers/result.ts

> Match result reporting with player authorization and TO override.

## Prompt

Write a tRPC router `resultRouter` with four protected endpoints for managing pairing results.

**`report`:** Accept pairingId, player1VP, player2VP. Verify caller is a participant (look up both tournament_players, check userId). Reject if BYE. Call `deriveResult(p1VP, p2VP)`. Update pairing with VP, result, `reportedBy: ctx.user.id`, `confirmed: 0`. Return updated pairing.

**`confirm`:** Accept pairing ID. Verify caller is a participant but NOT the reporter (the other player confirms). Set `confirmed: 1`.

**`dispute`:** Accept pairing ID. Verify caller is either a participant OR the TO (look up pairing → round → tournament → check toUserId). Clear the result: set `confirmed: 0, result: null, player1Vp: null, player2Vp: null`. This forces a re-report.

**`override`:** Accept pairingId, player1VP, player2VP. TO-only (verify via round → tournament → toUserId). Derive result, set VP, `confirmed: 1`, `toOverride: 1`. This bypasses the two-player confirmation flow.

### Authorization pattern

Player identification goes through tournament_players: `pairing.player1Id` / `player2Id` → `tournamentPlayers.id` → `.userId` → compare to `ctx.user.id`.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `eq`
- `zod` — `z`
- `@tabletop-tools/db` — `pairings`, `tournamentPlayers`, `rounds`, `tournaments`
- `../lib/result/derive` — `deriveResult`
- `../trpc` — `router`, `protectedProcedure`
