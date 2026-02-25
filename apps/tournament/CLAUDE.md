# CLAUDE.md — tournament

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This App Is

Tournament is a full tournament management platform for Warhammer 40K events. TOs create and
run events. Players register, submit army lists, check in, and report results. Swiss pairings,
live standings with tiebreakers, and a public pairings board for venue projection.

**Two roles:** TO (owns event) and Player (participates in event).

**Port:** 3005 (server), Vite dev server proxies `/trpc` -> `:3005`

---

## Architecture

```
+---------------------------------+
|  Tier 1: React Client           |
|  - Hash-based routing           |
|  - TO dashboard                 |
|  - Player registration / list   |
|  - Public pairings board        |
|  - Live standings table         |
|  - Result reporting             |
|  - tRPC client (type-safe)      |
+----------------+----------------+
                 | tRPC over HTTP
+----------------v----------------+
|  Tier 2: tRPC Server            |
|  - Tournament router            |
|  - Player router                |
|  - Round router                 |
|  - Result router                |
|  - ELO router                   |
|  - SQLite via Turso             |
+----------------+----------------+
                 |
    @tabletop-tools/server-core
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.

---

## Client-Side Hash Routing

Bookmarkable, shareable URLs for key views:

```
#/                           -> tournament list (home)
#/create                     -> create tournament form
#/tournament/{id}            -> tournament detail
#/tournament/{id}/standings  -> standings table
```

Uses `parseHash()` + `navigate()` + `hashchange` listener pattern. Navigation uses `<a href>` elements.

---

## Tournament Lifecycle

```
DRAFT -> REGISTRATION -> CHECK_IN -> IN_PROGRESS -> COMPLETE
```

Every state transition is a TO action.

---

## Database Schema

```typescript
// tournaments
id, to_user_id, name, event_date, location, format, total_rounds, status, created_at

// tournament_players  (UNIQUE: tournament_id + user_id)
id, tournament_id, user_id, display_name, faction, list_text, list_locked, checked_in, dropped, registered_at

// rounds  (UNIQUE: tournament_id + round_number)
id, tournament_id, round_number, status, created_at

// pairings
id, round_id, table_number, player1_id, player2_id, mission, player1_vp, player2_vp, result, reported_by, confirmed, to_override, created_at

// player_elo  (UNIQUE: user_id)
id, user_id, rating, games_played, updated_at

// elo_history
id, user_id, pairing_id, rating_before, rating_after, delta, opponent_id, recorded_at
```

---

## tRPC Routers

```typescript
// Tournaments
tournament.create({ name, eventDate, location?, format, totalRounds }) -> tournament
tournament.get(id), tournament.listOpen(), tournament.listMine()
tournament.advanceStatus(id), tournament.delete(id)
tournament.standings(id)  -> { round, players[] with rank/wins/losses/draws/VP/margin/SOS }

// Players
player.register(), player.updateList(), player.checkIn(), player.drop()
player.list(), player.lockLists(), player.removePlayer()

// Rounds
round.create(), round.generatePairings(), round.get(), round.close()

// Results (with authorization checks)
result.report(), result.confirm(), result.dispute(), result.override()

// ELO
elo.get(userId), elo.history(userId), elo.leaderboard()
```

All errors use `TRPCError` with proper codes (NOT_FOUND, FORBIDDEN, BAD_REQUEST).
`result.dispute` checks that the caller is a participant in the pairing or the TO.

---

## Swiss Pairing Algorithm

Standard Swiss: sort by standings, group by W-L-D record, pair within groups avoiding rematches,
bye for odd player count. Fully unit-tested against edge cases.

---

## ELO Rating System

| Parameter | Value |
|---|---|
| Starting rating | 1200 |
| K-factor (< 30 games) | 32 |
| K-factor (30+ games) | 16 |

ELO updates when the TO closes a round -- all results committed together.

---

## Testing

**73 tests** (48 server + 25 client), all passing.

```
server/src/
  lib/
    swiss/pairings.ts / .test.ts         <- Swiss algorithm: round 1, mid-event, odd players, rematches, byes
    standings/compute.ts / .test.ts      <- tiebreaker ordering, SOS calculation
    result/derive.ts / .test.ts          <- result derivation from VP
  routers/                               <- router integration tests with TRPCError codes
server/src/server.test.ts                <- HTTP session integration tests

client/src/
  components/
    TournamentScreen.test.tsx            <- 18 tests: list, create, detail, standings, registration, rounds
  lib/
    router.test.ts                       <- 7 tests: parseHash for all hash routes
```

```bash
cd apps/tournament/server && pnpm test   # 48 server tests
cd apps/tournament/client && pnpm test   # 25 client tests
```
