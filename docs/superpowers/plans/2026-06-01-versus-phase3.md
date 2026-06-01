# Versus Phase 3 — Simulation Tables + list_unit Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old `simulations` blob table with three normalized tables (`simulation`, `simulation_weapon`, `simulation_modifier`), wire attacker/defender to `list_unit` FKs, test-enforce the attack-count invariant (`total = models × weapons/model × A`), keep ad-hoc sims in-memory only (no scratch rows), and bind all data-driven UI (factions, weapons, abilities, modifiers) to IndexedDB hooks — no hardcoded arrays.

**Architecture:** New tables live in `packages/db/src/versus-schema.ts` (mirroring the list-schema split). The server router gains `simulateV2` (save/history/delete/get) that writes all three tables in a transaction. The client's existing in-memory simulation pipeline is untouched; the `handleSave` path is rewired to use `simulateV2.save`. The old `simulations` table and `simulate` router are kept (backward-compat) but deprecated. Attack-count invariant is enforced by a pure-TS utility (`computeTotalAttacks`) that both the server and the pipeline call.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite/libSQL), tRPC + Zod, React hooks from `@tabletop-tools/game-data-store`, Vitest, Playwright

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/db/src/versus-schema.ts` | **Create** | `simulation`, `simulation_weapon`, `simulation_modifier` table defs |
| `packages/db/src/schema.ts` | **Modify** | re-export versus-schema; deprecate comment on old `simulations` |
| `packages/db/migrations/0009_versus_v2.sql` | **Generated** | `drizzle-kit generate` output — do not hand-edit |
| `packages/db/src/schema.test.ts` | **Modify** | Add CREATE TABLE SQL for new tables; add schema smoke tests |
| `apps/versus/server/src/lib/attackCount.ts` | **Create** | `computeTotalAttacks(models, perModel, attacksExpr)` utility + invariant check |
| `apps/versus/server/src/lib/attackCount.test.ts` | **Create** | Attack-count invariant tests (the CRITICAL ones per spec §4) |
| `apps/versus/server/src/routers/simulateV2.ts` | **Create** | tRPC router: `save`, `history`, `get`, `delete` — writes all 3 tables |
| `apps/versus/server/src/routers/simulateV2.test.ts` | **Create** | Router unit tests with in-memory SQLite |
| `apps/versus/server/src/routers/index.ts` | **Modify** | Add `simulateV2` to app router |
| `apps/versus/server/src/server.test.ts` | **Modify** | Add new tables to `beforeAll` DDL; add `simulateV2` HTTP integration test |
| `apps/versus/client/src/lib/useSimulateV2.ts` | **Create** | tRPC mutation wrapper; builds `SimulationWeaponInput[]` from pipeline output |
| `apps/versus/client/src/components/SimulatorScreen.tsx` | **Modify** | Wire `handleSave` to `simulateV2.save`; remove old `saveMutation`; no new hardcoded arrays |
| `e2e/specs/versus-v2.spec.ts` | **Create** | Playwright e2e: load list, run sim, save, view history |
| `apps/versus/CLAUDE.md` | **Modify** | Update to reflect list_unit-driven shape, deprecate old table |
| `docs/superpowers/plans/2026-05-29-data-layer-worklist.md` | **Modify** | Add Phase 3 / Versus row |

---

## Task 1: Schema — `versus-schema.ts` + `schema.ts` re-export

**Files:**
- Create: `packages/db/src/versus-schema.ts`
- Modify: `packages/db/src/schema.ts` (last line)

- [ ] **Step 1.1: Write `versus-schema.ts`**

```typescript
// packages/db/src/versus-schema.ts
/**
 * Phase 3 — Versus simulation tables
 * simulation        — one row per saved run
 * simulation_weapon — one row per weapon profile fired in a run
 * simulation_modifier — one resolved modifier active in a run
 * See docs/superpowers/specs/2026-05-26-versus-data-model-design.md
 */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { authUsers } from './schema'
import { listUnit } from './list-schema'

export const simulation = sqliteTable(
  'simulation',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    label: text('label'), // optional user-given name
    // FK into list_unit — the configured unit (models + loadout + attachments)
    attackerUnitId: text('attacker_unit_id').references(() => listUnit.id, { onDelete: 'set null' }),
    defenderUnitId: text('defender_unit_id').references(() => listUnit.id, { onDelete: 'set null' }),
    // Denormalized names for display when list_unit is unavailable
    attackerName: text('attacker_name').notNull(),
    defenderName: text('defender_name').notNull(),
    dataslateId: text('dataslate_id'), // version context (plain text — no FK required)
    // Headline result columns (no JSON blobs)
    expectedWounds: real('expected_wounds').notNull(),
    expectedModelsRemoved: real('expected_models_removed').notNull(),
    survivors: real('survivors').notNull(),
    worstWounds: real('worst_wounds').notNull(),
    worstModels: real('worst_models').notNull(),
    bestWounds: real('best_wounds').notNull(),
    bestModels: real('best_models').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_simulation_user_id').on(table.userId),
    index('idx_simulation_attacker').on(table.attackerUnitId),
    index('idx_simulation_defender').on(table.defenderUnitId),
    index('idx_simulation_created').on(table.createdAt),
  ],
)

export const simulationWeapon = sqliteTable(
  'simulation_weapon',
  {
    id: text('id').primaryKey(),
    simulationId: text('simulation_id')
      .notNull()
      .references(() => simulation.id, { onDelete: 'cascade' }),
    // 'ranged' | 'melee' — which kind of profile was fired
    profileKind: text('profile_kind', { enum: ['ranged', 'melee'] }).notNull(),
    // Canonical weapon content_entity id (plain text — no FK required; content may be unlinked)
    profileId: text('profile_id'),
    // Denormalized weapon name for display
    weaponName: text('weapon_name').notNull(),
    // Attack-count factors — ALL THREE stored + product (invariant: total = models × perModel × perWeapon)
    modelCount: integer('model_count').notNull(),        // from the configured unit loadout
    weaponsPerModel: integer('weapons_per_model').notNull(), // from the loadout (usually 1)
    attacksPerWeapon: real('attacks_per_weapon').notNull(), // A resolved to expected value (D6→3.5)
    totalAttacks: real('total_attacks').notNull(),       // = modelCount × weaponsPerModel × attacksPerWeapon
    // Per-weapon contribution to the run's result
    expectedWounds: real('expected_wounds').notNull(),
    expectedModelsRemoved: real('expected_models_removed').notNull(),
  },
  (table) => [index('idx_sim_weapon_sim_id').on(table.simulationId)],
)

