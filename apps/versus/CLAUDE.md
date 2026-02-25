# CLAUDE.md — versus

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This App Is

Versus lets you pit two Warhammer 40K units against each other -- ranged or melee -- and
calculates the statistical outcome. It knows your army, knows the meta, and tells you things
you didn't know to ask.

**Port:** 3002 (server), Vite dev server proxies `/trpc` -> `:3002`

---

## Architecture

```
+------------------------------------+
|  Tier 1: React Client              |
|  - Unit selector (attacker)        |
|  - Unit selector (defender)        |
|  - Simulation result display       |
|  - tRPC client (from packages/ui)  |
+----------------+-------------------+
                 | tRPC over HTTP
+----------------v-------------------+
|  Tier 2: tRPC Server               |
|  - Unit router (from game-content) |
|  - Simulate router                 |
|  - Rules engine (modifier pipe)    |
|  - SQLite via Turso                |
|  - Base infra from server-core     |
+------------------------------------+
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.
Unit router uses `createUnitRouter()` from `@tabletop-tools/game-content`.

---

## Unit Data: BSData (via GameContentAdapter)

Unit profiles come from BSData XML loaded at server startup from the operator's local clone.
**The platform ships zero GW content.** If `BSDATA_DIR` is not set, `NullAdapter` returns
empty results.

---

## Database Schema

No `units` table. Unit data lives in memory via `GameContentAdapter`.

```typescript
// simulations  (optional -- saved results)
id                    TEXT PRIMARY KEY
user_id               TEXT NOT NULL
attacker_content_id   TEXT NOT NULL    -- content adapter ID
attacker_name         TEXT NOT NULL    -- denormalized for display
defender_content_id   TEXT NOT NULL
defender_name         TEXT NOT NULL
result                TEXT NOT NULL    -- JSON: full simulation output
created_at            INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Units (from createUnitRouter in packages/game-content)
unit.listFactions()                   -> string[]
unit.search({ faction?, query? })     -> unit[]
unit.get(id)                          -> unit

// Simulate
simulate.run({ attackerId, defenderId, modifiers? })  -> { expectedWounds, expectedModelsRemoved, ... }
simulate.save({ attackerId, defenderId, result })      -> simulationId
simulate.history()                                      -> simulation[]
```

---

## Rules Engine -- Modifier Pipeline

```typescript
type WeaponAbility =
  | { type: 'SUSTAINED_HITS'; value: number }
  | { type: 'LETHAL_HITS' }
  | { type: 'DEVASTATING_WOUNDS' }
  | { type: 'TORRENT' }
  | { type: 'TWIN_LINKED' }
  | { type: 'BLAST' }
  | { type: 'REROLL_HITS_OF_1' }
  | { type: 'REROLL_HITS' }
  | { type: 'REROLL_WOUNDS' }
  | { type: 'HIT_MOD'; value: number }
  | { type: 'WOUND_MOD'; value: number }

simulate(attacker, defender):
  -> resolveAttacks()   // flat or dice average
  -> resolveHits()      // TORRENT -> HIT_MOD -> REROLL_HITS -> SUSTAINED_HITS -> LETHAL_HITS
  -> resolveWounds()    // WOUND_MOD -> REROLL_WOUNDS -> DEVASTATING_WOUNDS
  -> resolveSaves()     // armor save -> invuln save -> FNP
  -> resolveDamage()    // flat or dice average, multi-wound tracking
```

---

## Testing

**87 tests** (61 server + 26 client), all passing.

```
server/src/
  lib/rules/
    pipeline.ts / pipeline.test.ts     <- rules engine: every weapon ability, modifier interaction
  routers/
    simulate.test.ts                   <- simulation router integration tests
server/src/server.test.ts              <- HTTP session integration tests
client/src/
  lib/
    useGameData.test.tsx               <- dual-source hook tests (IndexedDB vs tRPC fallback)
  components/
    SimulationResult.test.tsx          <- 7 tests: names, wounds, models, best/worst, save, survivors
```

The rules engine is fully unit-tested. Every weapon ability, every modifier interaction is covered.

```bash
cd apps/versus/server && pnpm test   # 61 server tests
cd apps/versus/client && pnpm test   # 26 client tests
```
