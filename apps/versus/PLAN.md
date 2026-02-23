# PLAN.md — versus

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/versus/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema + BSDataAdapter ✅ complete

`simulations` table in `packages/db`. `GameContentAdapter` interface and `BSDataAdapter`
live in `packages/game-content` and are fully tested.

---

## Phase 2: Scaffold ✅ complete

`apps/versus/server/` and `apps/versus/client/` scaffolded. Hono + tRPC + Vitest + Tailwind
wired. Tests run. Port 3002.

---

## Phase 3: Auth ✅ complete

`validateSession` + `protectedProcedure` wired on server. `AuthScreen` built and tested
on client (4 tests). All protected calls reject without a session.

---

## Phase 4: Unit Browser (BSData) ✅ complete

`BSDataAdapter` / `NullAdapter` injected at server startup via `BSDATA_DIR`.
`unit.listFactions`, `unit.search`, `unit.get` — 9 server tests passing.
`UnitSelector` component — 8 client tests passing. No GW content in repo.

---

## Phase 5: Rules Engine ✅ complete

`server/src/lib/rules/pipeline.ts` — full 40K modifier pipeline. 39 tests covering:
resolveAttacks (dice notation), woundTarget (S vs T table), resolveHits (TORRENT,
LETHAL_HITS, SUSTAINED_HITS, REROLL_HITS, REROLL_HITS_OF_1, HIT_MOD), resolveWounds
(WOUND_MOD, REROLL_WOUNDS, TWIN_LINKED, DEVASTATING_WOUNDS), effectiveSave (AP + invuln),
resolveSaves (FNP), simulateWeapon (end-to-end), BLAST.
Pure function, no DB dependency.

---

## Phase 6: Simulate Endpoint + UI ✅ complete

`simulate.run`, `simulate.save`, `simulate.history` — 9 server tests passing.
`SimulationResult` component (5 tests), `SimulatorScreen` (6 tests) built.
Full flow: select attacker → select defender → run → see expected wounds / models
removed / best+worst case → save result.

**Total: 57 server tests + 23 client tests = 80 tests.**

---

## Phase 7: Deployment

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