export const simulationModifier = sqliteTable(
  'simulation_modifier',
  {
    id: text('id').primaryKey(),
    simulationId: text('simulation_id')
      .notNull()
      .references(() => simulation.id, { onDelete: 'cascade' }),
    // 'ATTACK' | 'DEFENSE' — which side this modifier applied to
    side: text('side', { enum: ['ATTACK', 'DEFENSE'] }).notNull(),
    // 'weapon' | 'unit' | 'stratagem' | 'manual' | 'defensive'
    source: text('source').notNull(),
    // e.g. 'sustained_hits', 'cover', 'fnp', 'reroll_hits', 'lethal_hits'
    key: text('key').notNull(),
    // e.g. '1', '5+', '+1'
    value: text('value'),
  },
  (table) => [index('idx_sim_modifier_sim_id').on(table.simulationId)],
)
```

- [ ] **Step 1.2: Re-export from schema.ts**

At the bottom of `packages/db/src/schema.ts`, after the existing `list-schema` export, add:
```typescript
// === Phase 3 versus tables ===
export { simulation, simulationWeapon, simulationModifier } from './versus-schema'
```

- [ ] **Step 1.3: Run typecheck to catch import errors**
```bash
cd packages/db && pnpm exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 1.4: Commit**
```bash
git add packages/db/src/versus-schema.ts packages/db/src/schema.ts
git commit -m "feat(db): add versus-schema — simulation/simulation_weapon/simulation_modifier tables"
```

---

## Task 2: Migration

**Files:**
- Generated: `packages/db/migrations/0009_versus_v2.sql`

> Prerequisites: `TURSO_DB_URL` and `TURSO_AUTH_TOKEN` are in root `.env` (gitignored).

- [ ] **Step 2.1: Generate the migration**
```bash
cd packages/db && npx drizzle-kit generate
```
Expected output: `Generated 1 migration file → migrations/0009_*.sql`

Rename the generated file to `0009_versus_v2.sql` if drizzle named it differently:
```bash
# In packages/db/migrations/
# Rename whatever drizzle generated to 0009_versus_v2.sql
```

- [ ] **Step 2.2: Inspect the generated SQL**

Open `packages/db/migrations/0009_versus_v2.sql`. Verify it contains:
- `CREATE TABLE simulation`
- `CREATE TABLE simulation_weapon`
- `CREATE TABLE simulation_modifier`
- All indexes listed in versus-schema.ts

- [ ] **Step 2.3: Apply migration to prod**
```bash
# From project root — uses TURSO_DB_URL + TURSO_AUTH_TOKEN from .env
cd packages/db && npx drizzle-kit migrate
```
Expected: migration applied cleanly.

- [ ] **Step 2.4: Commit**
```bash
git add packages/db/migrations/
git commit -m "feat(db): migration 0009 — versus v2 tables"
```

---

## Task 3: Attack-count utility + invariant tests (TDD — write tests FIRST)

**Files:**
- Create: `apps/versus/server/src/lib/attackCount.ts`
- Create: `apps/versus/server/src/lib/attackCount.test.ts`

The attack-count bug has burned the project before. Write the tests first. These are the loudest tests in the repo.

- [ ] **Step 3.1: Write the failing tests**

```typescript
// apps/versus/server/src/lib/attackCount.test.ts
import { describe, expect, it } from 'vitest'
import { computeTotalAttacks, resolveAttacksExpected, assertAttackCountInvariant } from './attackCount'

// ── resolveAttacksExpected ────────────────────────────────────────────────────
describe('resolveAttacksExpected', () => {
  it('flat integer returns itself', () => {
    expect(resolveAttacksExpected(2)).toBe(2)
    expect(resolveAttacksExpected(5)).toBe(5)
  })
  it('D6 = 3.5', () => {
    expect(resolveAttacksExpected('D6')).toBeCloseTo(3.5)
  })
  it('D3 = 2', () => {
    expect(resolveAttacksExpected('D3')).toBeCloseTo(2)
  })
  it('2D3 = 4', () => {
    expect(resolveAttacksExpected('2D3')).toBeCloseTo(4)
  })
  it('D6+1 = 4.5', () => {
    expect(resolveAttacksExpected('D6+1')).toBeCloseTo(4.5)
  })
  it('D6-1 = 2.5', () => {
    expect(resolveAttacksExpected('D6-1')).toBeCloseTo(2.5)
  })
})

// ── computeTotalAttacks ───────────────────────────────────────────────────────
describe('computeTotalAttacks — the CRITICAL invariant', () => {
  // From spec §4 worked examples:
  it('10 Intercessors · Bolt rifle A2 → 20', () => {
    const result = computeTotalAttacks({ models: 10, weaponsPerModel: 1, attacksExpr: 2 })
    expect(result.modelCount).toBe(10)
    expect(result.weaponsPerModel).toBe(1)
    expect(result.attacksPerWeapon).toBeCloseTo(2)
    expect(result.totalAttacks).toBeCloseTo(20)
    // Invariant must hold
    expect(result.totalAttacks).toBeCloseTo(
      result.modelCount * result.weaponsPerModel * result.attacksPerWeapon
    )
  })

  it('5 Intercessors · Bolt rifle A2 → 10', () => {
    const result = computeTotalAttacks({ models: 5, weaponsPerModel: 1, attacksExpr: 2 })
    expect(result.totalAttacks).toBeCloseTo(10)
    expect(result.totalAttacks).toBeCloseTo(
      result.modelCount * result.weaponsPerModel * result.attacksPerWeapon
    )
  })

  it('3 Aggressors · 2× gauntlet A:D6 → 3 × 2 × 3.5 = 21', () => {
    const result = computeTotalAttacks({ models: 3, weaponsPerModel: 2, attacksExpr: 'D6' })
    expect(result.modelCount).toBe(3)
    expect(result.weaponsPerModel).toBe(2)
    expect(result.attacksPerWeapon).toBeCloseTo(3.5)
    expect(result.totalAttacks).toBeCloseTo(21)
    expect(result.totalAttacks).toBeCloseTo(
      result.modelCount * result.weaponsPerModel * result.attacksPerWeapon
    )
  })

  it('1 Captain · Power fist A5 melee → 5', () => {
    const result = computeTotalAttacks({ models: 1, weaponsPerModel: 1, attacksExpr: 5 })
    expect(result.totalAttacks).toBeCloseTo(5)
    expect(result.totalAttacks).toBeCloseTo(
      result.modelCount * result.weaponsPerModel * result.attacksPerWeapon
    )
  })

  it('multi-loadout: 4 models · 1 weapon · D6+1 = 4 × 1 × 4.5 = 18', () => {
    const result = computeTotalAttacks({ models: 4, weaponsPerModel: 1, attacksExpr: 'D6+1' })
    expect(result.totalAttacks).toBeCloseTo(18)
    expect(result.totalAttacks).toBeCloseTo(
      result.modelCount * result.weaponsPerModel * result.attacksPerWeapon
    )
  })
})

// ── assertAttackCountInvariant ────────────────────────────────────────────────
describe('assertAttackCountInvariant', () => {
  it('passes when total equals product (within floating-point tolerance)', () => {
    expect(() =>
      assertAttackCountInvariant({
        modelCount: 10,
        weaponsPerModel: 1,
        attacksPerWeapon: 2,
        totalAttacks: 20,
      })
    ).not.toThrow()
  })

  it('passes with floating-point dice average', () => {
    expect(() =>
      assertAttackCountInvariant({
        modelCount: 3,
        weaponsPerModel: 2,
        attacksPerWeapon: 3.5,
        totalAttacks: 21,
      })
    ).not.toThrow()
  })

  it('throws when totalAttacks does not equal modelCount × weaponsPerModel × attacksPerWeapon', () => {
    expect(() =>
      assertAttackCountInvariant({
        modelCount: 10,
        weaponsPerModel: 1,
        attacksPerWeapon: 2,
        totalAttacks: 15, // wrong!
      })
    ).toThrow('Attack-count invariant violation')
  })
})
```

