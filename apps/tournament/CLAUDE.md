# CLAUDE.md — Tournament (Tournament Manager)

> Read SOUL.md first. Every decision here flows from it.

---

## What This App Is

Tournament is a full tournament management platform for Warhammer 40K events — the job BCP does, but without the friction and without being owned by a third party.

Tournament Organizers (TOs) create and run events. Players register, submit army lists, check in on the day, and report their results. The app generates Swiss pairings each round, maintains live standings with proper tiebreakers, and shows a public pairings board that everyone in the room can see.

**Two distinct roles, one platform:**
- **TO** — owns the event. Creates it, opens registration, locks lists, generates pairings, closes rounds, resolves disputes.
- **Player** — registers for events, submits their list, checks in, reports results, confirms opponents' reports.

---

## Platform Context

```
tabletop-tools/
  packages/
    ui/           ← shared components, dark theme, Geist, shadcn
    auth/         ← shared Better Auth
    db/           ← shared Turso schema and Drizzle client
  apps/
    tournament/   ← this app
```

Server port: **3005**

---

## Architecture

```
┌─────────────────────────────────┐
│  Tier 1: React Client           │
│  - TO dashboard                 │
│  - Player registration / list   │
│  - Public pairings board        │
│  - Live standings table         │
│  - Result reporting             │
│  - tRPC client (type-safe)      │
└────────────────┬────────────────┘
                 │ tRPC over HTTP
┌────────────────▼────────────────┐
│  Tier 2: tRPC Server            │
│  - Auth router                  │
│  - Tournament router            │
│  - Player router                │
│  - Round router                 │
│  - Pairing router (Swiss algo)  │
│  - Result router                │
│  - Standings router             │
│  - SQLite via Turso             │
└─────────────────────────────────┘
```

---

## Stack

Same as the platform. No additions without a reason.

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Bundler | Vite |
| Test Runner | Vitest |
| API | tRPC + Zod |
| UI | React + Tailwind + shadcn |
| Database | Turso (libSQL/SQLite) via Drizzle |
| Auth | Better Auth (shared) |

---

## Tournament Lifecycle

```
DRAFT
  ↓  TO publishes
REGISTRATION          ← players can join and submit lists
  ↓  TO locks lists (event morning)
CHECK_IN              ← players mark themselves present
  ↓  TO starts the event
IN_PROGRESS           ← rounds being played
  ↓  TO closes final round
COMPLETE              ← standings locked, event over
```

Status stored on the tournament. Every state transition is a TO action. Players can only act within the permissions of the current status.

---

## Database Schema

