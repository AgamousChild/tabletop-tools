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
|  - simulateV2 router (save/history)|
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
// simulation  (Phase 3 — normalized saved results)
id                      TEXT PRIMARY KEY
user_id                 TEXT NOT NULL  FK → user(id) ON DELETE CASCADE
attacker_unit_id        TEXT           FK → list_unit(id) ON DELETE SET NULL (nullable)
defender_unit_id        TEXT           FK → list_unit(id) ON DELETE SET NULL (nullable)
attacker_name           TEXT NOT NULL  -- denormalized for display
defender_name           TEXT NOT NULL  -- denormalized for display
expected_wounds         REAL NOT NULL
expected_models_removed REAL NOT NULL
survivors               REAL NOT NULL
worst_wounds            REAL NOT NULL
worst_models            REAL NOT NULL
best_wounds             REAL NOT NULL
best_models             REAL NOT NULL
created_at              INTEGER NOT NULL

// simulation_weapon  (one row per weapon profile fired)
id                    TEXT PRIMARY KEY
simulation_id         TEXT NOT NULL  FK → simulation(id) ON DELETE CASCADE
profile_kind          TEXT NOT NULL  -- 'ranged' | 'melee'
weapon_name           TEXT NOT NULL
model_count           INTEGER NOT NULL
weapons_per_model     INTEGER NOT NULL
attacks_per_weapon    REAL NOT NULL  -- expected value (D6 → 3.5)
total_attacks         REAL NOT NULL  -- = model_count × weapons_per_model × attacks_per_weapon
expected_wounds       REAL NOT NULL
expected_models_removed REAL NOT NULL

// simulation_modifier  (one row per active modifier)
id              TEXT PRIMARY KEY
simulation_id   TEXT NOT NULL  FK → simulation(id) ON DELETE CASCADE
side            TEXT NOT NULL  -- 'ATTACK' | 'DEFENSE'
source          TEXT NOT NULL  -- 'weapon_ability' | 'special_rule' | 'leader'
key             TEXT NOT NULL  -- 'LETHAL_HITS', 'SUSTAINED_HITS', etc.
value           TEXT           -- JSON-stringified numeric or null for boolean flags

// simulations  (RETIRED — v1 router deleted per W2 roadmap Phase 1.2/D2-03;
// table drop deferred to a follow-up migration PR by design. No router reads
// or writes it. Use simulation/simulation_weapon/simulation_modifier instead.
// See wargame/w2/95-consolidation-roadmap.md.)
```

**Attack-count invariant:** `total_attacks = model_count × weapons_per_model × attacks_per_weapon`
enforced server-side in `apps/versus/server/src/lib/attackCount.ts` before every DB write.

---

## tRPC Routers

```typescript
// simulateV2 (Phase 3 — normalized, save writes all 3 tables in one batch)
simulateV2.save({ attackerName, defenderName, weapons, modifiers, ... }) -> { id }
simulateV2.history()     -> simulation[] with weapons[]
simulateV2.get({ id })   -> simulation with weapons[] + modifiers[]
simulateV2.delete({ id }) -> { success: true }
```

The v1 `simulate` router (JSON-blob save/history/lookup) was retired per W2 roadmap
Phase 1.2/D2-03 — zero client callers besides the cache-lookup UI, which is gone too.
See `wargame/w2/95-consolidation-roadmap.md`.

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

See each package's test files for current coverage — counts drift as tests are added; this
doc points at the suites rather than restating numbers (D2-08 policy, root CLAUDE.md).

```
client/src/
  lib/rules/
    pipeline.ts / pipeline.test.ts     <- rules engine: every weapon ability, modifier interaction, ANTI
  lib/
    modelCount.test.ts                 <- model count parsing
    useGameData.test.tsx               <- IndexedDB hook tests
  components/
    SimulatorScreen.test.tsx           <- title, attacker/defender, weapon form, stats, results, save, special rules, unit picker
    SimulationResult.test.tsx          <- names, wounds, models, best/worst, save, survivors
    UnitProfileCard.test.tsx           <- stat display, invuln, fnp
    SpecialRulesEditor.test.tsx        <- add/remove abilities
    UnitSelector.test.tsx              <- faction/unit selection
    WeaponSelector.test.tsx            <- weapon selection, attack type toggle
server/src/
  routers/
    simulateV2.test.ts                 <- normalized save/history/get/delete router tests
server/src/server.test.ts              <- HTTP session integration tests
```

The rules engine is fully unit-tested. Every weapon ability, every modifier interaction is covered.
The pipeline runs client-side — moved from server to client as it's pure math with zero Node.js deps.

```bash
cd apps/versus/server && pnpm test
cd apps/versus/client && pnpm test
```