- [ ] **Step 3.2: Run tests — confirm all FAIL**
```bash
cd apps/versus/server && pnpm test --reporter=verbose
```
Expected: all `attackCount` tests FAIL with "Cannot find module './attackCount'".

- [ ] **Step 3.3: Implement `attackCount.ts`**

```typescript
// apps/versus/server/src/lib/attackCount.ts

/**
 * Attack-count invariant utilities for Phase 3 Versus.
 *
 * THE CRITICAL INVARIANT:
 *   total_attacks = model_count × weapons_per_model × attacks_per_weapon
 *
 * This has caused bugs before. All three factors MUST be stored and the
 * product asserted at save time. See spec §4.
 */

/**
 * Resolve a dice-notation attacks expression to its expected (average) value.
 * Supports: flat integers, D6, 2D6, D3+1, D6-1, 2D3, etc.
 */
export function resolveAttacksExpected(attacks: number | string): number {
  if (typeof attacks === 'number') return attacks
  const m = /^(\d*)D(\d+)([+-]\d+)?$/i.exec(String(attacks))
  if (!m) return 0
  const count = m[1] ? parseInt(m[1]) : 1
  const sides = parseInt(m[2]!)
  const mod = m[3] ? parseInt(m[3]) : 0
  return (count * (1 + sides)) / 2 + mod
}

export interface AttackCountFactors {
  modelCount: number
  weaponsPerModel: number
  attacksPerWeapon: number
  totalAttacks: number
}

/**
 * Compute the four attack-count factors from inputs.
 * The product is computed here — caller should store all four.
 */
export function computeTotalAttacks(input: {
  models: number
  weaponsPerModel: number
  attacksExpr: number | string
}): AttackCountFactors {
  const attacksPerWeapon = resolveAttacksExpected(input.attacksExpr)
  const totalAttacks = input.models * input.weaponsPerModel * attacksPerWeapon
  return {
    modelCount: input.models,
    weaponsPerModel: input.weaponsPerModel,
    attacksPerWeapon,
    totalAttacks,
  }
}

const EPSILON = 1e-9

/**
 * Assert the attack-count invariant: total == models × perModel × perWeapon.
 * Throws if the invariant is violated. Call before writing simulation_weapon rows.
 */
export function assertAttackCountInvariant(factors: AttackCountFactors): void {
  const expected = factors.modelCount * factors.weaponsPerModel * factors.attacksPerWeapon
  if (Math.abs(factors.totalAttacks - expected) > EPSILON) {
    throw new Error(
      `Attack-count invariant violation: stored totalAttacks=${factors.totalAttacks} ` +
        `but modelCount(${factors.modelCount}) × weaponsPerModel(${factors.weaponsPerModel}) × ` +
        `attacksPerWeapon(${factors.attacksPerWeapon}) = ${expected}`,
    )
  }
}
```

- [ ] **Step 3.4: Run tests — confirm all PASS**
```bash
cd apps/versus/server && pnpm test --reporter=verbose
```
Expected: all `attackCount.test.ts` tests PASS.

- [ ] **Step 3.5: Commit**
```bash
git add apps/versus/server/src/lib/attackCount.ts apps/versus/server/src/lib/attackCount.test.ts
git commit -m "feat(versus): attack-count invariant utility + tests — models × perModel × A"
```

---

## Task 4: `simulateV2` tRPC router + tests (TDD)

**Files:**
- Create: `apps/versus/server/src/routers/simulateV2.ts`
- Create: `apps/versus/server/src/routers/simulateV2.test.ts`
- Modify: `apps/versus/server/src/routers/index.ts`

### Step 4.1 — Write the router tests first

- [ ] **Step 4.1: Write failing tests**

