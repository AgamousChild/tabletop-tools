# game-tracker — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

Live match companion: track 40K games turn-by-turn (setup → mission →
pregame → battle rounds → end-game), storing results to feed tournament/meta
ratings (`CLAUDE.md:9-11`).

## Architecture

- Server: Hono + tRPC on server-core. Dev `server/src/index.ts:9-22` (port
  3004); Worker `worker.ts:21-33` (R2 storage if `PHOTOS_BUCKET` bound, else
  `NullR2Storage`). Routers: `health`, `match`, `matchV2`, `mission`, `turn`,
  `secondary` (`routers/index.ts:8-15`).
- Client: React/Vite; screen flow `GameTrackerScreen.tsx` (267 lines) →
  MatchSetup → MissionSetup → Pregame → Battle → EndGame. Battle sub-flow in
  `components/battle/` incl. **`RoundEditor.tsx` — undocumented in
  CLAUDE.md** (has its own test). Mission scoring widgets are data-driven per
  `uiPattern` column (CountScorer, ChecklistScorer, TierScorer, ActionScorer,
  ZonedCountScorer).
- Client imports `AppRouter` type via relative path across the app boundary
  (`client/src/lib/trpc.ts:1-13`).

## Data model

`packages/db/CLAUDE.md` says game-tracker owns 2 tables; **actual is ~19**:

- Legacy/V3: `matches` (`schema.ts:286-325`; JSON cols `twist_cards`,
  `challenger_cards`), `turns` (`schema.ts:327-365`; 4 JSON unit-list cols),
  `matchSecondaries` (JSON `vp_per_round`), `stratagemLog`.
- Mission catalog (data-driven — good): `scoringMission`, `gameState`,
  `missionGameState` (`schema.ts:1389-1433`).
- V2 relational (`match-schema.ts:11-261`, migration 0011): 15 tables —
  `deployment`, `deploymentObjective`, `terrainLayout`, `missionCard`,
  `matchV2`, `matchPlayer`, `matchPlayerPrimaryOption`, `battleRound`,
  `roundPlayer`, `scoreEvent`, `gameStateEvent`, `matchSecondaryV2`,
  `unitCasualty`, `unitState`, `stratagemUse`.
- Rule 6 minor: `EMPTY_FALLBACK_TERRAIN = ['Layout 1'…]`
  (`MissionSetupScreen.tsx:8`) — explicit fallback only.

## API surface

tRPC only, no crons/queues. `match.start/startFromPairing/list/get/delete/
close` (`startFromPairing` cross-reads tournament tables directly,
`match.ts:81-154`; `delete` soft-hides tournament matches via `hiddenAt`,
hard-deletes casual). `matchV2.start/get/addRound/scoreRound/close`.
`mission.*` (public, data-driven). `turn.add/update` (3 photo upload paths).
`secondary.set/score/list/remove`.

## Deploy

- Worker `tabletop-tools-game-tracker`; no `[limits]`; **no `[[r2_buckets]]`
  binding** — deployed Worker falls back to `NullR2Storage`
  (`worker.ts:28-30`): **uploaded photos are silently discarded in prod
  today** (`r2.ts:44-50`).
- Client: `wrangler pages deploy dist` script, but **no client wrangler.toml
  or functions/ proxy exists** despite CLAUDE.md:44 + PLAN.md:78 claiming
  them ([x]-checked).
- Rule 9: low — `turn.add` does ≤3 sequential R2 uploads + small loop.

## Shared-package usage

`server-core`, `db`, `auth` (tests), `ui`, `game-data-store` (useList,
useStratagems, useDetachments, usePrimaryFactions, useMissions). Intra-app
duplication: `generateId()` reimplemented in both `match.ts:17-19` and
`matchV2.ts:8-10` — same pattern likely duplicated across other apps'
routers (shared-util candidate).

## CLAUDE.md drift

1. **matchV2 API shape wrong**: documented `start`/`scoreRound` inputs
   (`CLAUDE.md:267-278`) don't match code — actual `start` takes faction/
   detachment/pairing/requirePhotos/paintScoring and returns
   `{matchId, yourPlayerId, opponentPlayerId}`; `scoreRound` takes
   `{roundPlayerId, scoringMissionId, vp}`, no primary/secondary/cp split
   (`matchV2.ts:13-28,145-152`).
2. **`match_player` schema mismatch**: doc says `user_id`/`is_you`/
   `display_name`; actual (`match-schema.ts:75-102`) has seat, listId,
   faction, detachment, isAttacker, goesFirst, battleReady, paintScore,
   final VPs — no user_id/display_name.
3. **`round_player` mismatch**: doc puts VP on it; actual only cpGained/
   cpSpent — VP lives in `score_event`.
4. **`score_event` mismatch**: doc lists 9 columns; actual 3
   (`roundPlayerId`, `scoringMissionId`, `vp`).
5. **Pages deploy artifacts claimed done, don't exist** (above).
6. `packages/db/CLAUDE.md` 2-table ownership claim vs 19 actual.
7. `RoundEditor` undocumented; "251 tests" total understated.

## Health signals

- 32 test files (8 server, 24 client). Zero TODO/FIXME — open work tracked
  in PLAN.md checkboxes, but some "[x] done" items aren't done (drift #5).
- Ownership checks consistent (`eq(matches.userId, ctx.user.id)` +
  TRPCError). No unguarded router gaps found.
- **Photo-loss gap**: `turn.add` accepts uploads unconditionally; NullR2
  no-ops in prod — users think photos saved; they aren't.

## Candidate design decision points

1. **V1 vs V2 match model coexistence** — both live in the router surface;
   V2 docs already wrong; decide sunset or explicit legacy status.
2. **Where VP lives** — V2 append-only `score_event` log is auditable but
   `matchV2.get` returns raw events with no rollup; server-side aggregation?
3. **R2 photo readiness** — wire the bucket, or gate/warn the photo feature
   until Phase 6 completes; `requirePhotos` at a tournament would silently
   lose evidence today.
4. **Cross-app read coupling** — `startFromPairing` reads 4 tournament
   tables inline; a shared `getPairingContext()` query helper would decouple
   schema shape changes.
5. **Shared ID-generation util** (Rule 3).
6. **Client deploy architecture** — Pages Functions proxy (claimed, absent)
   vs direct Worker URL + CORS in server-core.