```typescript
// tournaments
id            TEXT PRIMARY KEY
to_user_id    TEXT NOT NULL        -- references users.id (the TO who owns this event)
name          TEXT NOT NULL        -- e.g. "Warhammer World GT 2025"
event_date    INTEGER NOT NULL     -- timestamp
location      TEXT                 -- optional: venue name / city
format        TEXT NOT NULL        -- e.g. "2000pts Matched Play"
total_rounds  INTEGER NOT NULL
status        TEXT NOT NULL        -- DRAFT | REGISTRATION | CHECK_IN | IN_PROGRESS | COMPLETE
created_at    INTEGER NOT NULL

// tournament_players
id             TEXT PRIMARY KEY
tournament_id  TEXT NOT NULL        -- references tournaments.id
user_id        TEXT NOT NULL        -- references users.id
display_name   TEXT NOT NULL        -- shown on pairings board and standings
faction        TEXT NOT NULL        -- BSData faction key
list_text      TEXT                 -- full army list pasted as text (BattleScribe / New Recruit format)
list_locked    INTEGER NOT NULL DEFAULT 0  -- 1 = TO has locked lists, no more edits
checked_in     INTEGER NOT NULL DEFAULT 0  -- 1 = player present on event day
dropped        INTEGER NOT NULL DEFAULT 0  -- 1 = player withdrew, excluded from future pairings
registered_at  INTEGER NOT NULL

// rounds
id             TEXT PRIMARY KEY
tournament_id  TEXT NOT NULL        -- references tournaments.id
round_number   INTEGER NOT NULL
status         TEXT NOT NULL        -- PENDING | ACTIVE | COMPLETE
created_at     INTEGER NOT NULL

// pairings
id              TEXT PRIMARY KEY
round_id        TEXT NOT NULL        -- references rounds.id
table_number    INTEGER NOT NULL
player1_id      TEXT NOT NULL        -- references tournament_players.id
player2_id      TEXT                 -- NULL = bye round for player1
mission         TEXT NOT NULL
player1_vp      INTEGER              -- null until result reported
player2_vp      INTEGER              -- null until result reported
result          TEXT                 -- P1_WIN | P2_WIN | DRAW | BYE — computed from VP
reported_by     TEXT                 -- user_id who submitted the score
confirmed       INTEGER NOT NULL DEFAULT 0   -- 1 = opponent confirmed the score
to_override     INTEGER NOT NULL DEFAULT 0   -- 1 = TO manually resolved this result
created_at      INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Tournaments
tournament.create({ name, eventDate, location?, format, totalRounds }) → tournament
tournament.get(id)          → tournament + current status + player count
tournament.listOpen()       → tournament[]  -- public: REGISTRATION or CHECK_IN status
tournament.listMine()       → tournament[]  -- TO's own events + events player is in
tournament.advanceStatus(id) → tournament   -- TO only: moves to next lifecycle stage
tournament.delete(id)        -- TO only, DRAFT status only

// Players (player actions)
player.register({ tournamentId, displayName, faction, listText? })
player.updateList({ tournamentId, listText })   -- blocked once list_locked = 1
player.checkIn({ tournamentId })
player.drop({ tournamentId })

// Players (TO actions)
player.list({ tournamentId })            → tournament_player[]  -- with lists visible to TO
player.lockLists({ tournamentId })       -- sets list_locked = 1 for all
player.removePLayer({ playerId })        -- drops and removes from event

// Rounds
round.create({ tournamentId })           → round   -- TO only
round.generatePairings({ roundId })      → pairing[]  -- TO only, runs Swiss algorithm
round.get({ roundId })                   → round + pairings  -- public once round is ACTIVE
round.close({ roundId })                 -- TO only: marks COMPLETE, finalises standings

// Results
result.report({ pairingId, player1VP, player2VP })  -- either player in the pairing
result.confirm({ pairingId })                        -- the other player confirms
result.dispute({ pairingId })                        -- flags for TO to resolve
result.override({ pairingId, player1VP, player2VP }) -- TO only

// Standings
tournament.standings(id)
  → {
      round: number
      players: {
        rank:                number
        displayName:         string
        faction:             string
        wins:                number
        losses:              number
        draws:               number
        totalVP:             number
        vpAgainst:           number
        margin:              number    // totalVP - vpAgainst
        strengthOfSchedule:  number   // average opponent win %
      }[]
    }
```

---

## Swiss Pairing Algorithm

Standard Swiss as used in competitive 40K (same logic as BCP):

```typescript
function generatePairings(
  players: TournamentPlayer[],          // only active, non-dropped players
  previousPairings: Pairing[]           // all pairings from prior rounds
): Pairing[] {

  // 1. Sort: wins DESC → margin DESC → SOS DESC → registration order
  const ranked = sortByStandings(players)

  // 2. Group players by W-L-D record
  const groups = groupByRecord(ranked)

  // 3. Within each group: pair 1st vs (n/2+1)th, 2nd vs (n/2+2)th, etc.
  //    If odd count in group, drop bottom player to next group

  // 4. Rematch check: if a proposed pair has already played, swap with
  //    the adjacent pair in the group (recurse if needed)

  // 5. Bye: if total active player count is odd, lowest-ranked unpaired
  //    player gets a bye (counts as WIN, 0 VP for both sides)

  // 6. Assign table numbers sequentially by rank of higher-seeded player
}
```

