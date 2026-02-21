# CLAUDE.md — ListBuilder (Meta List Builder)

> Read SOUL.md first. Every decision here flows from it.

---

## What This App Is

ListBuilder is a smart army list builder for Warhammer 40K where every unit carries a live performance rating derived from real GT+ tournament data. As you build a list, it surfaces higher-rated alternatives at the same points cost. Ratings update as new event data comes in and reset when GW releases a new balance dataslate or codex.

---

## Platform Context

```
tabletop-tools/
  packages/
    ui/            ← shared components, dark theme, Geist, shadcn
    auth/          ← shared Better Auth
    db/            ← shared Turso schema and Drizzle client
  apps/
    listbuilder/   ← this app
```

Server port: **3003**

---

## Architecture

```
┌─────────────────────────────────┐
│  Tier 1: React Client           │
│  - Faction selector             │
│  - Unit browser + search        │
│  - List builder (add/remove)    │
│  - Rating badges + suggestions  │
│  - tRPC client (type-safe)      │
└────────────────┬────────────────┘
                 │ tRPC over HTTP
┌────────────────▼────────────────┐
│  Tier 2: tRPC Server            │
│  - Auth router                  │
│  - List router                  │
│  - Unit router (BSData)         │
│  - Rating router (BCP data)     │
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

## Data Sources

### Unit Profiles: BSData
Community-maintained 40K data files (`.cat`, `.gst` XML). Parsed and loaded into the shared Turso DB. Shared with `apps/versus` — same tables.

### Ratings: BCP (Best Coast Pairings)
- Scraped from BCP using a personal account — GT and larger events only
- GT+ filter: small events have too much skill variance to produce meaningful unit data
- Every unit is scored by win-rate contribution and points efficiency across events
- Ratings are rolling and current — updated as new GT results arrive
- Ratings reset on GW balance dataslate or codex update — old data discarded, new window starts

---

## Database Schema

```typescript
// units  (shared with apps/versus)
id          TEXT PRIMARY KEY
faction     TEXT NOT NULL
name        TEXT NOT NULL
profile     TEXT NOT NULL       -- JSON
weapons     TEXT NOT NULL       -- JSON
abilities   TEXT NOT NULL       -- JSON
points      INTEGER NOT NULL
bsdata_id   TEXT UNIQUE NOT NULL
updated_at  INTEGER NOT NULL

// unit_ratings  (derived from BCP scrape)
id           TEXT PRIMARY KEY
unit_id      TEXT NOT NULL      -- references units.id
rating       TEXT NOT NULL      -- S / A / B / C / D
win_contrib  REAL NOT NULL      -- win-rate contribution score
pts_eff      REAL NOT NULL      -- performance per point
meta_window  TEXT NOT NULL      -- e.g. "2025-Q1" — resets on dataslate
computed_at  INTEGER NOT NULL

// lists
id         TEXT PRIMARY KEY
user_id    TEXT NOT NULL
faction    TEXT NOT NULL
name       TEXT NOT NULL
total_pts  INTEGER NOT NULL
created_at INTEGER NOT NULL
updated_at INTEGER NOT NULL

// list_units
id       TEXT PRIMARY KEY
list_id  TEXT NOT NULL      -- references lists.id
unit_id  TEXT NOT NULL      -- references units.id
count    INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Units
unit.search({ faction?, query? })          → unit[]
unit.get(id)                               → unit + rating

// Ratings
rating.get(unitId)                         → { rating, winContrib, ptsEff }
rating.alternatives({ unitId, ptsRange? }) → unit[]  -- same role, sorted by rating

// Lists
list.create({ faction, name })             → list
list.get(id)                               → list + all units + ratings
list.list()                                → list[]
list.addUnit({ listId, unitId, count? })
list.removeUnit({ listId, unitId })
list.delete(id)
```

---

## Rating System

Ratings are letter grades: **S, A, B, C, D**

Computed from:
- **Win-rate contribution**: how much does including this unit correlate with winning GT events
- **Points efficiency**: performance per point spent

Suggestions surface when you add a unit:
```
You added: Redemptor Dreadnought  85pts  Rating: C+
Suggestion: Brutalis Dreadnought  90pts  Rating: A-
            (+5pts, significantly stronger in the current meta)
```

Ratings reset to null when a new balance dataslate or codex drops. The meta window label (e.g. `"2025-Q2"`) changes and the BCP scraper starts a fresh accumulation from that point.

---

## User Flow

```
Login
  → Select faction
  → Browse units with ratings visible
  → Add unit to list
    → See live points total
    → See suggestion if a higher-rated option exists at similar cost
  → Save list
  → Export (text format for BCP / tournament submission)
```

---

## UI Notes

Same design tokens as the platform (slate-950 background, amber-400 accent, Geist).

Rating badge:
```
[ A- ]  ← green for S/A, amber for B/C, red for D
```

Unit card:
```
┌─────────────────────────────────────┐
│  Brutalis Dreadnought        [ A- ] │
│  90pts  ·  Space Marines            │
│  T10  Sv2+  W12  ·  Melee          │
└─────────────────────────────────────┘
```

---

## Rules for Every Session

- Plan before touching anything — understand every layer first.
- No features that aren't needed yet.
- Ratings must be derived correctly. Test the scoring logic.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.

---

## Testing: TDD Required

Tests before code. No exceptions.

```
src/
  lib/
    ratings/
      score.ts
      score.test.ts
    bsdata/
      parser.ts
      parser.test.ts
    bcp/
      scraper.ts
      scraper.test.ts
```
