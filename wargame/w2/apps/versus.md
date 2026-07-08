# versus — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day. Tests were RUN (50 server + 201 client,
> all passing).

## Purpose

Pick attacker/defender units, configure weapons + special rules, compute
expected/best/worst outcomes plus Monte Carlo damage distribution; optionally
save runs for history (`CLAUDE.md:9-13`).

## Architecture

- **Engine is 100% client-side**: `client/src/lib/rules/pipeline.ts` (760
  lines) — closed-form math (`resolveAttacks/Hits/Wounds/Saves`,
  `simulateWeapon`) plus a from-scratch Monte Carlo engine (default 5000
  iterations, `pipeline.ts:257-641`). **`runMonteCarlo` is invoked
  synchronously from a click handler** (`SimulatorScreen.tsx:511-524`) on
  the browser main thread — no Web Worker, no yielding.
- Server: Hono + tRPC via server-core (dev :3002; Worker
  `worker.ts:1-22`). Server never runs the pipeline — it only re-derives and
  asserts the attack-count invariant before persisting
  (`lib/attackCount.ts:1-87`).
- Unit/weapon data: client IndexedDB via `game-data-store`
  (`useGameData.ts:1-150`); server has zero unit-data access.

## Data model

Shared `packages/db/src/versus-schema.ts:1-89`:
- `simulation` (:13-48) — discrete columns, no JSON; FKs to `list_unit`
  (SET NULL) and users (cascade).
- `simulation_weapon` (:50-73) — attack-count invariant factors as columns.
- `simulation_modifier` (:75-88) — `value` nullable scalar (ANTI stores a
  small JSON stringify; bounded exception).
- **Legacy `simulations`** (`schema.ts:188-189`, deprecated) — full
  JSON-blob `result` column, still written by the deprecated router.
- **Rule 6 concern:** `client/src/lib/leaderAbilities.ts:18-64` — hardcoded
  English regex patterns mapping leader-ability text → `WeaponAbility`
  (rules interpretation as code heuristics).

## API surface

`health`; `simulateV2.save/history/get/delete` (save batches sim + weapons +
modifiers via `ctx.db.batch`, re-asserts invariant, `simulateV2.ts:67-180`);
deprecated `simulate.save/history/delete/lookup` (JSON blob + configHash
cache) still mounted. No crons/queues.

## Deploy

- Worker `tabletop-tools-versus` (`wrangler.toml:1-7`); secrets not yet set
  per PLAN.md:64. Client Pages script exists but **no client wrangler.toml /
  functions proxy on disk** despite PLAN.md:63 checking them off.
- **Rule 9: not a Worker risk** — heavy compute lives in the browser. The
  equivalent risk is **client main-thread jank**: 5000 iterations × weapons ×
  per-model rolls, synchronous, unbatched.

## Shared-package usage

Server: auth, db, server-core. Client: game-content (**type-only** now —
adapters no longer used server-side, per that package's own docs),
game-data-store, ui.

**Rule 3 violation:** dice-notation average math implemented twice —
`attackCount.ts:26-47` (server) vs `pipeline.ts:9-17` (client), different
regexes, independently maintained.

## CLAUDE.md drift

1. **Test counts badly stale:** claims 137 (8 server + 129 client); actual
   **251** (50 server across 4 files + 201 client across 11;
   pipeline.test.ts alone = 79).
2. PLAN.md Phase 7 `[x]` client deploy artifacts — don't exist.
3. `packages/db/CLAUDE.md` lists versus owning 1 table; actual 4 (3 current
   + 1 deprecated).
4. Architecture diagram otherwise accurate.

## Health signals

- 251 tests all passing (run during census); pipeline coverage strong (every
  WeaponAbility variant, both engines, Precision/Lone-Op mechanics).
- **Two parallel rules implementations in one file** — closed-form
  `simulateWeapon` (:674-692) and `runMonteCarlo` (:527-540) duplicate
  per-ability logic near-identically; drift risk when an ability changes in
  one path only.
- Legacy router/table doubles the persisted-write surface. No TODO/FIXME.

## Candidate design decision points

1. **Engine placement** — client-only (pure, private, free) vs server-side
   (cacheable across users for identical configs; CLAUDE.md Feature 10
   already hints at caching).
2. **Monte Carlo vs closed-form as source of truth** — derive/validate MC
   from the closed-form path instead of hand-duplicating ability logic.
3. **Main-thread MC cost** — Web Worker or chunked/yielded execution before
   unit/weapon counts grow.
4. **Special-rule coverage model** — regex heuristics
   (`leaderAbilities.ts`) vs structured datastore-backed rule registry
   (Rule 6; aligns with W1's versus finding that abilities are a closed
   24-variant typed union).
5. **Retire the legacy `simulate` router + table** — V2 has parity.
6. **Shared dice-math utility** (Rule 3) for the duplicated D-notation
   parsing.
