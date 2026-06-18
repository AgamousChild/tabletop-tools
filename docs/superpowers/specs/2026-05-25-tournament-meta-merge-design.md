# Tournament → Meta Direct Integration — Design Spec

## Overview

Wire tournament completion directly into the meta analytics layer. When a tournament's status transitions to COMPLETE, it writes normalized data into `metaEvents`, `metaEventPlayers`, and `metaPairings` — the same tables that BCP imports and CSV imports write to. Drop the `importedTournamentResults` JSON blob staging table. Replace ELO with Glicko-2 as the single player rating system.

---

## Problem

Today, native tournament data reaches the meta analytics layer via a two-step process:
1. `tournament.advanceStatus(COMPLETE)` calls `exportToNewMeta()` which dumps a JSON blob into `importedTournamentResults`
2. A separate Glicko-2 batch job reads from `importedTournamentResults`, extracts player data, and computes ratings

This means:
- Tournament data is stored twice (live tables + JSON blob)
- The JSON blob (`rawData` + `parsedData`) is unstructured — no FKs, no validation
- Glicko-2 has to approximate pairings from the JSON because it doesn't have real round-by-round results
- Meta analytics (win rates, matchup matrices, cube) don't see native tournament data unless the admin manually triggers the pipeline
- Two rating systems exist (ELO for tournaments, Glicko-2 for meta) — neither has real data yet

---

## Design

### Tournament completion flow (new)

When `tournament.advanceStatus()` transitions to COMPLETE, the entire export runs in a **single SQLite transaction**:

```
1. Compute final standings via computeStandings(players, pairingResults) — full SOS tiebreakers, not raw wins/VP sort
2. Check uniqueness: SELECT from metaEvents WHERE source='native' AND sourceId=tournament.id
   - If exists → this is a re-export. DELETE cascade (metaEvents row + children) first.
3. INSERT INTO metaEvents
   - source: 'native'
   - sourceId: tournament.id
   - name, date, location, format, rounds, playerCount from tournament
   - Resolve winner's faction/detachment to dimFaction/dimDetachment FKs
4. For each tournamentPlayer (not dropped):
   INSERT INTO metaEventPlayers
   - eventId: the new metaEvents.id
   - playerName: displayName
   - factionId: resolveFaction(db, player.faction) → dimFaction FK
     - Case-insensitive: pre-fold input to match alias casing, or add case-insensitive aliases
     - If unresolvable: use 'unknown' faction (seed dim_faction with id='unknown', name='Unknown', allegiance='unknown')
   - subfactionId, detachmentId: resolve if present, null if not
   - placement: from computeStandings order (with SOS tiebreakers)
   - wins, losses, draws: from pairing results
   - listText: from player.listText
5. For each pairing with result (across all rounds):
   - Skip byes (player2Id is NULL in tournament pairings)
     - Bye games are excluded from metaPairings because metaPairings.player2Id is NOT NULL
     - Glicko-2 treats byes as non-games (standard Glickman approach — only real opponents count)
   INSERT INTO metaPairings
   - eventId: the new metaEvents.id
   - round: from round.roundNumber
   - player1Id, player2Id: mapped to new metaEventPlayers IDs
   - player1Score, player2Score: from pairing VP
   - result: mapped from P1_WIN/P2_WIN/DRAW to p1/p2/draw
6. Run Glicko-2 computation for this event's players
   - ratingPeriod stored in glickoHistory = metaEvents.id (the new row's ID)
7. Run incremental cube pipeline (meta_for frames + fact_game_results + meta_top)
```

If any step fails, the transaction rolls back — tournament stays COMPLETE but meta tables are untouched. An admin can retry via `retriggerExport(tournamentId)`.

### Re-export / retry

The `uq_meta_events_source` unique constraint on `(source, sourceId)` prevents duplicate exports. On re-export:
1. DELETE FROM metaEvents WHERE source='native' AND sourceId=tournament.id
2. CASCADE deletes metaEventPlayers and metaPairings for that event
3. Re-run the full export flow

Exposed as `admin.retriggerExport({ tournamentId })` endpoint — admin-only.

### Faction resolution at completion

Tournament players enter faction as free text. At completion, each player's faction is resolved via `resolveFaction(db, player.faction)` from `packages/db/src/factions.ts`.

To handle case differences: add case-folded duplicates to `dim_faction_alias` (e.g., both "Space Marines" and "space marines" → space-marines), or modify `resolveFaction()` to do a case-insensitive lookup.

If resolution fails: use fallback faction `'unknown'` (a row seeded in `dim_faction` with `id='unknown'`). `metaEventPlayers.factionId` is NOT NULL — every player gets a faction, even if it's unknown. Log a warning with the unresolved value.

### Glicko-2 engine location

The Glicko-2 engine currently lives in `apps/new-meta/server/src/lib/glicko2.ts`. Tournament completion needs to call it. Apps must not cross-import each other.

**Solution:** Extract the Glicko-2 engine to `packages/server-core/src/glicko2.ts` (or a new `packages/ratings/`). Both tournament and new-meta import from the shared package. The engine is pure math — it takes pairings + current ratings and returns updated ratings. No app-specific dependencies.

### Drop importedTournamentResults

