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

**Phase 3 additions (2026-06-01):**
- Metric-stack standings engine: `ranking_metric` catalog + `tournament_pairing_metric` / `tournament_placing_metric` ordered stacks
- `passthrough_event`: thin BCP event reference table — directory of external BCP events
- `bcp_registration`: consent-gated BCP list submission record (consentAt from client click time)
- `tournament_players` gains `faction_entity_id`, `detachment_entity_id` (FK → content_entity), `placement` (frozen at tournament close)
- Client: `FactionDetachmentPicker` (data-driven from content_entity), `MetricStackStandings` (columns from metricKeys[]), `PassthroughDirectory`, `BcpListDrop`

---

## Features required to be considered functional 

1. TO can register for event.
2. Add Geocoding to event location
3. Give an area for description using markdown, add image upload for tournament, add external link, add location, add number of rounds.
4. Add Date and start time as data fields, image storage, link
5. Add TO information, location, description, image, link, number registered to the Tournament display
6. Add registered player management to the TO display - Add players, remove, reinstate. Yellow Card, Red Card, Ban
7. Show previous Card status of each player to the TO.
8. In TO tools, add special award location where the TO can add awards like Best Painted, Most sportsmanlike, etc. All customizable per tournament.
9. In round management, allow TO to enter score results if players do not use Game-tracker to score the match.
10. Add a clock to each round. (Optional)
11. Add a start time to each round.
12. Close Tournament should export data to the new-meta data.
13. Add a new selection interface to the main page of the app called Play, where users are presented with a search interface to find tournaments in their area. allow them to favorite and unfavorite them, and register.
14. After a tournament is closed out, show the view results button instead of the registration button.
15. Store tournament data back to a user record, and make a new selection interface to the main page called My Info, that shows list names, tournaments played in, ELO, GLICKO, rank, and overall record, include Card data and Ban data.
16. Add a list search tool for lists used in tournaments by faction.
17. Add a player search tool that shows tournaments played in, card status, lists used.


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
id, tournament_id, user_id, display_name, faction, list_text, list_locked, checked_in, dropped, registered_at,
faction_entity_id (FK→content_entity), detachment_entity_id (FK→content_entity), placement

// rounds  (UNIQUE: tournament_id + round_number)
id, tournament_id, round_number, status, created_at

// pairings
id, round_id, table_number, player1_id, player2_id, mission, player1_vp, player2_vp, result, reported_by, confirmed, to_override, created_at

// player_elo  (UNIQUE: user_id)
id, user_id, rating, games_played, updated_at

// elo_history
id, user_id, pairing_id, rating_before, rating_after, delta, opponent_id, recorded_at

// ranking_metric — catalog of metric keys (wins, losses, battle_points, sos_wins, etc.)
id, key (UNIQUE), label, description, created_at

// tournament_pairing_metric — ordered metric stack for pairing tiebreakers
id, tournament_id, metric_id (FK→ranking_metric), position, enabled, created_at

// tournament_placing_metric — ordered metric stack for final placing
id, tournament_id, metric_id (FK→ranking_metric), position, enabled, created_at

// passthrough_event — BCP event directory (thin reference)
id, bcp_event_id (UNIQUE), name, location, event_date, player_count, game_system, registration_url, raw_data, synced_at

// bcp_registration — consent-gated BCP list submission record
id, user_id, bcp_event_id, list_id, method (server|agent), status (submitted|failed|pending), consent_at, submitted_at, error_message
```

---

## tRPC Routers

```typescript
// Tournaments
tournament.create({ name, eventDate, location?, format, totalRounds, ... }) -> tournament
tournament.get(id), tournament.listOpen(), tournament.listMine()
tournament.advanceStatus(id), tournament.delete(id)
tournament.standings({ tournamentId, stackType: 'pairing'|'placing' })
  -> { round, stackType, metricKeys[], players[] }
  // Falls back to legacy compute when no metric stack configured

// Players
player.register({ ..., factionEntityId?, detachmentEntityId? })
player.updateList(), player.checkIn(), player.drop()
player.list(), player.lockLists(), player.removePlayer(), player.reinstate()
player.listFactions()       -> { id, name }[] from content_entity WHERE type='faction'
player.listDetachments({ factionEntityId }) -> { id, name, factionId }[] WHERE type='detachment'