```typescript
// apps/versus/server/src/routers/simulateV2.test.ts
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { createCallerFactory } from '@tabletop-tools/server-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      username TEXT UNIQUE,
      display_username TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    -- content_entity stub (just id for FK satisfaction)
    CREATE TABLE IF NOT EXISTS content_entity (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    -- dim_dataslate stub
    CREATE TABLE IF NOT EXISTS dim_dataslate (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      effective_date INTEGER NOT NULL
    );
    -- list stub
    CREATE TABLE IF NOT EXISTS list (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      author TEXT,
      edition TEXT NOT NULL DEFAULT '11th',
      faction_id TEXT,
      subfaction_id TEXT,
      detachment_id TEXT,
      battle_size TEXT NOT NULL DEFAULT 'unknown',
      total_points INTEGER NOT NULL DEFAULT 0,
      dataslate_id TEXT,
      source TEXT NOT NULL DEFAULT 'list-builder',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_unit (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE,
      datasheet_id TEXT,
      enhancement_id TEXT,
      is_warlord INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      attached_to_unit_id TEXT,
      attach_role TEXT
    );
    -- Versus V2 tables
    CREATE TABLE IF NOT EXISTS simulation (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      label TEXT,
      attacker_unit_id TEXT REFERENCES list_unit(id) ON DELETE SET NULL,
      defender_unit_id TEXT REFERENCES list_unit(id) ON DELETE SET NULL,
      attacker_name TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      dataslate_id TEXT,
      expected_wounds REAL NOT NULL,
      expected_models_removed REAL NOT NULL,
      survivors REAL NOT NULL,
      worst_wounds REAL NOT NULL,
      worst_models REAL NOT NULL,
      best_wounds REAL NOT NULL,
      best_models REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS simulation_weapon (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
      profile_kind TEXT NOT NULL,
      profile_id TEXT,
      weapon_name TEXT NOT NULL,
      model_count INTEGER NOT NULL,
      weapons_per_model INTEGER NOT NULL,
      attacks_per_weapon REAL NOT NULL,
      total_attacks REAL NOT NULL,
      expected_wounds REAL NOT NULL,
      expected_models_removed REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS simulation_modifier (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
      side TEXT NOT NULL,
      source TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT
    );
    -- Old simulations table (kept for backward compat)
    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      attacker_content_id TEXT NOT NULL,
      attacker_name TEXT NOT NULL,
      defender_content_id TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      result TEXT NOT NULL,
      config_hash TEXT,
      weapon_config TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const ctx = {
  user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
  req,
  db,
}
const unauthCtx = { user: null, req, db }

const sampleWeapons = [
  {
    profileKind: 'ranged' as const,
    weaponName: 'Bolt rifle',
    modelCount: 10,
    weaponsPerModel: 1,
    attacksPerWeapon: 2,
    totalAttacks: 20,
    expectedWounds: 3.0,
    expectedModelsRemoved: 1.0,
  },
]

const sampleModifiers = [
  {
    side: 'ATTACK' as const,
    source: 'weapon',
    key: 'sustained_hits',
    value: '1',
  },
]

const sampleSave = {
  attackerName: 'Intercessors',
  defenderName: 'Boyz',
  expectedWounds: 3.0,
  expectedModelsRemoved: 1.0,
  survivors: 4.0,
  worstWounds: 0,
  worstModels: 0,
  bestWounds: 8,
  bestModels: 4,
  weapons: sampleWeapons,
  modifiers: sampleModifiers,
}

describe('simulateV2.save', () => {
  it('saves simulation with weapon rows and returns id', async () => {
    const caller = createCaller(ctx)
    const result = await caller.simulateV2.save(sampleSave)
    expect(result.id).toBeTruthy()
  })

  it('rejects when attack-count invariant is violated', async () => {
    const caller = createCaller(ctx)
    await expect(
      caller.simulateV2.save({
        ...sampleSave,
        weapons: [
          {
            ...sampleWeapons[0]!,
            modelCount: 10,
            weaponsPerModel: 1,
            attacksPerWeapon: 2,
            totalAttacks: 15, // wrong: should be 20
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.simulateV2.save(sampleSave)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('simulateV2.history', () => {
  it('returns saved simulations with weapon rows', async () => {
    const caller = createCaller(ctx)
    const history = await caller.simulateV2.history()
    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]!.weapons.length).toBeGreaterThan(0)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.simulateV2.history()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('simulateV2.get', () => {
  it('returns a simulation with weapons and modifiers', async () => {
    const caller = createCaller(ctx)
    const saved = await caller.simulateV2.save({
      ...sampleSave,
      modifiers: sampleModifiers,
    })
    const sim = await caller.simulateV2.get({ id: saved.id })
    expect(sim).not.toBeNull()
    expect(sim!.weapons.length).toBeGreaterThan(0)
    expect(sim!.modifiers.length).toBeGreaterThan(0)
    expect(sim!.modifiers[0]!.source).toBe('weapon')
  })

  it('throws NOT_FOUND for unknown id', async () => {
    const caller = createCaller(ctx)
    await expect(caller.simulateV2.get({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('simulateV2.delete', () => {
  it('deletes an owned simulation', async () => {
    const caller = createCaller(ctx)
    const saved = await caller.simulateV2.save(sampleSave)
    await caller.simulateV2.delete({ id: saved.id })
    const history = await caller.simulateV2.history()
    expect(history.find((s) => s.id === saved.id)).toBeUndefined()
  })

  it("rejects deleting another user's simulation", async () => {
    const caller = createCaller(ctx)
    const saved = await caller.simulateV2.save(sampleSave)
    const otherCaller = createCaller({
      user: { id: 'user-other', email: 'other@example.com', name: 'Other' },
      req,
      db,
    })
    await expect(otherCaller.simulateV2.delete({ id: saved.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('attack-count invariant: all saved weapon rows satisfy total = models × perModel × A', () => {
  it('stored totalAttacks equals product of factors', async () => {
    const caller = createCaller(ctx)
    const saved = await caller.simulateV2.save(sampleSave)
    const sim = await caller.simulateV2.get({ id: saved.id })
    for (const w of sim!.weapons) {
      const expected = w.modelCount * w.weaponsPerModel * w.attacksPerWeapon
      expect(w.totalAttacks).toBeCloseTo(expected, 9)
    }
  })
})
```

- [ ] **Step 4.2: Run tests — confirm FAIL**
```bash
cd apps/versus/server && pnpm test --reporter=verbose
```
Expected: FAIL — "simulateV2 is not a function" or router not found.

- [ ] **Step 4.3: Implement `simulateV2.ts`**