- Remove `importedTournamentResults` from schema.ts
- Remove `exportToNewMeta()` function from tournament router (replaced by direct meta writes)
- Update admin CSV import to write directly to meta tables (same flow as BCP scraper)
- Rewrite `admin.recomputeGlicko` to iterate `metaEvents` ordered by date, loading `metaEventPlayers` + `metaPairings` for each event, and running the Glicko-2 engine with real opponent ratings (not the current approach of reading from importedTournamentResults JSON)
- Migration: existing importedTournamentResults data → metaEvents + metaEventPlayers rows (no metaPairings — round-by-round data not available in JSON blob). Migrated events will have empty metaPairings. Glicko-2 for those historical events will be approximate (from W/L/D only) until real pairing data is available.

### Drop ELO, use Glicko-2 everywhere

- Remove `playerElo` and `eloHistory` tables from schema.ts
- Remove `apps/tournament/server/routers/elo.ts` router
- Remove ELO computation from round closure
- Tournament leaderboard/rankings read from `playerGlicko` instead
- Player profile in tournament app shows Glicko-2 rating
- One rating system for all players (platform + imported)

### Glicko-2 auto-compute on tournament completion

After writing to meta tables (step 6 in completion flow), the Glicko-2 engine runs:
1. Load all metaPairings for this eventId
2. For each player, find or create a playerGlicko record (match by userId if platform user, else by playerName)
3. Compute rating updates using Glickman algorithm
4. Write glickoHistory records with `ratingPeriod = metaEvents.id`
5. Update playerGlicko with new ratings

### ratingPeriod format

`glickoHistory.ratingPeriod` stores the `metaEvents.id` of the event that triggered the rating update. This replaces the old approach of storing `importedTournamentResults.id`.

`player.profile` in new-meta joins `glickoHistory.ratingPeriod` → `metaEvents.id` to get event names. Historical records that used old staging table IDs will show as "Unknown Event" — acceptable since no real Glicko-2 computations have been run yet.

---

## Files changed

### Schema (`packages/db/src/schema.ts`)
- Remove: `importedTournamentResults`, `playerElo`, `eloHistory`
- Add: `dim_faction` row with id='unknown' for fallback
- No changes to: `tournaments`, `tournamentPlayers`, `rounds`, `pairings`, `metaEvents`, `metaEventPlayers`, `metaPairings`, `playerGlicko`, `glickoHistory`

### Shared package — Glicko-2 extraction
- Extract `apps/new-meta/server/src/lib/glicko2.ts` → `packages/server-core/src/glicko2.ts`
- Export from server-core barrel
- Both tournament and new-meta import from the shared package

### Tournament server (`apps/tournament/server/`)
- `routers/tournament.ts`: Replace `exportToNewMeta()` with direct meta table writes + Glicko-2 + cube pipeline, wrapped in transaction. Replace local `generateId()` with import from `@tabletop-tools/server-core`.
- `routers/elo.ts`: Delete entirely
- `routers/index.ts`: Remove elo router from appRouter

### New-meta server (`apps/new-meta/server/`)
- `routers/admin.ts`: Rewrite `recomputeGlicko` to iterate metaEvents + metaEventPlayers + metaPairings (not importedTournamentResults). Update CSV import to write directly to meta tables.
- `routers/player.ts`: Change LEFT JOIN from importedTournamentResults to metaEvents for event names in profile/history
- `routers/source.ts`: No change (already reads from metaEvents)
- `lib/glicko2.ts`: Move to packages/server-core (import path changes only)

### Admin server (`apps/admin/server/`)
- `routers/stats.ts`:
  - `overview()`: Remove importedTournamentResults and playerElo counts, add metaEvents count by source
  - `appActivity()`: Replace importedTournamentResults query with metaEvents filtered by source='native'

### Tournament client (`apps/tournament/client/`)
- Remove ELO leaderboard/history UI
- Replace with Glicko-2 rating display (import from shared package or call new-meta player endpoints)

### Migration (`packages/db/migrations/0011_tournament_meta_direct.sql`)
- Seed dim_faction with 'unknown' fallback row
- Add case-insensitive aliases to dim_faction_alias (or modify resolveFaction)
- Migrate existing importedTournamentResults data into metaEvents + metaEventPlayers (no metaPairings — pairing data not in JSON blob)
- Drop importedTournamentResults table
- Drop playerElo table
- Drop eloHistory table

### Test files requiring CREATE TABLE updates
These files have CREATE TABLE SQL for dropped tables and need updating:
1. `packages/db/src/schema.test.ts` — remove player_elo, elo_history, imported_tournament_results
2. `apps/tournament/server/src/routers/tournament.test.ts` — remove player_elo, elo_history, imported_tournament_results; add meta table CREATE TABLEs; test new completion flow
3. `apps/tournament/server/src/server.test.ts` — remove player_elo, elo_history, imported_tournament_results
4. `apps/admin/server/src/routers/stats.test.ts` — remove imported_tournament_results, player_elo; add dim tables
5. `apps/admin/server/src/server.test.ts` — remove imported_tournament_results, player_elo
6. `apps/new-meta/server/src/server.test.ts` — remove imported_tournament_results
7. `apps/new-meta/server/src/lib/playerMatch.test.ts` — may reference imported data
8. `apps/list-builder/server/src/server.test.ts` — remove player_elo (if present)

---

## What stays the same

- Tournament CRUD (create, register, check-in, rounds, pairings, results) — unchanged
- BCP scraper writes to meta tables — unchanged
- Meta analytics cube pipeline — unchanged (already incremental)
- Brain knowledge graph — unaffected
- All other apps — unaffected
