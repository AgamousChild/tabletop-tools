# CLAUDE.md — Tracker (Match Tracker)

> Read SOUL.md first. Every decision here flows from it.

---

## What This App Is

Tracker is a live game companion for Warhammer 40K matches. It records the full match turn by turn — one photo per turn of the board state, plus everything that happened: units lost, objectives scored, CP spent. At the end, the full history feeds back into ListBuilder to inform unit ratings.

---

## Platform Context

```
tabletop-tools/
  packages/
    ui/       ← shared components, dark theme, Geist, shadcn
    auth/     ← shared Better Auth
    db/       ← shared Turso schema and Drizzle client
  apps/
    tracker/  ← this app
```

Server port: **3004**

---

## Architecture

```
┌─────────────────────────────────┐
│  Tier 1: React Client           │
│  - Match setup screen           │
│  - Live turn-by-turn entry      │
│  - Camera (board state photo)   │
│  - End-of-match summary         │
│  - tRPC client (type-safe)      │
└────────────────┬────────────────┘
                 │ tRPC over HTTP
┌────────────────▼────────────────┐
│  Tier 2: tRPC Server            │
│  - Auth router                  │
│  - Match router                 │
│  - Turn router                  │
│  - Photo storage (R2)           │
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
| Photo storage | Cloudflare R2 |

---

## Database Schema

```typescript
// matches
id               TEXT PRIMARY KEY
user_id          TEXT NOT NULL
list_id          TEXT              -- optional: references lists.id (from listbuilder)
opponent_faction TEXT NOT NULL     -- BSData faction key
mission          TEXT NOT NULL     -- mission name
result           TEXT              -- WIN | LOSS | DRAW — null while in progress
your_final_score INTEGER           -- null while in progress
their_final_score INTEGER          -- null while in progress
created_at       INTEGER NOT NULL
closed_at        INTEGER           -- null while match is open

// turns
id                   TEXT PRIMARY KEY
match_id             TEXT NOT NULL      -- references matches.id
turn_number          INTEGER NOT NULL
photo_url            TEXT               -- Cloudflare R2 — always stored for match record
your_units_lost      TEXT NOT NULL      -- JSON array of unit ids / names
their_units_lost     TEXT NOT NULL      -- JSON array of unit ids / names
primary_scored       INTEGER NOT NULL   -- VP from primary this turn
secondary_scored     INTEGER NOT NULL   -- VP from secondary this turn
cp_spent             INTEGER NOT NULL
notes                TEXT               -- optional freetext
created_at           INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Matches
match.start({ opponentFaction, mission, listId? })   → match
match.get(id)                                         → match + all turns
match.list()                                          → match[]
match.close({ matchId, yourScore, theirScore })       → { result, yourScore, theirScore }

// Turns
turn.add({
  matchId,
  turnNumber,
  yourUnitsLost,
  theirUnitsLost,
  primaryScored,
  secondaryScored,
  cpSpent,
  notes?,
  photoDataUrl,        // captured client-side, uploaded to R2
})                     → turn

turn.update({ turnId, ...fields })
```

---

## User Flow

```
Login
  → "New Match"
      → Select opponent faction (from BSData)
      → Select mission
      → (optional) Load your army list from ListBuilder

  LOOP — repeat each turn:
    → "Start Turn N"
    → Take board state photo (rear-facing camera)
    → Mark units you lost  (tap from your list or type)
    → Mark units they lost (tap from their faction units)
    → Enter primary VP scored
    → Enter secondary VP scored
    → Enter CP spent
    → (optional) Notes
    → "End Turn"

  CLOSE MATCH:
    → "End Game"
    → Enter final scores
    → Result recorded (WIN / LOSS / DRAW)
    → Full turn history with photos saved
    → Data fed back to ListBuilder rating engine
```

### Photos
One photo per turn, always stored — this is the match record. Unlike NoCheat where photos are discarded, here they are the point. Stored in Cloudflare R2 per match.

### NoCheat Integration
If dice seem suspicious mid-match:
- One tap opens a NoCheat dice check session
- On close, returns to the match in progress

---

## UI Notes

Same design tokens as the platform (slate-950 background, amber-400 accent, Geist).

Turn entry screen:
```
┌────────────────────────────────┐
│  Turn 3                        │
│  Your score: 42  Theirs: 38    │
│                                │
│  [ 📷 Board photo ]            │
│                                │
│  Your losses: Intercessors (5) │
│  Their losses: Boyz (10)       │
│                                │
│  Primary VP:  4                │
│  Secondary VP: 3               │
│  CP spent:    2                │
│                                │
│  [ End Turn ]                  │
└────────────────────────────────┘
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
    scoring/
      result.ts
      result.test.ts
    storage/
      r2.ts
      r2.test.ts
```
