# PLAN.md — game-tracker

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/game-tracker/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema ✅ complete

`matches` and `turns` tables are in `packages/db` and tested.

---

## Phase 2: Scaffold

- [ ] Scaffold `apps/game-tracker/server/` — Hono + tRPC + TypeScript
- [ ] Scaffold `apps/game-tracker/client/` — Vite + React + TypeScript
- [ ] Wire `packages/auth`, `packages/db`, `packages/ui` into both
- [ ] Configure Vitest in both client and server
- [ ] Confirm `pnpm dev`, `pnpm test`, and `pnpm build` all work

**Exit criteria:** Blank app runs on port 3004. Tests run.

---

## Phase 3: Auth

- [ ] Mount shared Better Auth handler from `packages/auth` on the server
- [ ] Wire tRPC context to carry the authenticated user
- [ ] Add `protectedProcedure` middleware — unauthenticated calls rejected
- [ ] Build login and register UI in the client
- [ ] Test: protected call accepted with valid session, rejected without

**Exit criteria:** A user can log in and access a protected tRPC route.

---

## Phase 4: Match Management

- [ ] Implement `match.start({ opponentFaction, mission, listId? })` → match
- [ ] Implement `match.get(id)` → match + all turns
- [ ] Implement `match.list()` → match[] for current user
- [ ] Implement `match.close({ matchId, yourScore, theirScore })` → { result, yourScore, theirScore }
- [ ] Implement `deriveResult(yourScore, theirScore)` → WIN | LOSS | DRAW (pure function)
- [ ] Write tests for all procedures and `deriveResult`
- [ ] Build match setup screen:
  - Opponent faction (free text)
  - Mission name (free text)
  - Optional: load army list from list-builder (listId)
  - is_tournament toggle (feeds rating engine)
- [ ] Build match history screen

**Exit criteria:** User can start a match, close it with a result, and view match history.

---

## Phase 5: Turn Entry

- [ ] Implement `turn.add({ matchId, turnNumber, yourUnitsLost, theirUnitsLost, primaryScored, secondaryScored, cpSpent, notes?, photoDataUrl })` → turn
  - `yourUnitsLost` / `theirUnitsLost` stored as JSON `[{ contentId, name }]` — name denormalized
  - `photoDataUrl` received from client, uploaded to R2, `photo_url` stored as R2 key
- [ ] Implement `turn.update({ turnId, ...fields })`
- [ ] Write tests for both procedures (mock R2 upload in tests)
- [ ] Build turn entry screen:
  - "Start Turn N" button
  - Board state photo (rear-facing camera, captured in browser)
  - Unit loss entry: tap from list or type unit name
  - Primary VP, secondary VP, CP spent inputs
  - Optional notes field
  - "End Turn" button

**Exit criteria:** User can record a full turn including all VP, units lost, and a board photo.

---

## Phase 6: Photo Storage (R2)

- [ ] Create a Cloudflare R2 bucket for game-tracker photos
- [ ] Implement server-side R2 upload handler (receives data URL, stores to R2, returns URL)
- [ ] Wire upload into `turn.add` server procedure
- [ ] Write tests for upload path (mock R2 client)
- [ ] Build photo display in turn history (thumbnail in turn summary, full view on tap)

Note: Unlike no-cheat (where photos are discarded), every turn photo is kept — it is the match record.

**Exit criteria:** Every turn has a photo stored in R2. Photos display correctly in the match history.

---

## Phase 7: Match Summary + Score Tracking

- [ ] Build end-of-match summary screen:
  - Final score (your total VP vs theirs)
  - Win / Loss / Draw verdict
  - Full turn-by-turn history with photos
  - Units lost per turn (yours and opponent's)
- [ ] Build running score display during active match (cumulative VP after each turn)

**Exit criteria:** Full match history is readable at a glance. Final result is clear.

---

## Phase 8: Integrations

### no-cheat integration
- [ ] Add "Check Dice" shortcut mid-match — opens no-cheat session, returns on close
- [ ] (Deferred until both apps are live — wire as a deep link or shared session state)

### new-meta + list-builder feed
- [ ] Matches with `is_tournament = 1` are included in new-meta aggregate stats
- [ ] Opponent faction string becomes a faction entry in meta analytics
- [ ] Result (WIN/LOSS/DRAW) contributes to win rate calculations
- [ ] This happens automatically — no additional code needed beyond the `is_tournament` flag
  (new-meta and list-builder read from the same DB via `packages/db`)

**Exit criteria:** Tournament matches are visible in new-meta and contribute to list-builder ratings without any extra work on the user's part.

---

## Phase 9: Deployment

- [ ] Configure Cloudflare Workers for the tRPC server
- [ ] Configure Cloudflare Pages for the React client
- [ ] Create and configure the R2 bucket for turn photos
- [ ] Set environment variables (Turso connection, R2 credentials, auth secrets)
- [ ] Run full end-to-end test on deployed environment

**Exit criteria:** game-tracker is live. A full match can be tracked from setup to close with photos.

---

## Open After Launch

- Opponent unit browser (from BSData, for marking their losses)
- Match comparison: head-to-head history against the same faction
- Export match report as PDF or shareable link