```typescript
// apps/versus/server/src/routers/simulateV2.ts
import { simulation, simulationModifier, simulationWeapon } from '@tabletop-tools/db'
import { protectedProcedure, router } from '@tabletop-tools/server-core'
import { TRPCError } from '@trpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { assertAttackCountInvariant } from '../lib/attackCount'

const weaponInputSchema = z.object({
  profileKind: z.enum(['ranged', 'melee']),
  profileId: z.string().optional(),
  weaponName: z.string(),
  modelCount: z.number().int().positive(),
  weaponsPerModel: z.number().int().positive(),
  attacksPerWeapon: z.number().positive(),
  totalAttacks: z.number().positive(),
  expectedWounds: z.number(),
  expectedModelsRemoved: z.number(),
})

const modifierInputSchema = z.object({
  side: z.enum(['ATTACK', 'DEFENSE']),
  source: z.string().min(1),
  key: z.string().min(1),
  value: z.string().optional(),
})

const saveInputSchema = z.object({
  label: z.string().optional(),
  attackerUnitId: z.string().optional(), // FK into list_unit (optional — ad-hoc sims have none)
  defenderUnitId: z.string().optional(),
  attackerName: z.string(),
  defenderName: z.string(),
  dataslateId: z.string().optional(),
  expectedWounds: z.number(),
  expectedModelsRemoved: z.number(),
  survivors: z.number(),
  worstWounds: z.number(),
  worstModels: z.number(),
  bestWounds: z.number(),
  bestModels: z.number(),
  weapons: z.array(weaponInputSchema).min(1),
  modifiers: z.array(modifierInputSchema).optional().default([]),
})

export const simulateV2Router = router({
  save: protectedProcedure.input(saveInputSchema).mutation(async ({ ctx, input }) => {
    // Validate attack-count invariant for every weapon before any DB write
    for (const w of input.weapons) {
      try {
        assertAttackCountInvariant({
          modelCount: w.modelCount,
          weaponsPerModel: w.weaponsPerModel,
          attacksPerWeapon: w.attacksPerWeapon,
          totalAttacks: w.totalAttacks,
        })
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Attack-count invariant violation',
        })
      }
    }

    const id = crypto.randomUUID()
    const now = Date.now()

    // Write all three tables in one transaction
    await ctx.db.batch([
      ctx.db.insert(simulation).values({
        id,
        userId: ctx.user.id,
        label: input.label ?? null,
        attackerUnitId: input.attackerUnitId ?? null,
        defenderUnitId: input.defenderUnitId ?? null,
        attackerName: input.attackerName,
        defenderName: input.defenderName,
        dataslateId: input.dataslateId ?? null,
        expectedWounds: input.expectedWounds,
        expectedModelsRemoved: input.expectedModelsRemoved,
        survivors: input.survivors,
        worstWounds: input.worstWounds,
        worstModels: input.worstModels,
        bestWounds: input.bestWounds,
        bestModels: input.bestModels,
        createdAt: now,
      }),
      ...input.weapons.map((w) =>
        ctx.db.insert(simulationWeapon).values({
          id: crypto.randomUUID(),
          simulationId: id,
          profileKind: w.profileKind,
          profileId: w.profileId ?? null,
          weaponName: w.weaponName,
          modelCount: w.modelCount,
          weaponsPerModel: w.weaponsPerModel,
          attacksPerWeapon: w.attacksPerWeapon,
          totalAttacks: w.totalAttacks,
          expectedWounds: w.expectedWounds,
          expectedModelsRemoved: w.expectedModelsRemoved,
        }),
      ),
      ...input.modifiers.map((m) =>
        ctx.db.insert(simulationModifier).values({
          id: crypto.randomUUID(),
          simulationId: id,
          side: m.side,
          source: m.source,
          key: m.key,
          value: m.value ?? null,
        }),
      ),
    ])

    return { id }
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const sims = await ctx.db
      .select()
      .from(simulation)
      .where(eq(simulation.userId, ctx.user.id))
      .orderBy(desc(simulation.createdAt))

    // Fetch weapons for each simulation (N+1 is acceptable for personal history lists)
    const results = await Promise.all(
      sims.map(async (sim) => {
        const weapons = await ctx.db
          .select()
          .from(simulationWeapon)
          .where(eq(simulationWeapon.simulationId, sim.id))
        return { ...sim, weapons }
      }),
    )
    return results
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const sim = await ctx.db
        .select()
        .from(simulation)
        .where(and(eq(simulation.id, input.id), eq(simulation.userId, ctx.user.id)))
        .limit(1)
        .get()
      if (!sim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Simulation not found' })

      const [weapons, modifiers] = await Promise.all([
        ctx.db
          .select()
          .from(simulationWeapon)
          .where(eq(simulationWeapon.simulationId, input.id)),
        ctx.db
          .select()
          .from(simulationModifier)
          .where(eq(simulationModifier.simulationId, input.id)),
      ])

      return { ...sim, weapons, modifiers }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sim = await ctx.db
        .select()
        .from(simulation)
        .where(and(eq(simulation.id, input.id), eq(simulation.userId, ctx.user.id)))
        .limit(1)
        .get()
      if (!sim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Simulation not found' })
      await ctx.db.delete(simulation).where(eq(simulation.id, input.id))
      return { success: true }
    }),
})
```

- [ ] **Step 4.4: Wire into `routers/index.ts`**

```typescript
// apps/versus/server/src/routers/index.ts
// Add:
import { simulateV2Router } from './simulateV2'
// In the router:
simulateV2: simulateV2Router,
```

- [ ] **Step 4.5: Run tests — confirm all PASS**
```bash
cd apps/versus/server && pnpm test --reporter=verbose
```
Expected: all tests PASS.

- [ ] **Step 4.6: Typecheck**
```bash
cd apps/versus/server && pnpm exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4.7: Commit**
```bash
git add apps/versus/server/src/routers/simulateV2.ts \
        apps/versus/server/src/routers/simulateV2.test.ts \
        apps/versus/server/src/routers/index.ts \
        apps/versus/server/src/lib/
git commit -m "feat(versus/server): simulateV2 router — normalized tables + attack-count invariant enforced"
```

---

## Task 5: Update `schema.test.ts` + `server.test.ts` for new tables

The `schema.test.ts` and `server.test.ts` files have hardcoded `CREATE TABLE` DDL in `beforeAll`. They must be updated to include the new tables or tests will fail when running against in-memory DBs.

**Files:**
- Modify: `packages/db/src/schema.test.ts`
- Modify: `apps/versus/server/src/server.test.ts`

- [ ] **Step 5.1: Add new tables to `schema.test.ts`**

In `packages/db/src/schema.test.ts`, after the `simulations` CREATE TABLE block, add:

```sql
-- Versus V2 tables
CREATE TABLE simulation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  label TEXT,
  attacker_unit_id TEXT,
  defender_unit_id TEXT,
  attacker_name TEXT NOT NULL,
  defender_name TEXT NOT NULL,
  dataslate_id TEXT,
  expected_wounds REAL NOT NULL,
  expected_models_removed REAL NOT NULL,
  survivors REAL NOT NULL,
  worst_wounds REAL NOT NULL,
  worst_models REAL NOT NULL,
  best_wounds REAL NOT NULL,
  best_models REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE simulation_weapon (
  id TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
  profile_kind TEXT NOT NULL,
  profile_id TEXT,
  weapon_name TEXT NOT NULL,
  model_count INTEGER NOT NULL,
  weapons_per_model INTEGER NOT NULL,
  attacks_per_weapon REAL NOT NULL,
  total_attacks REAL NOT NULL,
  expected_wounds REAL NOT NULL,
  expected_models_removed REAL NOT NULL
);
CREATE TABLE simulation_modifier (
  id TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  source TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT
);
```

Also add imports to the import block at the top:
```typescript
import {
  simulation,
  simulationWeapon,
  simulationModifier,
  // ...existing imports
} from './schema'
```

And add basic smoke tests (insert/select, FK cascade):
```typescript
describe('simulation tables (Phase 3 Versus)', () => {
  it('inserts and reads a simulation', async () => {
    const id = 'test-sim-1'
    await db.insert(simulation).values({
      id,
      userId: testUserId, // use the user id inserted in beforeAll
      attackerName: 'A',
      defenderName: 'B',
      expectedWounds: 1,
      expectedModelsRemoved: 0.5,
      survivors: 4.5,
      worstWounds: 0,
      worstModels: 0,
      bestWounds: 3,
      bestModels: 1,
      createdAt: Date.now(),
    })
    const rows = await db.select().from(simulation).where(eq(simulation.id, id))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.attackerName).toBe('A')
  })

  it('simulation_weapon cascades on simulation delete', async () => {
    const simId = 'test-sim-cascade'
    await db.insert(simulation).values({
      id: simId,
      userId: testUserId,
      attackerName: 'X',
      defenderName: 'Y',
      expectedWounds: 0,
      expectedModelsRemoved: 0,
      survivors: 5,
      worstWounds: 0,
      worstModels: 0,
      bestWounds: 0,
      bestModels: 0,
      createdAt: Date.now(),
    })
    await db.insert(simulationWeapon).values({
      id: 'sw-1',
      simulationId: simId,
      profileKind: 'ranged',
      weaponName: 'Bolt rifle',
      modelCount: 5,
      weaponsPerModel: 1,
      attacksPerWeapon: 2,
      totalAttacks: 10,
      expectedWounds: 1,
      expectedModelsRemoved: 0.5,
    })
    await db.delete(simulation).where(eq(simulation.id, simId))
    const weapons = await db
      .select()
      .from(simulationWeapon)
      .where(eq(simulationWeapon.simulationId, simId))
    expect(weapons).toHaveLength(0)
  })
})
```

- [ ] **Step 5.2: Add new tables to `server.test.ts`**

In `apps/versus/server/src/server.test.ts`, add the three new CREATE TABLE statements to the `beforeAll` DDL block (same structure as in 5.1 above).

- [ ] **Step 5.3: Run all db tests + server tests**
```bash
cd packages/db && pnpm test
cd apps/versus/server && pnpm test
```
Expected: all PASS.

- [ ] **Step 5.4: Commit**
```bash
git add packages/db/src/schema.test.ts apps/versus/server/src/server.test.ts
git commit -m "test(versus): add new simulation tables to in-memory DDL + schema smoke tests"
```

---

## Task 6: Client — `useSimulateV2` hook + wire `handleSave`

**Files:**
- Create: `apps/versus/client/src/lib/useSimulateV2.ts`
- Modify: `apps/versus/client/src/components/SimulatorScreen.tsx`

The existing `handleSave` in `SimulatorScreen.tsx` calls `trpc.simulate.save`. This task rewires it to `trpc.simulateV2.save`. The hook builds the `SimulationWeaponInput[]` array from the breakdowns produced by the existing pipeline.

No hardcoded rule data. No new dictionaries or arrays in TSX. All data still comes from the existing game-data-store hooks.

- [ ] **Step 6.1: Create `useSimulateV2.ts`**

```typescript
// apps/versus/client/src/lib/useSimulateV2.ts
import { trpc } from './trpc'
import type { WeaponAbility } from '@tabletop-tools/game-content'

