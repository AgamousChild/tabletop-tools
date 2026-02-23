# PLAN.md — list-builder

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/list-builder/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema + BSDataAdapter ✅ complete

`unit_ratings`, `lists`, `list_units` tables are in `packages/db` and tested.
`GameContentAdapter` interface and `BSDataAdapter` live in `packages/game-content`.

---

## Phase 2: Scaffold ✅ complete

`apps/list-builder/server/` and `apps/list-builder/client/` scaffolded.
Hono + tRPC + TypeScript. Vite + React + TypeScript. Vitest in both.
`packages/auth`, `packages/db`, `packages/ui`, `packages/game-content` wired.

---

## Phase 3: Auth ✅ complete

`validateSession` + `protectedProcedure` wired on server. `AuthScreen` built and tested
on client (5 tests). All protected calls reject without a session.

---

## Phase 4: Unit Browser (BSData) ✅ complete

`BSDataAdapter` / `NullAdapter` injected at server startup via `BSDATA_DIR`.
`unit.listFactions`, `unit.search`, `unit.get` — 8 server tests passing.
Faction selector + unit search UI built. Rating badge shows — until ratings computed.
No GW content in repo.

---

## Phase 5: List Management ✅ complete

`list.create`, `list.get`, `list.list`, `list.addUnit`, `list.removeUnit`, `list.delete`
— 17 server tests passing. Points total denormalized at add-time.
List builder UI: add/remove units, live points total, list selector.

---

## Phase 6: Rating Engine ✅ complete

`server/src/lib/ratings/score.ts` — pure function: `computeRatings(records, metaWindow)`.
`assignGrade(winContrib)` — S/A/B/C/D thresholds.
14 tests covering: empty input, all-wins→S, all-losses→D, 50%→B/C,
points efficiency (cheaper unit = higher ptsEff), min 3 appearances, metaWindow,
computedAt timestamp, mixed results.

---

## Phase 7: Ratings + Suggestions in UI ✅ complete

`rating.get({ unitId })` — returns rating or null — 6 server tests.
`rating.alternatives({ ptsMin?, ptsMax?, metaWindow? })` — sorted by winContrib.
Rating badges on all unit cards in list (S/A green, B/C amber, D red).
List builder screen built and tested (8 client tests).

**Total: 45 server tests + 13 client tests = 58 tests.**

---

## Phase 8: Export ✅ complete

Export as plain text (BCP / New Recruit compatible format) — button in list view.
Copies to clipboard (++ Faction [Xpts] ++ format).

---

## Phase 9: Deployment

- [ ] Configure Cloudflare Workers for the tRPC server
- [ ] Configure Cloudflare Pages for the React client
- [ ] Set environment variables (`BSDATA_DIR`, Turso connection, auth secrets)
- [ ] Confirm `NullAdapter` fallback works if `BSDATA_DIR` is not set
- [ ] Run full end-to-end test on deployed environment

**Exit criteria:** list-builder is live and accessible by URL.

---

## Open After Launch

- Admin panel for importing external tournament CSV (feeds rating engine)
- Meta window management UI (label new windows, retire old ones)
- Integration with game-tracker: native match records (is_tournament = 1) auto-feed the rating engine