This must be fully unit-tested before it touches a real event. Edge cases:
- All players same record (round 1)
- Odd number of players
- Rematches unavoidable in small events (allow with TO warning)
- Dropped players mid-event

---

## Result Reporting Flow

Either player in a pairing can report the result first:

```
Player A reports: 72 – 45
  → Result stored as PENDING CONFIRMATION
  → Player B notified

Player B confirms: ✓ Correct
  → Result locked, confirmed = 1

Player B disputes: ✗ Wrong
  → Flagged for TO
  → TO views both sides, sets override
```

Result is always derived from VP — never selected manually:
```typescript
function deriveResult(p1VP: number, p2VP: number): 'P1_WIN' | 'P2_WIN' | 'DRAW' {
  if (p1VP > p2VP) return 'P1_WIN'
  if (p2VP > p1VP) return 'P2_WIN'
  return 'DRAW'
}
```

---

## ELO Rating System

Every player on the platform carries a persistent ELO rating, updated after every confirmed match result — not just at tournament end. Swiss pairings determine who plays who within an event; ELO measures who is actually improving across all events over time.

### Parameters

| Parameter | Value | Reason |
|---|---|---|
| Starting rating | 1200 | Standard baseline — meaningful gap from the start |
| K-factor (new) | 32 | Fewer than 30 rated games — moves fast to find true level |
| K-factor (established) | 16 | 30+ rated games — stabilises, harder to inflate |

### Update Formula

```typescript
function updateElo(
  winnerRating: number,
  loserRating: number,
  kFactor: number,
  isDraw: boolean
): { newWinner: number; newLoser: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400))
  const expectedLoser  = 1 - expectedWinner

  const actualWinner = isDraw ? 0.5 : 1
  const actualLoser  = isDraw ? 0.5 : 0

  return {
    newWinner: Math.round(winnerRating + kFactor * (actualWinner - expectedWinner)),
    newLoser:  Math.round(loserRating  + kFactor * (actualLoser  - expectedLoser)),
  }
}
```

Ratings update when the TO closes a round — all results in that round are confirmed and committed together. Not deferred to end of tournament. After round 3 of a 5-round event, round 3 ELO changes are live immediately.

Dropped players: results from games already played count toward ELO. Rounds missed after dropping do not.

### Additional Schema

```typescript
// player_elo  (global across all tournaments)
id           TEXT PRIMARY KEY
user_id      TEXT NOT NULL UNIQUE   -- references users.id
rating       INTEGER NOT NULL        -- current ELO
games_played INTEGER NOT NULL        -- determines K-factor threshold
updated_at   INTEGER NOT NULL

// elo_history  (full audit trail — one row per game)
id             TEXT PRIMARY KEY
user_id        TEXT NOT NULL         -- references users.id
pairing_id     TEXT NOT NULL         -- references pairings.id
rating_before  INTEGER NOT NULL
rating_after   INTEGER NOT NULL
delta          INTEGER NOT NULL       -- positive = gained, negative = lost
opponent_id    TEXT NOT NULL          -- references users.id
recorded_at    INTEGER NOT NULL
```

### Additional tRPC

```typescript
elo.get(userId)       → { rating, gamesPlayed }
elo.history(userId)   → elo_history[]
elo.leaderboard()     → { userId, displayName, rating, gamesPlayed }[]
```

---

## Standings Tiebreakers

In order:
1. **Wins** (primary)
2. **VP Margin** — (total VP scored) minus (total VP conceded)
3. **Strength of Schedule** — average win percentage of all opponents faced
4. **Total VP scored** — last resort

All computed fresh from results on every standings request — no stored standings state.

---

## User Flows

### TO Flow