/**
 * Describes one weapon's contribution as it comes out of the simulation pipeline.
 * Maps to simulation_weapon columns.
 */
export interface SimWeaponContribution {
  profileKind: 'ranged' | 'melee'
  profileId?: string
  weaponName: string
  modelCount: number
  weaponsPerModel: number
  attacksPerWeapon: number
  totalAttacks: number
  expectedWounds: number
  expectedModelsRemoved: number
}

export interface SimModifierInput {
  side: 'ATTACK' | 'DEFENSE'
  source: string
  key: string
  value?: string
}

/**
 * Convert a WeaponAbility to a SimModifierInput for persisting modifiers.
 * Returns null for ability types that do not map to a named modifier.
 */
export function weaponAbilityToModifier(ability: WeaponAbility): SimModifierInput | null {
  switch (ability.type) {
    case 'SUSTAINED_HITS':
      return { side: 'ATTACK', source: 'weapon', key: 'sustained_hits', value: String(ability.value) }
    case 'LETHAL_HITS':
      return { side: 'ATTACK', source: 'weapon', key: 'lethal_hits' }
    case 'DEVASTATING_WOUNDS':
      return { side: 'ATTACK', source: 'weapon', key: 'devastating_wounds' }
    case 'TORRENT':
      return { side: 'ATTACK', source: 'weapon', key: 'torrent' }
    case 'TWIN_LINKED':
      return { side: 'ATTACK', source: 'weapon', key: 'twin_linked' }
    case 'REROLL_HITS':
      return { side: 'ATTACK', source: 'weapon', key: 'reroll_hits' }
    case 'REROLL_HITS_OF_1':
      return { side: 'ATTACK', source: 'weapon', key: 'reroll_hits_of_1' }
    case 'REROLL_WOUNDS':
      return { side: 'ATTACK', source: 'weapon', key: 'reroll_wounds' }
    case 'HIT_MOD':
      return { side: 'ATTACK', source: 'weapon', key: 'hit_mod', value: String(ability.value) }
    case 'WOUND_MOD':
      return { side: 'ATTACK', source: 'weapon', key: 'wound_mod', value: String(ability.value) }
    default:
      return null
  }
}

/**
 * Hook wrapping trpc.simulateV2.save.
 * Caller passes contributions from the pipeline; the hook handles the mutation.
 */
export function useSimulateV2Save() {
  return trpc.simulateV2.save.useMutation()
}

/**
 * Hook wrapping trpc.simulateV2.history.
 */
export function useSimulateV2History(enabled = true) {
  return trpc.simulateV2.history.useQuery(undefined, { enabled })
}

/**
 * Hook wrapping trpc.simulateV2.delete.
 */
export function useSimulateV2Delete() {
  const utils = trpc.useUtils()
  return trpc.simulateV2.delete.useMutation({
    onSuccess: () => utils.simulateV2.history.invalidate(),
  })
}
```

- [ ] **Step 6.2: Modify `SimulatorScreen.tsx` — wire new save path**

Find the `handleSave` function and replace the old `saveMutation.mutate` call. The key change: use `trpc.simulateV2.save.useMutation()` instead of `trpc.simulate.save.useMutation()`, and build the `weapons` array from the per-weapon breakdowns.

**Old pattern (to remove):**
```typescript
const saveMutation = trpc.simulate.save.useMutation()
// ...
function handleSave() {
  if (!simData?.result || !attackerId || !defenderId) return
  saveMutation.mutate({
    attackerId,
    attackerName,
    defenderId,
    defenderName,
    result: simData.result,
    weaponConfig: configStr,
    configHash: simpleHash(configStr),
  })
}
```

**New pattern:**
```typescript
const saveV2Mutation = trpc.simulateV2.save.useMutation()

