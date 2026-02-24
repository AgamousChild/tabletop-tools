# CLAUDE.md — packages/db

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

The shared database package for the entire Tabletop Tools platform. Single Turso (libSQL)
database, Drizzle ORM, 22 tables covering auth and all 7 server apps. Every app Worker
imports the schema and client factory from this package.

Provides:
- `schema.ts` — all 22 table definitions with indexes, unique constraints, and cascading deletes
- `client.ts` — `createDb(url, authToken)` and `createDbFromClient(client)` factories
- Type exports for all table row types

---

## Architecture

### Database: Turso (libSQL/SQLite)

Single database instance. All Workers connect to the same Turso DB via HTTP. SQLite
semantics (no concurrent writes, but reads are fast). Edge-compatible — no connection
pooling needed.

### ORM: Drizzle

Lightweight, type-safe, SQLite-native. No query builder abstraction — writes SQL-shaped
TypeScript. Schema defined in code, migrations generated via `drizzle-kit generate`.

### Table Ownership

| Domain | Tables | Count |
|---|---|---|
| Auth (Better Auth) | user, session, account, verification | 4 |
| no-cheat | diceSets, diceRollingSessions, rolls | 3 |
| versus | simulations | 1 |
| list-builder | lists, listUnits | 2 |
| game-tracker | matches, turns | 2 |
| tournament | tournaments, tournamentPlayers, rounds, pairings | 4 |
| ELO ratings | playerElo, eloHistory | 2 |
| new-meta | playerGlicko, glickoHistory, importedTournamentResults | 3 |
| shared ratings | unitRatings | 1 |
| admin | (no tables — reads from all others) | 0 |
| **Total** | | **22** |

---

## File Structure

```
packages/db/
  src/
    schema.ts         <- 22 tables with indexes, unique constraints, cascade deletes
    client.ts         <- createDb(), createDbFromClient() factories
    index.ts          <- barrel export (schema + client + types)
    schema.test.ts    <- 42 tests
  migrations/
    0000_messy_valkyrie.sql       <- auth tables (user, session, account, verification)
    0001_great_leper_queen.sql    <- all app tables
    0002_kind_dexter_bennett.sql  <- indexes + unique constraints + cascading deletes
  drizzle.config.ts
  package.json
  tsconfig.json
```

---

## Schema Details

### Indexes (27 total)

Every FK column and every column used in WHERE/JOIN clauses has an index. Covers:
auth (session.user_id, account.user_id, verification.identifier), no-cheat (dice_sets.user_id,
sessions.user_id, sessions.dice_set_id, rolls.session_id), versus (simulations.user_id),
list-builder (lists.user_id, list_units.list_id), game-tracker (matches.user_id, turns.match_id),
tournament (tournaments.to_user_id, tournament_players.tournament_id/user_id, rounds.tournament_id,
pairings.round_id/player1_id/player2_id), ratings (unit_ratings.unit_content_id/meta_window,
player_elo via UNIQUE, elo_history.user_id/pairing_id/opponent_id), new-meta
(imported_results.imported_by, player_glicko.user_id, glicko_history.player_id).

### Composite Unique Constraints (4)

1. `uq_unit_ratings_unit_window` — `(unit_content_id, meta_window)`
2. `uq_tournament_players_tourn_user` — `(tournament_id, user_id)`
3. `uq_rounds_tourn_number` — `(tournament_id, round_number)`
4. `uq_turns_match_number` — `(match_id, turn_number)`

Plus built-in unique constraints: `user.email`, `user.username`, `user.displayUsername`,
`session.token`, `player_elo.userId`.

### Cascading Deletes (23 FK relationships)

All child FK references have `ON DELETE CASCADE`. Deleting a user cascades through all
their data (dice sets, sessions, rolls, simulations, lists, matches, tournaments, ratings).
Deleting a parent entity cascades to its children (tournament -> rounds -> pairings,
match -> turns, list -> listUnits, etc.).

Migration 0002 implements this via table recreation with `PRAGMA foreign_keys` OFF/ON guards.

---

## Testing

**42 tests** in `schema.test.ts`:
- In-memory SQLite with `PRAGMA foreign_keys = ON`
- Table creation and basic insert/select for all 22 tables
- Foreign key relationship verification
- Cascade delete verification (user -> children chains)
- Unique constraint enforcement

```bash
cd packages/db && pnpm test
```

---

## Exports

```typescript
export { createDb, createDbFromClient } from './client'
export type { Db } from './client'
export * from './schema'  // all 22 tables + indexes + constraints
```