```
Login → "Create Tournament"
  → Name, date, location, format, number of rounds
  → Status: DRAFT  (not visible to players yet)

→ "Open Registration"
  → Status: REGISTRATION
  → Players can now find and register for the event
  → TO can see all registrations and submitted lists

Event morning:
→ "Lock Lists"
  → Players can no longer edit their lists
→ "Open Check-In"
  → Status: CHECK_IN
  → Players mark themselves present (or TO marks them)

→ "Start Event"
  → Status: IN_PROGRESS

ROUND LOOP (repeat for each round):
  → "Create Round N"
  → "Generate Pairings"
      → Swiss algorithm runs
      → Pairings board goes live — everyone in room can see table assignments
  → Players play their games and report results
  → TO monitors: sees pending confirmations, disputes, missing results
  → Resolve any disputes
  → "Close Round" — all results must be confirmed before this is allowed

→ "End Tournament" (after final round)
  → Status: COMPLETE
  → Final standings locked
```

### Player Flow

```
Login → Browse open tournaments
  → "Register" for an event
      → Enter display name shown on pairings board
      → Select faction
      → Paste army list (optional until lists are locked)

Before event:
  → Edit list anytime until TO locks lists

Event morning:
  → "Check In" — marks you as present

Each round (once TO opens it):
  → See your pairing: table number, opponent, mission
  → Play the game
  → "Report Result" — enter both players' VP scores
  → Opponent confirms (or disputes)

Between rounds / anytime:
  → Live standings — full table with W-L-D, VP, margin, SOS
  → Full pairings board — all tables for current and past rounds
```

---

## Army Lists

Lists are submitted as raw text — the same format players already use with BCP or at events (BattleScribe export, New Recruit output, etc.). No parsing required. The TO and opponents can read them.

```
Paste your list here...

+ FACTION KEYWORD: Space Marines
+ DETACHMENT: Gladius Task Force

HQ:
  Marneus Calgar [150pts]: Warlord

TROOPS:
  Intercessors [90pts]: 5x Intercessors
  ...
```

Lists become readable by all players after the TO locks them. Before lock, only the TO can see submitted lists.

---

## UI Notes

Same design tokens as the platform (slate-950 background, amber-400 accent, Geist).

**Pairings board** (designed to be displayed on a screen in the venue):
```
┌─────────────────────────────────────────────────────┐
│  GT Finals London 2025  ·  Round 3                  │
├───────┬──────────────────────┬──────────────────────┤
│ Table │ Player 1             │ Player 2             │
├───────┼──────────────────────┼──────────────────────┤
│   1   │ Alice  (Space Marine)│ Bob    (Orks)         │
│   2   │ Carol  (Necrons)     │ Dave   (Aeldari)      │
│   3   │ Eve    (Tau)         │ Frank  (CSM)          │
│  BYE  │ Grace  (Sisters)     │ —                    │
└───────┴──────────────────────┴──────────────────────┘
Mission: Sweeping Engagement
```

**Standings table:**
```
┌────┬──────────────┬───────────┬───┬───┬───┬─────┬────────┬────────┐
│ #  │ Player       │ Faction   │ W │ L │ D │ +/- │  VP    │  SOS   │
├────┼──────────────┼───────────┼───┼───┼───┼─────┼────────┼────────┤
│  1 │ Alice        │ Space Mar.│ 3 │ 0 │ 0 │ +72 │  219   │ 62.5%  │
│  2 │ Carol        │ Necrons   │ 2 │ 1 │ 0 │ +31 │  198   │ 58.3%  │
│  3 │ Bob          │ Orks      │ 2 │ 1 │ 0 │ +18 │  201   │ 55.6%  │
└────┴──────────────┴───────────┴───┴───┴───┴─────┴────────┴────────┘
```

---

## Rules for Every Session

- Plan before touching anything — understand every layer first.
- No features that aren't needed yet.
- The Swiss algorithm must be correct. An incorrect pairing ruins a real event.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.

---

## Testing: TDD Required

Tests before code. No exceptions.

The Swiss pairing algorithm and standings computation are the most critical pieces — they must be exhaustively tested against known correct outputs before any of it runs against a real event.

```
src/
  lib/
    swiss/
      pairings.ts
      pairings.test.ts     -- round 1, mid-event, odd players, rematch avoidance, byes
    standings/
      compute.ts
      compute.test.ts      -- tiebreaker ordering, SOS calculation
    result/
      derive.ts
      derive.test.ts
```
