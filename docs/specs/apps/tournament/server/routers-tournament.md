# apps/tournament/server/src/routers/tournament.ts

> Tournament CRUD, lifecycle management, standings, search, and new-meta export.

## Prompt

Write the main tournament router. All endpoints protected. This is the largest router in the app.

### Lifecycle state machine

Define `LIFECYCLE` map: `DRAFT → REGISTRATION → CHECK_IN → IN_PROGRESS → COMPLETE`. Each `advanceStatus` call moves to the next state. Only the TO (tournament organizer, `toUserId`) can advance.

### Endpoints

**`create` (mutation):** Accept name (required), eventDate (int), format (required), totalRounds (required min 1), plus optional: location, latitude, longitude, description, imageUrl (url validated), externalLink, startTime, maxPlayers (int min 1), missionPool (JSON string), requirePhotos/includeTwists/includeChallenger (booleans, default false). Generate UUID. Insert with `status: 'DRAFT'`. Booleans → integers. Return created row.

**`get` (query):** Accept tournament ID (string). Return the tournament with `playerCount` (count of tournament_players) and `toName` (join with authUsers for TO display name).

**`listOpen` (query):** Return tournaments with `status: 'REGISTRATION'`.

**`search` (query):** Accept optional `query` (string) and `status` filter. Default: exclude DRAFT. Filter by name/location/format (case-insensitive substring). Sort by eventDate descending. Limit 50. Include playerCount per tournament.

**`listMine` (query):** Return tournaments where user is either the TO or a registered player. Combine both sets by ID.

**`advanceStatus` (mutation):** Accept tournament ID. Verify TO ownership. Look up next status from LIFECYCLE. If advancing to COMPLETE, call `exportToNewMeta()` to push results to the new-meta pipeline. Return updated tournament.

**`delete` (mutation):** Accept tournament ID. Only deletable in DRAFT status. Verify TO ownership.

**`standings` (query):** Accept tournament ID. Load all players and all confirmed pairings. Call `computeStandings()` from `../lib/standings/compute`. Return `{ round: currentRoundNumber, players: standings[] }`.

### Internal helper: `exportToNewMeta()`

When a tournament completes, compile results into `importedTournamentResults` format:
1. Get all players, rounds, and pairings
2. Accumulate W/L/D and VP per player
3. Sort by wins desc → VP desc for placement
4. Compute metaWindow as `{year}-Q{quarter}` from eventDate
5. Build a `tournamentRecord` object with player placements
6. Insert into `importedTournamentResults` with raw + parsed JSON

## Dependencies

- `@trpc/server` — `TRPCError`
- `drizzle-orm` — `eq`, `and`, `inArray`
- `zod` — `z`
- `@tabletop-tools/db` — `tournaments`, `tournamentPlayers`, `rounds`, `pairings`, `importedTournamentResults`, `authUsers`
- `../lib/standings/compute` — `computeStandings`
- `../trpc` — `router`, `protectedProcedure`
