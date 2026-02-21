# CLAUDE.md — Tournament (Tournament Tracker)

> Read SOUL.md first. Every decision here flows from it.

---

## What This App Is

Tournament is a personal tournament companion for Warhammer 40K events. You log each round as you play it — opponent, their faction, mission, your VP, their VP. It tracks your record, running VP total, and tiebreakers across the full event. Your history across all tournaments you've attended lives here.

This is not a TO tool. It does not manage the event or generate pairings. It tracks your personal experience of one.

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
│  - Tournament setup             │
│  - Round-by-round entry         │
│  - Live standings (your record) │
│  - Tournament history           │
│  - tRPC client (type-safe)      │
└────────────────┬────────────────┘
                 │ tRPC over HTTP
┌────────────────▼────────────────┐
│  Tier 2: tRPC Server            │
│  - Auth router                  │
│  - Tournament router            │
│  - Round router                 │
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

## Database Schema

```typescript
// tournaments
id           TEXT PRIMARY KEY
user_id      TEXT NOT NULL
name         TEXT NOT NULL       -- e.g. "GT Finals London 2025"
event_date   INTEGER NOT NULL    -- timestamp
location     TEXT                -- optional
format       TEXT NOT NULL       -- e.g. "2000pts Matched Play"
total_rounds INTEGER NOT NULL    -- number of rounds in the event
list_id      TEXT                -- optional: references lists.id (from listbuilder)
created_at   INTEGER NOT NULL

// tournament_rounds
id                TEXT PRIMARY KEY
tournament_id     TEXT NOT NULL    -- references tournaments.id
user_id           TEXT NOT NULL
round_number      INTEGER NOT NULL
opponent_name     TEXT NOT NULL
opponent_faction  TEXT NOT NULL    -- BSData faction key
mission           TEXT NOT NULL    -- mission name
your_score        INTEGER NOT NULL -- VP scored
their_score       INTEGER NOT NULL -- VP scored by opponent
result            TEXT NOT NULL    -- WIN | LOSS | DRAW  (derived from scores)
match_id          TEXT             -- optional: links to apps/tracker match record
notes             TEXT             -- optional freetext
created_at        INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Tournaments
tournament.create({
  name,
  eventDate,
  location?,
  format,
  totalRounds,
  listId?,
})                                         → tournament

tournament.get(id)                         → tournament + all rounds
tournament.list()                          → tournament[]
tournament.delete(id)

// Rounds
round.add({
  tournamentId,
  roundNumber,
  opponentName,
  opponentFaction,
  mission,
  yourScore,
  theirScore,
  matchId?,
  notes?,
})                                         → round

round.update({ roundId, ...fields })       → round
round.delete(roundId)

// Standings (computed — no stored state)
tournament.standings(id)
  → {
      record: { wins: number; losses: number; draws: number }  // e.g. "3-1-0"
      totalVP: number
      vpAgainst: number
      margin: number         // totalVP - vpAgainst (tiebreaker)
      rounds: round[]
    }
```

---

## Result Derivation

Result is always computed from scores — never entered manually:

```typescript
function deriveResult(yourScore: number, theirScore: number): 'WIN' | 'LOSS' | 'DRAW' {
  if (yourScore > theirScore) return 'WIN'
  if (theirScore > yourScore) return 'LOSS'
  return 'DRAW'
}
```

Stored in the DB as the derived string at write time.

---

## User Flow

```
Login
  → "New Tournament"
      → Name, date, location (optional), format, number of rounds
      → (optional) Link your army list from ListBuilder

  LOOP — one entry per round as you play it:
    → "Add Round N"
    → Opponent name
    → Their faction (select from BSData list)
    → Mission
    → Your VP
    → Their VP
    → Result shown automatically
    → (optional) Link to a match record from Tracker
    → (optional) Notes

  TOURNAMENT VIEW at any point:
    → Current record: 3-1-0
    → Total VP: 142 / VP Against: 118 / Margin: +24
    → Round-by-round history

  END:
    → Final standings snapshot saved
```

---

## UI Notes

Same design tokens as the platform (slate-950 background, amber-400 accent, Geist).

Tournament header:
```
┌──────────────────────────────────────┐
│  GT Finals London 2025               │
│  Round 4 of 5  ·  2000pts            │
│                                      │
│  Record:   3 - 1 - 0                 │
│  VP:       142  Against: 118         │
│  Margin:   +24                       │
└──────────────────────────────────────┘
```

Round card:
```
┌─────────────────────────────────┐
│  Round 2 — WIN                  │  ← emerald for WIN, red for LOSS, slate for DRAW
│  vs. Dave  ·  Orks              │
│  Mission: Sweeping Engagement   │
│  Score: 72 – 45                 │
└─────────────────────────────────┘
```

---

## Rules for Every Session

- Plan before touching anything — understand every layer first.
- No features that aren't needed yet.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.

---

## Testing: TDD Required

Tests before code. No exceptions.

```
src/
  lib/
    standings/
      compute.ts
      compute.test.ts
    result/
      derive.ts
      derive.test.ts
```
