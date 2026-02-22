# PLAN.md — versus

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/versus/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema + BSDataAdapter ✅ complete

`simulations` table in `packages/db`. `GameContentAdapter` interface and `BSDataAdapter`
live in `packages/game-content` and are fully tested.

---

## Phase 2: Scaffold

- [ ] Scaffold `apps/versus/server/` — Hono + tRPC + TypeScript
- [ ] Scaffold `apps/versus/client/` — Vite + React + TypeScript
- [ ] Wire `packages/auth`, `packages/db`, `packages/ui` into both
- [ ] Configure Vitest in both client and server
- [ ] Confirm `pnpm dev`, `pnpm test`, and `pnpm build` all work

**Exit criteria:** Blank app runs on port 3002. Tests run.

---

## Phase 3: Auth

- [ ] Mount shared Better Auth handler from `packages/auth` on the server
- [ ] Wire tRPC context to carry the authenticated user
- [ ] Add `protectedProcedure` middleware — unauthenticated calls rejected
- [ ] Build login and register UI in the client (shared from `packages/ui` if available)
- [ ] Test: protected call accepted with valid session, rejected without

**Exit criteria:** A user can log in and access a protected tRPC route.

---

## Phase 4: Unit Browser (BSData)

- [ ] Load `BSDataAdapter` (or `NullAdapter`) at server startup from `BSDATA_DIR`
- [ ] Implement `unit.search({ faction?, query? })` → unit[]
- [ ] Implement `unit.get(id)` → unit
- [ ] Write tests for both procedures (using `NullAdapter` in test env)
- [ ] Build faction selector UI
- [ ] Build unit search + browse UI with faction filter

**Exit criteria:** User can search and browse units by faction. No GW content in repo.

---

## Phase 5: Rules Engine

This is the core of Versus. Must be fully tested before `simulate.run` calls it.

- [ ] Write tests first — define expected outputs for known attacker/defender combos:
  - Basic attack sequence (no special rules) → known expected wounds
  - SUSTAINED_HITS → extra hits on 6 to hit
  - LETHAL_HITS → auto-wound on 6 to hit
  - DEVASTATING_WOUNDS → mortal wound on 6 to wound
  - TORRENT → skip hit roll entirely
  - TWIN_LINKED → re-roll failed wound rolls
  - BLAST → minimum 3 hits vs 6+ model units
  - REROLL_HITS / REROLL_HITS_OF_1 / REROLL_WOUNDS
  - HIT_MOD / WOUND_MOD
- [ ] Implement `resolveAttacks()` — flat or dice average
- [ ] Implement `resolveHits()` — applies hit modifiers in pipeline order
- [ ] Implement `resolveWounds()` — applies wound modifiers in pipeline order
- [ ] Implement `resolveSaves()` — armor save → invuln save → Feel No Pain
- [ ] Implement `resolveDamage()` — flat or dice average, multi-wound model tracking
- [ ] Compose into `simulate(attacker, defender)` → full result object
- [ ] Map BSData XML ability strings to typed `WeaponAbility` objects (manual mapping as needed)

**Exit criteria:** Rules engine passes all tests. Every weapon ability covered. Pure function, no DB dependency.

---

## Phase 6: Simulate Endpoint + UI

- [ ] Implement `simulate.run({ attackerId, defenderId, modifiers? })` → result
- [ ] Write tests for the endpoint (mocked unit loader, known inputs)
- [ ] Build simulation UI:
  - Attacker selector → search and pick a unit
  - Defender selector → search and pick a unit
  - "Run Simulation" button
  - Result display: expected wounds, models removed, best/worst case, distribution chart

**Exit criteria:** User selects two units, runs simulation, sees full result breakdown.

---

## Phase 7: Save & History

- [ ] Implement `simulate.save({ attackerId, defenderId, result })` → simulationId
- [ ] Implement `simulate.history()` → simulation[]
- [ ] Write tests for both procedures
- [ ] Build saved simulations list UI

**Exit criteria:** User can save a simulation result and review past simulations.

---

## Phase 8: Deployment

- [ ] Configure Cloudflare Workers for the tRPC server
- [ ] Configure Cloudflare Pages for the React client
- [ ] Set environment variables (`BSDATA_DIR`, Turso connection, auth secrets)
- [ ] Confirm `NullAdapter` fallback works if `BSDATA_DIR` is not set
- [ ] Run full end-to-end test on deployed environment

**Exit criteria:** Versus is live and accessible by URL.

---

## Open After Launch

- Probability distribution graph (histogram of wound outcomes)
- Army context mode: simulate within the context of a saved list (from list-builder)
- Meta rating surfaced alongside math (GT win rates from new-meta)
