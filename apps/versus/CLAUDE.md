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
|  - Rules engine (modifier pipe)    |
|  - Simulation computed locally     |
|  - Unit data from IndexedDB        |
|  - tRPC client (from packages/ui)  |
+----------------+-------------------+
                 | tRPC over HTTP
+----------------v-------------------+
|  Tier 2: tRPC Server               |
|  - Simulate router (save/history)  |
|  - SQLite via Turso                |
|  - Base infra from server-core     |
+------------------------------------+
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.
Unit data loaded from IndexedDB via `@tabletop-tools/game-data-store` hooks.
Simulation runs client-side — the rules pipeline is pure math with no server dependencies.

---

## Features required to be considered functional

1. When a unit is loaded, the weapon profiles and the defense profile is shown.
2. Melee or Ranged as a type of attack is chosen.
3. The correct number of weapons is calculated.
4. All Ranged weapons are allowed to be used unless the unit has ranged options.
5. Only one melee profile is allowed, unless there are weapon profiles labelled extra attacks.
6. The special rules need to be addressed, allow for an array of special rules be put in place for each unit.
7. If you can use the unit information stored in the database to show those special rules, do so, but also allow the user to add them.
8. Apply the special rules correctly.
9. The data stored should include the units included, the special rules applied, and the results.
10. When saving the data, the results can be sent to the server. They are not GW IP. We can then use the unit ids and applied special rules to cache results and send them back and compare to the calculated results, or show them more quickly.
11. Allow for Leader additions to make a unit comparison more meaningful, so you can add a leader in to those units that allow leaders, mostly infantry.

## Unit Data: IndexedDB (via game-data-store)

Unit profiles come from BSData XML imported via the data-import app and stored client-side in
IndexedDB. **The platform ships zero GW content.** The server has no access to unit data —
all unit lookups happen client-side via `useGameUnit()` from `@tabletop-tools/game-data-store`.

---

## Database Schema

No `units` table. Unit data lives client-side in IndexedDB.

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
// Simulate (save/history only — simulation runs client-side)
simulate.save({ attackerId, defenderId, result })      -> simulationId
simulate.history()                                      -> simulation[]
```

Unit selection and simulation computation happen entirely client-side using IndexedDB data
and the rules pipeline in `client/src/lib/rules/pipeline.ts`.

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
  | { type: 'STRENGTH_MOD'; value: number }
  | { type: 'ATTACKS_MOD'; value: number }

simulate(attacker, defender):
  -> resolveAttacks()   // flat or dice average
  -> resolveHits()      // TORRENT -> HIT_MOD -> REROLL_HITS -> SUSTAINED_HITS -> LETHAL_HITS
  -> resolveWounds()    // WOUND_MOD -> REROLL_WOUNDS -> DEVASTATING_WOUNDS
  -> resolveSaves()     // armor save -> invuln save -> FNP
  -> resolveDamage()    // flat or dice average, multi-wound tracking
```

---

## Testing

**121 tests** (8 server + 113 client), all passing.

```
client/src/
  lib/rules/
    pipeline.ts / pipeline.test.ts     <- rules engine: every weapon ability, modifier interaction (45 tests)
  lib/
    useGameData.test.tsx               <- IndexedDB hook tests
  components/
    SimulatorScreen.test.tsx           <- 12 tests: title, attacker/defender, add weapon form, defender stats, button states, results, weapon removal, sign out, special rules, unit picker
    SimulationResult.test.tsx          <- 7 tests: names, wounds, models, best/worst, save, survivors
server/src/
  routers/
    simulate.test.ts                   <- save + history router tests
server/src/server.test.ts              <- HTTP session integration tests
```

The rules engine is fully unit-tested. Every weapon ability, every modifier interaction is covered.
The pipeline runs client-side — moved from server to client as it's pure math with zero Node.js deps.

```bash
cd apps/versus/server && pnpm test   # 8 server tests
cd apps/versus/client && pnpm test   # 113 client tests
```