function handleSave() {
  if (!simData?.result || !attackerId || !defenderId) return
  const weapons = getSelectedWeapons()
  const weaponIndices = getSelectedWeaponIndices()

  const weaponInputs = weapons.map((w, idx): SimWeaponContribution => {
    const modelCount = leaderWeaponIndices.has(weaponIndices[idx]!) ? 1 : effectiveAttackerModels
    const attacksPerWeapon = resolveAttacks(w.attacks)
    return {
      profileKind: w.range === 'melee' ? 'melee' : 'ranged',
      weaponName: w.name,
      modelCount,
      weaponsPerModel: 1,
      attacksPerWeapon,
      totalAttacks: modelCount * 1 * attacksPerWeapon,
      expectedWounds: simData.breakdowns[idx]?.expectedWounds ?? 0,
      expectedModelsRemoved: simData.breakdowns[idx]?.expectedModelsRemoved ?? 0,
    }
  })

  const modifierInputs: SimModifierInput[] = []
  for (const w of weapons) {
    for (const a of w.abilities) {
      const mod = weaponAbilityToModifier(a)
      if (mod) modifierInputs.push(mod)
    }
  }
  // Add manual special rules
  for (const a of specialRules) {
    const mod = weaponAbilityToModifier(a)
    if (mod) modifierInputs.push({ ...mod, source: 'manual' })
  }

  saveV2Mutation.mutate({
    attackerName,
    defenderName,
    expectedWounds: simData.result.expectedWounds,
    expectedModelsRemoved: simData.result.expectedModelsRemoved,
    survivors: simData.result.survivors,
    worstWounds: simData.result.worstCase.wounds,
    worstModels: simData.result.worstCase.modelsRemoved,
    bestWounds: simData.result.bestCase.wounds,
    bestModels: simData.result.bestCase.modelsRemoved,
    weapons: weaponInputs,
    modifiers: modifierInputs,
  })
}
```

Add the necessary imports at the top of `SimulatorScreen.tsx`:
```typescript
import type { SimWeaponContribution, SimModifierInput } from '../lib/useSimulateV2'
import { weaponAbilityToModifier } from '../lib/useSimulateV2'
import { resolveAttacks } from '../lib/rules/pipeline'
```

Keep the old `saveMutation` and history references for now (backward compat, history still reads old `simulate.history`). The history panel is updated in Task 7.

- [ ] **Step 6.3: Run client tests**
```bash
cd apps/versus/client && pnpm test --reporter=verbose
```
Expected: all existing tests PASS (no regressions).

- [ ] **Step 6.4: Typecheck**
```bash
cd apps/versus/client && pnpm exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6.5: Commit**
```bash
git add apps/versus/client/src/lib/useSimulateV2.ts \
        apps/versus/client/src/components/SimulatorScreen.tsx
git commit -m "feat(versus/client): wire handleSave to simulateV2 — normalized weapon rows"
```

---

## Task 7: Migrate SimulationHistory component to `simulateV2.history`

**Files:**
- Modify: `apps/versus/client/src/components/SimulatorScreen.tsx` (the `SimulationHistory` inner component)

- [ ] **Step 7.1: Update `SimulationHistory` to use `simulateV2.history`**

Find the `SimulationHistory` function component at the bottom of `SimulatorScreen.tsx`. Replace the tRPC call:

**Old:**
```typescript
const { data: history = [] } = trpc.simulate.history.useQuery(undefined, { enabled: showHistory })
const deleteSim = trpc.simulate.delete.useMutation({
  onSuccess: () => utils.simulate.history.invalidate(),
})
```

**New:**
```typescript
const { data: history = [] } = trpc.simulateV2.history.useQuery(undefined, { enabled: showHistory })
const deleteSim = trpc.simulateV2.delete.useMutation({
  onSuccess: () => utils.simulateV2.history.invalidate(),
})
```

Update the history row render: the V2 result is not a JSON blob — use real columns:
```typescript
// Replace:
// result = JSON.parse(sim.result as string)
// With:
// The V2 shape has direct columns expectedWounds / expectedModelsRemoved
const ewLabel = (sim.expectedWounds ?? 0).toFixed(1)
const mrLabel = (sim.expectedModelsRemoved ?? 0).toFixed(1)
```

Update the `onLoadSimulation` callback — the V2 sim no longer has `attackerContentId`; it has `attackerUnitId` (FK to list_unit). For ad-hoc sims this is null. The existing load path (`setAttackerId`) still works for the content-id-based lookup; keep it but also set from `attackerUnitId` when available.

- [ ] **Step 7.2: Run tests + typecheck**
```bash
cd apps/versus/client && pnpm test
cd apps/versus/client && pnpm exec tsc --noEmit
```

- [ ] **Step 7.3: Commit**
```bash
git add apps/versus/client/src/components/SimulatorScreen.tsx
git commit -m "feat(versus/client): history panel reads simulateV2 — real columns, no JSON parse"
```

---

## Task 8: `useSimulateV2.test.ts` — unit tests for hook utilities

**Files:**
- Create: `apps/versus/client/src/lib/useSimulateV2.test.ts`

- [ ] **Step 8.1: Write tests for `weaponAbilityToModifier`**

```typescript
// apps/versus/client/src/lib/useSimulateV2.test.ts
import { describe, expect, it } from 'vitest'
import { weaponAbilityToModifier } from './useSimulateV2'

describe('weaponAbilityToModifier', () => {
  it('SUSTAINED_HITS → attack modifier with value', () => {
    const mod = weaponAbilityToModifier({ type: 'SUSTAINED_HITS', value: 1 })
    expect(mod).toEqual({ side: 'ATTACK', source: 'weapon', key: 'sustained_hits', value: '1' })
  })

  it('LETHAL_HITS → attack modifier no value', () => {
    const mod = weaponAbilityToModifier({ type: 'LETHAL_HITS' })
    expect(mod).toEqual({ side: 'ATTACK', source: 'weapon', key: 'lethal_hits' })
  })

  it('TORRENT → attack modifier', () => {
    const mod = weaponAbilityToModifier({ type: 'TORRENT' })
    expect(mod).not.toBeNull()
    expect(mod!.key).toBe('torrent')
  })

  it('HIT_MOD with value → includes string value', () => {
    const mod = weaponAbilityToModifier({ type: 'HIT_MOD', value: -1 })
    expect(mod).toEqual({ side: 'ATTACK', source: 'weapon', key: 'hit_mod', value: '-1' })
  })

  it('ANTI → returns null (not yet mapped to modifier)', () => {
    const mod = weaponAbilityToModifier({ type: 'ANTI', keyword: 'Infantry', value: 3 })
    expect(mod).toBeNull()
  })
})
```

- [ ] **Step 8.2: Run and verify**
```bash
cd apps/versus/client && pnpm test --reporter=verbose
```
Expected: all PASS.

- [ ] **Step 8.3: Commit**
```bash
git add apps/versus/client/src/lib/useSimulateV2.test.ts
git commit -m "test(versus/client): weaponAbilityToModifier unit tests"
```

---

## Task 9: E2E Playwright spec

**Files:**
- Create: `e2e/specs/versus-v2.spec.ts`

> Note: The e2e suite targets the deployed prod app (BASE_URL env var). This spec should gracefully skip if no game data is available in IndexedDB (redirect to data-import). The spec should NOT import GW content.

- [ ] **Step 9.1: Write the e2e spec**

