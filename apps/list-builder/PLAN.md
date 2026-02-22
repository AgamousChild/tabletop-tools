# PLAN.md — list-builder

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/list-builder/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema + BSDataAdapter ✅ complete

`unit_ratings`, `lists`, `list_units` tables are in `packages/db` and tested.
`GameContentAdapter` interface and `BSDataAdapter` live in `packages/game-content`.

---

## Phase 2: Scaffold

- [ ] Scaffold `apps/list-builder/server/` — Hono + tRPC + TypeScript
- [ ] Scaffold `apps/list-builder/client/` — Vite + React + TypeScript
- [ ] Wire `packages/auth`, `packages/db`, `packages/ui` into both
- [ ] Configure Vitest in both client and server
- [ ] Confirm `pnpm dev`, `pnpm test`, and `pnpm build` all work

**Exit criteria:** Blank app runs on port 3003. Tests run.

---

## Phase 3: Auth

- [ ] Mount shared Better Auth handler from `packages/auth` on the server
- [ ] Wire tRPC context to carry the authenticated user
- [ ] Add `protectedProcedure` middleware — unauthenticated calls rejected
- [ ] Build login and register UI in the client
- [ ] Test: protected call accepted with valid session, rejected without

**Exit criteria:** A user can log in and access a protected tRPC route.

---

## Phase 4: Unit Browser (BSData)

- [ ] Load `BSDataAdapter` (or `NullAdapter`) at server startup from `BSDATA_DIR`
- [ ] Implement `unit.search({ faction?, query? })` → unit[]
- [ ] Implement `unit.get(id)` → unit + rating (rating null until computed)
- [ ] Write tests for both procedures (using `NullAdapter` in test env)
- [ ] Build faction selector UI
- [ ] Build unit search + browse UI showing name, points, rating badge (S/A/B/C/D or —)

**Exit criteria:** User can browse units by faction. Rating badge shows — until ratings are computed. No GW content in repo.

---

## Phase 5: List Management

- [ ] Implement `list.create({ faction, name })` → list
- [ ] Implement `list.get(id)` → list + all units + ratings
- [ ] Implement `list.list()` → list[]
- [ ] Implement `list.addUnit({ listId, unitId, count? })` — denormalizes name + points at add-time
- [ ] Implement `list.removeUnit({ listId, unitId })`
- [ ] Implement `list.delete(id)`
- [ ] Write tests for all procedures, including points total calculation
- [ ] Build list builder UI:
  - Add/remove units
  - Live points total
  - List saved automatically

**Exit criteria:** User can create a list, add and remove units, see running points total, save and reload it.

---

## Phase 6: Rating Engine

- [ ] Write tests first — define expected outputs for known match data inputs:
  - Unit included in all winning lists → high win-rate contribution
  - Unit in losing lists → low contribution
  - Points efficiency: same win rate, fewer points = higher pts_eff
  - Meta window filter: old window data excluded from new window queries
- [ ] Implement win-rate contribution calculation (per unit, per meta window)
- [ ] Implement points efficiency calculation
- [ ] Implement letter grade assignment: S / A / B / C / D thresholds (define + test)
- [ ] Implement `computeRatings(matchData, metaWindow)` → unit_ratings[] — pure function
- [ ] Implement rating reset on meta window change (new window = null ratings until recomputed)
- [ ] Expose as server-side job triggered by data import or on-demand by admin

**Exit criteria:** Rating engine passes all tests. Pure function. Ratings computed correctly from known inputs.

---

## Phase 7: Ratings + Suggestions in UI

- [ ] Implement `rating.get(unitId)` → { rating, winContrib, ptsEff }
- [ ] Implement `rating.alternatives({ unitId, ptsRange? })` → unit[] sorted by rating
- [ ] Write tests for both procedures
- [ ] Surface rating badges on all unit cards (S/A/B/C/D, color-coded)
- [ ] Surface suggestion on add-unit:
  ```
  You added: Redemptor Dreadnought  85pts  Rating: C
  Suggestion: Brutalis Dreadnought  90pts  Rating: A
              (+5pts, significantly stronger in the current meta)
  ```
- [ ] Build unit detail view: rating, win contribution, pts efficiency breakdown

**Exit criteria:** Every unit shows its current rating. Adding a unit surfaces a suggestion if a better alternative exists at similar cost.

---

## Phase 8: Export

- [ ] Implement list export as plain text (BCP / New Recruit compatible format)
- [ ] Build export button in list view

**Exit criteria:** User can export a list as text and submit it to a tournament or BCP.

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
