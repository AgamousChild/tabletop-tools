# CLAUDE.md — versus

> Read SOUL.md first. Every decision here flows from it.

---

## Current State

| Layer | Status |
|---|---|
| DB schema (simulations table) | ✅ in packages/db |
| packages/game-content BSDataAdapter | ✅ built + tested |
| Server (Hono + tRPC) | ✅ built + tested (57 tests) |
| Client (React + shadcn) | ✅ built + tested (23 tests) |
| Deployment | ✅ Deployed to tabletop-tools.net/versus/ via gateway |

BSData loading and the `GameContentAdapter` interface live in `packages/game-content`.
The rules engine is in `server/src/lib/rules/`. game-content provides unit profiles; versus provides the math.

---

## What This App Is

Versus lets you pit two Warhammer 40K units against each other — ranged or melee — and calculates the statistical outcome. It knows your army, knows the meta, and tells you things you didn't know to ask. It is not a replacement for Unit Crunch; it is a different product.

---

## Platform Context

```
tabletop-tools/
  packages/
    ui/             ← shared components, dark theme, Geist, shadcn
    auth/           ← shared Better Auth
    db/             ← shared Turso schema and Drizzle client
    game-content/   ← GameContentAdapter interface + BSDataAdapter
  apps/
    versus/         ← this app
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

## Unit Data: BSData (via GameContentAdapter)

Unit profiles come from BSData — the community-maintained 40K data files (`.cat`, `.gst` XML format). The operator clones BSData themselves and points the server at it via `BSDATA_DIR`.

**The platform ships zero GW content.** No unit data is stored in the DB or bundled in this repo.

- BSData XML loads into memory at server startup from the operator's local BSData clone
- No `units` table in the DB — routers call `ctx.gameContent.searchUnits(...)` instead
- If `BSDATA_DIR` is not set, the server uses `NullAdapter` and returns empty results gracefully
- Shared adapter pattern with `apps/list-builder` — same `GameContentAdapter` interface

```typescript
// Operator configures:
BSDATA_DIR=/path/to/bsdata-clone/wh40k-10e

// Server startup (apps/versus/server/src/index.ts):
const gameContent = process.env['BSDATA_DIR']
  ? new BSDataAdapter({ dataDir: process.env['BSDATA_DIR'] })
  : new NullAdapter()
await gameContent.load()
```

**Target system:** Warhammer 40K only.

---

## Database Schema

No `units` table. Unit data lives in memory via `GameContentAdapter`.

```typescript
// simulations  (optional — saved results)
// attacker_content_id / defender_content_id are plain TEXT — no FK into units
id                    TEXT PRIMARY KEY
user_id               TEXT NOT NULL
attacker_content_id   TEXT NOT NULL    -- content adapter ID
attacker_name         TEXT NOT NULL    -- denormalized for display
defender_content_id   TEXT NOT NULL    -- content adapter ID
defender_name         TEXT NOT NULL    -- denormalized for display
result                TEXT NOT NULL    -- JSON: full simulation output
created_at            INTEGER NOT NULL
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

See root `CLAUDE.md` — Rules for Every Session.

App-specific: **The math must be correct. Test the rules engine exhaustively.**

---

## Testing: TDD Required

Tests before code. No exceptions.

```
src/
  lib/
    rules/
      pipeline.ts
      pipeline.test.ts
```

BSData parsing lives in `packages/game-content` — do not duplicate it here.

The rules engine must be fully unit-tested. Every weapon ability, every modifier interaction — covered before it ships.

### E2E Browser Tests

Playwright E2E tests live in `e2e/specs/versus.spec.ts` (shared across the platform in `e2e/`).
These run against the deployed app in a real browser and verify:
- Auth gate works (authenticated → SimulatorScreen)
- Simulator screen loads with Versus header
- Attacker and Defender unit selectors present
- Run Simulation button present

Run: `cd e2e && BASE_URL=https://tabletop-tools.net pnpm test -- --grep versus`