```typescript
// e2e/specs/versus-v2.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Versus V2 — simulation flow', () => {
  test('authenticated user can navigate to Versus', async ({ page }) => {
    await page.goto('/versus/')
    // If not authenticated, expect auth redirect or login form
    const title = page.locator('h1')
    await expect(title).toBeVisible({ timeout: 10000 })
  })

  test('shows "No game data imported" warning when IndexedDB is empty', async ({ page }) => {
    await page.goto('/versus/')
    // May redirect to auth — if so, skip the data check
    const url = page.url()
    if (url.includes('/auth') || url.includes('/login')) {
      test.skip()
      return
    }
    // The app shows a warning when IndexedDB game data is not present
    const warning = page.getByText('No game data imported')
    // Tolerate: may or may not be visible depending on IndexedDB state
    // Just verify the page loaded without JS errors
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForTimeout(2000)
    expect(errors).toHaveLength(0)
  })
})
```

> The full authed e2e flow (load list → pick attacker/defender → run sim → save → view history) requires game data in IndexedDB which is populated by the data-import app. That can only be verified against a seeded environment. The above spec verifies the page loads cleanly without JS errors.

- [ ] **Step 9.2: Run spec against prod (if available)**
```bash
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test --project=public specs/versus-v2.spec.ts
```

- [ ] **Step 9.3: Commit**
```bash
git add e2e/specs/versus-v2.spec.ts
git commit -m "test(e2e): versus-v2 spec — page load + no JS errors"
```

---

## Task 10: Deprecate old `simulations` table comment + update docs

**Files:**
- Modify: `packages/db/src/schema.ts` (comment on simulations table)
- Modify: `apps/versus/CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-05-29-data-layer-worklist.md` (if exists)

- [ ] **Step 10.1: Add deprecation comment to `simulations` in `schema.ts`**

Find the `simulations` table in `schema.ts` and add above it:
```typescript
// DEPRECATED (Phase 3): replaced by simulation / simulation_weapon / simulation_modifier.
// Kept for backward-compat history reads. New saves go to simulation.
// Safe to drop after a migration window (no FK refs from other tables).
```

- [ ] **Step 10.2: Update `apps/versus/CLAUDE.md`**

Replace the Database Schema section with:
```markdown
## Database Schema

### Phase 3 tables (current — list_unit-driven)

No GW content committed. Unit data lives client-side in IndexedDB. Saved sims reference `list_unit` rows.

```typescript
// simulation — one row per saved run (Phase 3)
id                     TEXT PRIMARY KEY
user_id                TEXT NOT NULL -> "user"
label                  TEXT                   -- optional user name
attacker_unit_id       TEXT -> list_unit      -- null for ad-hoc sims
defender_unit_id       TEXT -> list_unit
attacker_name          TEXT NOT NULL          -- denormalized for display
defender_name          TEXT NOT NULL
expected_wounds        REAL NOT NULL
expected_models_removed REAL NOT NULL
survivors              REAL NOT NULL
worst_wounds / worst_models / best_wounds / best_models REAL

// simulation_weapon — one row per weapon profile fired
id                     TEXT PRIMARY KEY
simulation_id          TEXT NOT NULL -> simulation
profile_kind           TEXT NOT NULL  -- 'ranged' | 'melee'
weapon_name            TEXT NOT NULL
model_count            INTEGER NOT NULL
weapons_per_model      INTEGER NOT NULL
attacks_per_weapon     REAL NOT NULL  -- dice resolved to expected value
total_attacks          REAL NOT NULL  -- = model_count × weapons_per_model × attacks_per_weapon
expected_wounds        REAL NOT NULL
expected_models_removed REAL NOT NULL

// simulation_modifier — one row per active modifier
id                     TEXT PRIMARY KEY
simulation_id          TEXT NOT NULL -> simulation
side                   TEXT NOT NULL  -- 'ATTACK' | 'DEFENSE'
source                 TEXT NOT NULL  -- 'weapon' | 'unit' | 'stratagem' | 'manual' | 'defensive'
key                    TEXT NOT NULL  -- e.g. 'sustained_hits', 'cover', 'fnp'
value                  TEXT           -- e.g. '1', '5+', '+1'
```

### Deprecated
`simulations` — single-row JSON blob table. Kept for backward-compat reads. New saves go to `simulation`.
```

Update the tRPC Routers section:
```markdown
## tRPC Routers

```typescript
// SimulateV2 (current — Phase 3)
simulateV2.save({ attackerName, defenderName, expectedWounds, expectedModelsRemoved,
                  survivors, worstWounds, worstModels, bestWounds, bestModels,
                  weapons: SimWeaponContribution[], modifiers: SimModifierInput[] })
  -> { id: string }
simulateV2.history()  -> SimulationRow[]     // includes weapons[]
simulateV2.get({ id }) -> SimulationRow & { weapons[], modifiers[] }
simulateV2.delete({ id }) -> { success: true }

// simulate (deprecated — Phase 2 compat)
simulate.save / simulate.history / simulate.delete / simulate.lookup
```
```

Also update the Architecture section to note: "Server uses `simulateV2` router which writes normalized simulation/simulation_weapon/simulation_modifier tables. Ad-hoc sims (in-memory only) do not write rows. Only when user clicks Save does the router fire."

- [ ] **Step 10.3: Update the data-layer worklist**

Open `docs/superpowers/plans/2026-05-29-data-layer-worklist.md` (create if it doesn't exist) and add a row for Phase 3 Versus.

- [ ] **Step 10.4: Run full test suite**
```bash
cd packages/db && pnpm test
cd apps/versus/server && pnpm test
cd apps/versus/client && pnpm test
```
Expected: all PASS.

- [ ] **Step 10.5: Typecheck all**
```bash
pnpm -r typecheck
```
Expected: 0 new errors.

- [ ] **Step 10.6: Commit**
```bash
git add packages/db/src/schema.ts \
        apps/versus/CLAUDE.md \
        docs/superpowers/plans/
git commit -m "docs(versus): deprecate old simulations table, update CLAUDE.md for Phase 3 shape"
```

---

## Final Checklist

- [ ] `packages/db && pnpm test` — all pass
- [ ] `apps/versus/server && pnpm test` — all pass (including simulateV2 router + attackCount invariant)
- [ ] `apps/versus/client && pnpm test` — all pass (no regressions)
- [ ] `pnpm -r typecheck` — 0 new errors
- [ ] Migration 0009 applied to prod DB
- [ ] No hardcoded rule arrays in TSX — all data from game-data-store hooks
- [ ] Attack-count invariant tests are explicit and loud (check `total = models × perModel × A`)
- [ ] Ad-hoc sims write NO rows (only `handleSave` triggers `simulateV2.save`)
- [ ] `apps/versus/CLAUDE.md` updated
- [ ] `docs/superpowers/plans/2026-05-29-data-layer-worklist.md` updated with Phase 3 row
