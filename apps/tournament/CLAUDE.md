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
tournament.create({ name, eventDate, location?, format, totalRounds, description?, externalLink?, startTime?, maxPlayers?, missionPool?, requirePhotos?, includeTwists?, includeChallenger? }) -> tournament
tournament.get(id), tournament.listOpen(), tournament.listMine()
tournament.advanceStatus(id), tournament.delete(id)
tournament.standings(id)  -> { round, players[] with rank/wins/losses/draws/VP/margin/SOS }

// Players
player.register(), player.updateList(), player.checkIn(), player.drop()
player.list(), player.lockLists(), player.removePlayer(), player.reinstate()

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

**98 tests** (60 server + 38 client), all passing.

```
server/src/
  lib/
    swiss/pairings.ts / .test.ts         <- Swiss algorithm: round 1, mid-event, odd players, rematches, byes
    standings/compute.ts / .test.ts      <- tiebreaker ordering, SOS calculation
    result/derive.ts / .test.ts          <- result derivation from VP
  routers/
    tournament.test.ts                   <- 11 tests: CRUD, status, standings
    card.test.ts                         <- 5 tests: issue, list, history, auth
    award.test.ts                        <- 5 tests: create, assign, list, auth
  server.test.ts                         <- 6 tests: HTTP session integration

client/src/
  components/
    TournamentScreen.test.tsx            <- 18 tests: list, create, detail, standings, registration, rounds
    ManageTournament.test.tsx            <- 12 tests: tabs, players, cards, awards, reinstate
  lib/
    router.test.ts                       <- 8 tests: parseHash for all hash routes
```

```bash
cd apps/tournament/server && pnpm test   # 60 server tests
cd apps/tournament/client && pnpm test   # 38 client tests
```