// Metrics
metric.listMetrics()        -> ranking_metric catalog
metric.upsertMetric({ id?, key, label, description })
metric.getStack({ tournamentId, stackType: 'pairing'|'placing' })
metric.setStack({ tournamentId, stackType, metrics: [{ metricId, position, enabled }] })

// Passthrough (BCP event directory)
passthrough.list({ search?, limit? }) -> passthrough_event[]
passthrough.get(id)
passthrough.upsert({ bcpEventId, name, location?, eventDate?, playerCount?, gameSystem?, registrationUrl? })

// BCP Registration
bcpRegistration.record({ bcpEventId, listId?, method, status, consentAt }) -> bcp_registration
bcpRegistration.updateStatus({ id, status })
bcpRegistration.listMine()
bcpRegistration.getForEvent({ bcpEventId })

// Cards (Yellow/Red)
card.issue({ tournamentId, playerId, cardType, reason })
card.listForTournament({ tournamentId })
card.playerHistory({ userId })

// Awards
award.create({ tournamentId, name, description? })
award.assign({ awardId, recipientId })
award.list({ tournamentId })

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

**167 tests** (107 server + 60 client), all passing.

```
server/src/
  __fixtures__/
    test-players.ts                        <- TEST_PLAYERS fixture (dev/test only) for player.seedTestPlayers
  lib/
    swiss/pairings.ts / .test.ts           <- Swiss algorithm: round 1, mid-event, odd players, rematches, byes
    standings/compute.ts / .test.ts        <- tiebreaker ordering, SOS calculation
    standings/metric-compute.ts / .test.ts <- data-driven metric-stack standings (9 tests)
    result/derive.ts / .test.ts            <- result derivation from VP
  routers/
    tournament.test.ts                     <- 29 tests: CRUD, status, standings, exportToMeta, placement freeze
    player.test.ts                         <- 7 tests: seedTestPlayers environment gate (Rule 7), auth, FK-safe insert path
    metric.test.ts                         <- 9 tests: catalog CRUD, getStack, setStack
    passthrough.test.ts                    <- 7 tests: list, get, upsert, search
    bcp-registration.test.ts               <- 9 tests: record, updateStatus, listMine, getForEvent, auth
    card.test.ts                           <- 5 tests: issue, list, history, auth
    award.test.ts                          <- 5 tests: create, assign, list, auth
  server.test.ts                           <- 6 tests: HTTP session integration

client/src/
  components/
    TournamentScreen.test.tsx              <- 32 tests: list, create, detail, standings, registration, rounds
    ManageTournament.test.tsx              <- 16 tests: tabs, players, cards, awards, reinstate, seed-players PROD gate
  lib/
    router.test.ts                         <- 12 tests: parseHash for all hash routes
```

```bash
cd apps/tournament/server && pnpm test   # 107 server tests
cd apps/tournament/client && pnpm test   # 60 client tests
```

### Test data seeding (Rule 7)

`player.seedTestPlayers` inserts fixture players from `server/src/__fixtures__/test-players.ts`
for TO-driven local testing. Gated server-side: rejects with `FORBIDDEN` when
`ctx.environment === 'production'`. `ctx.environment` is threaded from the Worker's
`ENVIRONMENT` var (`wrangler.toml` sets it to `"production"` for the deployed Worker;
`worker.ts` defaults to `'production'` if unset — fail closed). Local dev (`index.ts`) and
router-level tests default to `'development'`. The "Load Test Players" button in
`ManageTournament` is hidden when `import.meta.env.PROD` is true, so the control never
appears where it's guaranteed to be rejected.

Because `tournament_players.user_id` is a NOT NULL FK to `"user"(id)` (enforced by libSQL —
verified `PRAGMA foreign_keys = 1` on the hosted Turso instance), each seeded player also
gets a real auth `user` row: id `test-<uuid>`, email `<id>@seed.invalid` — clearly marked
fixture data that only ever exists in dev/test databases.
