# CLAUDE.md — Versus (Combat Simulator)

> Read SOUL.md first. Every decision here flows from it.

---

## What This App Is

Versus lets you pit two Warhammer 40K units against each other — ranged or melee — and calculates the statistical outcome. It knows your army, knows the meta, and tells you things you didn't know to ask. It is not a replacement for Unit Crunch; it is a different product.

---

## Platform Context

```
tabletop-tools/
  packages/
    ui/       ← shared components, dark theme, Geist, shadcn
    auth/     ← shared Better Auth
    db/       ← shared Turso schema and Drizzle client
  apps/
    versus/   ← this app
```

Server port: **3002**

---

## Architecture

```
┌─────────────────────────────────┐
│  Tier 1: React Client           │
│  - Unit selector (attacker)     │
│  - Unit selector (defender)     │
│  - Simulation result display    │
│  - tRPC client (type-safe)      │
└────────────────┬────────────────┘
                 │ tRPC over HTTP
┌────────────────▼────────────────┐
│  Tier 2: tRPC Server            │
│  - Auth router                  │
│  - Simulate router              │
│  - BSData unit loader           │
│  - Rules engine (modifier pipe) │
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

## Unit Data: BSData

Unit profiles come from BSData — the community-maintained 40K data files (`.cat`, `.gst` XML format). These are the same files BattleScribe used before GW shut it down.

- Parse XML → transform to JSON → load into shared Turso DB
- Covers all factions, units, weapons, and abilities
- Sync periodically as new codexes and balance dataslates release
- Shared with `apps/listbuilder` — same DB tables

**Target system:** Warhammer 40K only.

---

## Database Schema

```typescript
// units  (populated from BSData sync, shared with listbuilder)
id          TEXT PRIMARY KEY
faction     TEXT NOT NULL       -- e.g. "Space Marines"
name        TEXT NOT NULL       -- e.g. "Brutalis Dreadnought"
profile     TEXT NOT NULL       -- JSON: { M, T, Sv, W, Ld, OC }
weapons     TEXT NOT NULL       -- JSON array of weapon profiles
abilities   TEXT NOT NULL       -- JSON array of ability strings
points      INTEGER NOT NULL
bsdata_id   TEXT UNIQUE NOT NULL
updated_at  INTEGER NOT NULL

// simulations  (optional — saved results)
id            TEXT PRIMARY KEY
user_id       TEXT NOT NULL
attacker_id   TEXT NOT NULL    -- references units.id
defender_id   TEXT NOT NULL    -- references units.id
result        TEXT NOT NULL    -- JSON: full simulation output
created_at    INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Units
unit.search({ faction?, query? })     → unit[]
unit.get(id)                          → unit

// Simulate
simulate.run({ attackerId, defenderId, modifiers? })
  → {
      expectedWounds: number
      expectedModelsRemoved: number
      survivors: number
      distribution: { wounds: number; probability: number }[]
      worstCase: { wounds: number; modelsRemoved: number }
      bestCase:  { wounds: number; modelsRemoved: number }
    }

simulate.save({ attackerId, defenderId, result })  → simulationId
simulate.history()                                  → simulation[]
```

---

## Rules Engine — Modifier Pipeline

```typescript
type WeaponAbility =
  | { type: 'SUSTAINED_HITS'; value: number }   // extra hits on unmodified 6 to hit
  | { type: 'LETHAL_HITS' }                     // auto-wound on unmodified 6 to hit
  | { type: 'DEVASTATING_WOUNDS' }              // mortal wound on unmodified 6 to wound
  | { type: 'TORRENT' }                         // auto-hit, skip hit roll
  | { type: 'TWIN_LINKED' }                     // re-roll failed wound rolls
  | { type: 'BLAST' }                           // minimum 3 hits vs 6+ model units
  | { type: 'REROLL_HITS_OF_1' }
  | { type: 'REROLL_HITS' }
  | { type: 'REROLL_WOUNDS' }
  | { type: 'HIT_MOD'; value: number }
  | { type: 'WOUND_MOD'; value: number }

simulate(attacker, defender):
  → resolveAttacks()   // flat or dice average
  → resolveHits()      // TORRENT → HIT_MOD → REROLL_HITS → SUSTAINED_HITS → LETHAL_HITS
  → resolveWounds()    // WOUND_MOD → REROLL_WOUNDS → DEVASTATING_WOUNDS
  → resolveSaves()     // armor save → invuln save → FNP
  → resolveDamage()    // flat or dice average, multi-wound tracking
```

Rules sourced from BSData XML and mapped to typed ability objects. Free-text abilities require manual mapping — known ongoing effort.

---

## How It Differs from Unit Crunch

| | Unit Crunch | Versus |
|---|---|---|
| Unit stats | Manual entry | Auto-loaded from BSData |
| Special rules | Manual entry | Auto-loaded from BSData |
| Army context | None | Lives inside your list |
| Rule updates | Whatever you typed | Syncs with BSData automatically |
| Meta context | None | GT win rates surfaced alongside math |

---

## User Flow

```
Login
  → Search / browse units by faction
  → Select attacker
  → Select defender
  → Run simulation
  → View:
      Expected wounds: 4.2
      Expected models removed: 1.4
      Distribution graph
      Best case / worst case
  → (optional) Save result
```

No manual stat entry. No typing numbers. Select units, see math.

---

## UI Notes

Same design tokens as the platform (slate-950 background, amber-400 accent, Geist).

Result display is data-forward:
```
┌──────────────────────────────────┐
│  Brutalis Dreadnought            │  ← attacker
│    vs                            │
│  Terminators (5 models)          │  ← defender
│                                  │
│  Expected wounds:        4.2     │
│  Expected models removed: 1.4    │
│                                  │
│  Best case:   7 wounds / 2 dead  │
│  Worst case:  1 wound  / 0 dead  │
│                                  │
│  [Distribution chart]            │
└──────────────────────────────────┘
```

---

## Rules for Every Session

- Plan before touching anything — understand every layer first.
- No features that aren't needed yet.
- The math must be correct. Test the rules engine exhaustively.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.

---

## Testing: TDD Required

Tests before code. No exceptions.

```
src/
  lib/
    rules/
      pipeline.ts
      pipeline.test.ts
    bsdata/
      parser.ts
      parser.test.ts
```

The rules engine must be fully unit-tested. Every weapon ability, every modifier interaction — covered before it ships.
