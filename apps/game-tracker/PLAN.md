# PLAN.md — game-tracker

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/game-tracker/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: DB Schema ✅ complete

`matches` and `turns` tables are in `packages/db` and tested.

---

## Phase 2: Scaffold ✅ complete

`apps/game-tracker/server/` and `apps/game-tracker/client/` scaffolded.
Hono + tRPC + TypeScript. Vite + React + TypeScript. Vitest in both.

---

## Phase 3: Auth ✅ complete

`validateSession` + `protectedProcedure` wired on server. `AuthScreen` built and tested
on client (5 tests). All protected calls reject without a session.

---

## Phase 4: Match Management ✅ complete

`match.start`, `match.get`, `match.list`, `match.close` — 14 server tests passing.
`deriveResult()` pure function for WIN/LOSS/DRAW.
Match history screen built. New match form built.

---

## Phase 5: Turn Entry ✅ complete

`turn.add`, `turn.update` — 7 server tests passing.
Turn entry form: VP inputs, unit losses (comma-separated), optional notes.
Photo field accepted but stored as null until R2 is configured (Phase 6).

---

## Phase 6: Photo Storage (R2)

R2Storage interface with NullR2Storage fallback — 2 tests passing.
Actual R2 upload requires deployment configuration (Phase 9).

- [ ] Add @aws-sdk/client-s3 dependency when R2 bucket is created
- [ ] Implement R2Storage using S3-compatible API at Cloudflare R2 endpoint
- [ ] Wire upload into turn.add (currently uses NullR2Storage → null photo_url)

---

## Phase 7: Match Summary ✅ complete

`MatchSummaryView` built — shows final result, score, turn-by-turn history with units lost.

**Total: 26 server tests + 13 client tests = 39 tests.**

---

## Phase 8: Integrations

### no-cheat integration
- [ ] Add "Check Dice" shortcut mid-match — deep link to no-cheat (deferred until both live)

### new-meta + list-builder feed
- Matches with `is_tournament = 1` are visible in new-meta aggregate stats
- No additional code needed beyond the `is_tournament` flag — reads same DB via `packages/db`

---

## Phase 9: Deployment ✅ infrastructure ready (R2 pending)

- [x] Configure Cloudflare Workers for the tRPC server — `server/wrangler.toml` + `server/src/worker.ts` (uses NullR2Storage — no R2 binding yet)
- [x] Configure Cloudflare Pages for the React client — `client/wrangler.toml` + `client/functions/trpc/[[path]].ts`
- [ ] Create and configure the R2 bucket for turn photos — add `[[r2_buckets]]` binding in wrangler.toml
- [ ] Set environment variables — `wrangler secret put TURSO_DB_URL` + `wrangler secret put TURSO_AUTH_TOKEN`
- [ ] Run full end-to-end test on deployed environment

**Exit criteria:** game-tracker is live. A full match can be tracked from setup to close.

---

## Phase 10: Per-Turn Phase-Based Data Entry

Redesign BattleScreen from flat single-form-per-round to per-turn phase-based entry.

### Terminology
- A game has 5 **rounds**. Each round has 2 **turns** (one per player).
- Each turn: Command Phase → Action Phase → Photo (optional).
- DB stores one `turns` row per round (V3 per-player columns: yourX/theirX).

### Server changes
- `turn.add` extended with V3 per-player fields + stratagems array
- New `secondary` router: set, score, list, remove (uses `matchSecondaries` table)
- `match.start` accepts `twistCards`, `challengerCards`, `requirePhotos`
- `match.get` returns secondaries alongside turns

### Client changes
- MissionSetupScreen: twist/challenger/photos checkboxes
- New battle components: VpStepper, Scoreboard, StratagemPicker, UnitPicker, SecondaryPicker, PhotoCaptureScreen
- New phase screens: CommandPhaseScreen, ActionPhaseScreen, TurnFlow, RoundSummary, RoundWizard
- BattleScreen rewritten to use Scoreboard + RoundWizard
- EndGameScreen updated for per-player breakdown

### Design decisions
- One DB record per round (not per turn) — V3 yourX/theirX columns
- Movement/Shooting/Charge/Fight combined into one Action Phase screen
- Stratagems optional — picker shows IndexedDB data, free-text/skip always available
- CP carries forward: `start + gained - spent`
- Backward compatible: legacy columns still written

---

## Open After Launch

- Opponent unit browser (from BSData, for marking their losses)
- Match comparison: head-to-head history against the same faction
- Export match report as PDF or shareable link
