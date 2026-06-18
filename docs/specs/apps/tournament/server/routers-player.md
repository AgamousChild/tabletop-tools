# apps/tournament/server/src/routers/player.ts

> Player registration, list management, check-in, drop, TO management actions, profile, search.

## Prompt

Write a large tRPC router `playerRouter` with player-facing and TO-facing endpoints. All protected.

### Player-facing endpoints

**`register`:** Accept tournamentId, displayName, faction, optional detachment/listText/listId. Verify tournament exists and is in REGISTRATION status. Insert tournament_players row with all boolean fields as integers (0). Return created row.

**`updateList`:** Accept tournamentId + listText. Find the player by (tournamentId + userId). Reject if `listLocked`. Update listText.

**`checkIn`:** Accept tournamentId. Find player, set `checkedIn: 1`.

**`drop`:** Accept tournamentId. Find player, set `dropped: 1`.

### TO-facing endpoints (verify `toUserId === ctx.user.id`)

**`list`:** Accept tournamentId. Return all tournament_players for that tournament. TO-only.

**`lockLists`:** Accept tournamentId. Set `listLocked: 1` on ALL players in that tournament.

**`removePlayer`:** Accept playerId. Look up player → tournament → verify TO. Set `dropped: 1`.

**`reinstate`:** Accept playerId. Verify player IS dropped. Set `dropped: 0`. TO-only.

**`seedTestPlayers`:** Dev/testing helper. Accept tournamentId + optional count (1-32, default 8). Insert fake players with hardcoded names/factions/detachments (16 entries like "Alex Ironforge" / "Space Marines" / "Gladius Task Force"). Each gets a unique `test-{uuid}` userId. Stagger `registeredAt` times for deterministic sort order. TO-only.

### Profile/search endpoints

**`myProfile`:** Aggregate the current user's tournament history: all registrations, W/L/D from pairings, card history, ban status. Returns `{ tournamentsPlayed, wins, losses, draws, gamesPlayed, totalVP, tournaments[], cards[], bans[] }`.

**`searchLists`:** Accept optional faction/query. Filter tournament_players with non-empty `listText`. Join tournament names. Limit 50.

**`searchPlayers`:** Accept query (min 1 char). Search by displayName across all registrations. Group by userId. Include card counts, tournament history. Limit 25.

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `eq`, `and`, `like`, `inArray`
- `zod` — `z`
- `@tabletop-tools/db` — `tournaments`, `tournamentPlayers`, `pairings`, `rounds`, `tournamentCards`, `userBans`, `authUsers`
- `../trpc` — `router`, `protectedProcedure`
