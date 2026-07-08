# game-tracker — W2 Phase C per-app design verdict

> Grounded 2026-07-06 in this worktree (`C:\R\wargame-docs`) against
> [`../apps/game-tracker.md`](../apps/game-tracker.md) (Phase A census) and
> [`../decisions/D2-03-legacy-retirement-policy.md`](../decisions/D2-03-legacy-retirement-policy.md),
> [`D2-06-silent-failure-policy.md`](../decisions/D2-06-silent-failure-policy.md),
> [`D2-07-shared-utility-consolidation.md`](../decisions/D2-07-shared-utility-consolidation.md),
> [`D2-08-doc-drift-strategy.md`](../decisions/D2-08-doc-drift-strategy.md)
> (Phase B, cross-app). Re-verified directly against
> `apps/game-tracker/server/src/routers/{match,matchV2,turn}.ts`,
> `apps/game-tracker/server/src/worker.ts`,
> `apps/game-tracker/server/wrangler.toml`, and
> `apps/game-tracker/server/src/lib/storage/r2.ts` in this pass — no claim
> below is carried over from the census unread. Non-LLM scope throughout.

## 1. Verdict

**Refactor, not redesign.** game-tracker's live feature (v1 `match`/`turn`)
works, is well-tested (32 files), and has clean ownership checks. But the app
is carrying a half-built second construction (`matchV2`'s 15-table relational
model, zero client callers) alongside a live data-loss bug (photos silently
discarded) and docs that describe a `matchV2` API that doesn't match its own
code. This is not "ship v2 and retire v1" — Phase B (D2-03) already verified
v2 has no client, so there is no cutover to perform. It is "stop the bleeding
on v1, decide whether v2 is worth finishing, and stop the duplicate-ID/
doc-drift small stuff from being invisible tax on every future PR here."

## 2. App-local decision points wargamed

### (a) Finish V2 client to parity, or double down on V1 incrementally?

**Forces.** `matchV2`'s schema (`match-schema.ts:11-261`, migration 0011) is
a genuinely better shape than v1: `scoreEvent` is an append-only VP log
(`roundPlayerId`, `scoringMissionId`, `vp` — `matchV2.ts:145-166`) instead of
v1's mutable `turns.primaryScored`/`secondaryScored` columns
(`match.ts` via `turn.ts:130-195`, `update` overwrites in place). v1's
`matches`/`turns`/`matchSecondaries` tables have 6+ JSON blob columns
(`twist_cards`, `challenger_cards`, 4 unit-list columns, `vp_per_round`) —
exactly the anti-pattern root CLAUDE.md Rule 6 forbids, and they feed
tournament/meta rating ingestion per the census purpose statement
(`game-tracker.md:8-10`). But D2-03's grep (re-confirmed here: zero
`matchV2` hits anywhere in `client/src`) found v2 is pre-adoption
construction — no screen calls `addRound`, `scoreRound`, or even `matchV2.get`.
Its own documented API shape is wrong versus its actual implementation
(census drift #1, D2-08 catalogs this as a doc-drift instance too) — a sign
v2's shape was still moving after the docs were written, not that adoption
stalled after the shape stabilized.

**Options:**

| Option | What it means | Fit | Effort | Risk | Stack | Weighted |
|---|---|---|---|---|---|---|
| A — Build V2 client to parity, then flip | New Setup→Battle→EndGame flow against `matchV2`, migrate existing `matches` rows, retire v1 | 5 | 2 | 3 | 4 | 3.5 |
| B — Enhance V1 incrementally, park V2 | Keep JSON-blob model, add fields as needed, freeze V2 as documented-but-unbuilt | 3 | 5 | 4 | 3 | 3.6 |
| C — Hybrid: V2 for new features only | New capabilities (e.g., a real VP audit trail feature) land on V2 tables via a thin adapter; existing flow stays V1 | 3 | 3 | 2 | 3 | 2.7 |

Weights: Effort ×2 (this app has one active user, no external deprecation
pressure, per D2-03's "single-user/hobby reality today" framing — a full
V2 client rebuild is real weeks of work for zero currently-blocked need),
Risk ×2 (two live data models drifting further apart is the exact Rule 1
violation D2-03 names), Fit ×1, Stack ×1.

**Recommendation: B (enhance V1 incrementally), with V2 explicitly frozen,
not abandoned.** V1 is the only thing that works; a Setup→Battle→EndGame
client rebuild against 15 unfamiliar tables is a multi-week bet with no
forcing function today. The `score_event` audit-trail value is real but not
urgent — v1's mutable-column model has shipped 32 test files' worth of
confidence and feeds tournament/meta today without an audit-trail complaint
on record. **Fallback: A**, triggered per D2-03's own flip condition — "once
`matchV2` has an actual client screen and its documented API-shape drift is
fixed." If Micah decides the append-only score log is worth building toward
(e.g., because a future meta-analytics feature needs per-scoring-phase
granularity v1's flat columns can't give it), that's the trigger to open a
dedicated V2-client work item, not a background migration. Hybrid (C) is
rejected outright: running two live data models for the same match
concurrently is worse than either extreme — it's Rule 1 violated on
purpose, for both new and existing matches at once.

### (b) Server-side VP rollups on `matchV2.get`

**Forces.** Moot under the (a) recommendation *for now* — `matchV2.get` has
no caller. But it's worth deciding on paper so a future V2-client effort
doesn't re-litigate it. Verified: `matchV2.get` (`matchV2.ts:71-109`) does 1
+ N + M queries (match, then per-round `roundPlayer` fetch, then per-round-
player `scoreEvent` fetch, all via `Promise.all`) and returns raw
`{match, players, rounds, roundPlayers, scoreEvents}` with zero aggregation
— every consumer would need to sum `scoreEvents` by `roundPlayerId` client-
side to get a VP total.

**Options:** (i) leave raw, client aggregates; (ii) add a rollup query
(`SUM(vp) GROUP BY roundPlayerId`, or a running total per match) inside
`matchV2.get`; (iii) both — raw events for audit/undo UI, a rollup field
alongside for the scoreboard.

**Recommendation: (iii), when V2 client work starts** — the audit-trail
value only pays off if a UI can show the log; the same UI also needs "what's
the score right now" without hand-rolling a reduce in every screen that
displays it. This is a small addition (one more query or one `SUM`
aggregation in the same handler) relative to building the client screens at
all, so it should ship in the same PR as whichever V2 screen first needs a
scoreboard — not deferred as a separate follow-up that risks being forgotten
the way the V2 API-shape docs were.

### (c) Cross-app pairing coupling (`startFromPairing`)

**Forces.** Verified `match.ts:81-154`: `startFromPairing` reads `pairings`,
`tournamentPlayers` (twice — player1 and player2), `rounds`, and
`tournaments` directly, inline, in a single tRPC handler — 4 tournament-
owned tables imported straight into game-tracker's router
(`import { ... pairings, rounds, tournamentPlayers, tournaments } from
'@tabletop-tools/db'`, line 1-9). This is a real cross-app schema coupling:
any change to tournament's pairing/round/player shape breaks game-tracker's
build with no compiler boundary warning beyond "some other app's import
changed," and it's a second, independent instance of the same shape D2-07
flags for `generateId` — logic (here, a *query*, not a function) repeated
inline rather than shared.

**Options:**

| Option | What it means | Effort | Risk | Recurrence-prevention |
|---|---|---|---|---|
| A — Status quo | Leave the 4-table inline read | 5 (free) | 2 | 1 |
| B — Shared `getPairingContext(pairingId, userId)` helper | One function (in `server-core` or a new tournament-facing query module) returning `{me, opponent, tournament}`, used by game-tracker and any future cross-app pairing consumer | 3 | 4 | 4 |

**Recommendation: B, but scoped small and deferred behind (a)/photo-fix.**
This is exactly the kind of extraction D2-07 already validates the shape
of (shared logic across an app boundary belongs in a shared package, not
copy-pasted) — the difference here is it's a *query composition*, not a
pure function, so it likely belongs next to `server-core`'s existing
`createWorkerHandler`-style helpers or as a new small module explicitly
owned by whichever package already brokers tournament reads for other
apps (check `new-meta`'s pattern before inventing a second one — do not
build this blind). Low urgency: `startFromPairing` works today and has
test coverage; this is a maintainability/coupling fix, not a bug. Do it
opportunistically, not as blocking work.

### (d) R2 photo wiring — Track 1 urgent per D2-06

**Forces.** This is the one item in this doc that is not a design debate.
Verified directly: `server/wrangler.toml` has **no `[[r2_buckets]]` block
and no `PHOTOS_BUCKET` reference at all** (full file re-read this pass, 7
lines total — name, main, compatibility_date, compatibility_flags, a
comment about DB secrets, nothing else). `worker.ts:12-18` types
`PHOTOS_BUCKET` as optional on `Env`; `worker.ts:26-29` falls back to
`createNullR2Storage()` whenever it's undefined — which is always, today,
in the deployed Worker. `r2.ts`'s `createNullR2Storage().upload()`
(lines 44-49) does `return null` with **zero logging, zero warning** — the
most silent of any storage fallback D2-06 catalogs across the six affected
apps (no-cheat's equivalent at least does a `console.warn`). `turn.ts:66-81`
calls `ctx.storage.upload()` for up to 3 photo fields (`photoDataUrl`,
`yourPhotoDataUrl`, `theirPhotoDataUrl`) unconditionally, stores whatever
comes back (`null` in prod) as the `photo*Url` column, and returns a normal
success response. A user with `requirePhotos: true` set on a tournament
match believes their evidence photo is attached; it is not, and nothing
in the response schema or the client would ever tell them.

**Options:** (i) bind the bucket in `wrangler.toml` + provision an R2
bucket + set `PHOTOS_BUCKET`; (ii) gate the feature — make `turn.add`
reject photo uploads with a clear error when storage is null, rather than
silently accepting and discarding; (iii) both, sequenced.

**Recommendation: (iii) — bind the bucket now; add the reject-on-null
guard regardless, as defense in depth.** D2-06 already scoped this as
Track 1, ship-now, ahead of any shared `NullStorage`-throws-by-default
helper landing platform-wide — don't wait on that generalized fix. Binding
the bucket is the real fix (photos actually save); the guard is cheap
insurance for any future environment (local dev, a preview deploy) where
the binding is legitimately absent, so the failure mode there is a loud
400 instead of a quiet data-loss success response.

## 3. Cross-cutting obligations (from D2-03/06/07/08)

- **D2-03 (legacy retirement policy).** game-tracker is explicitly the
  *deferred* case in D2-03's four-app sweep — do not touch `match`/`turn`/
  `matchSecondaries` as part of any "v1 sunset" work; there is no sunset to
  schedule because v2 has no adopter yet. The obligation here is narrower:
  open one tracked follow-up (not a same-day change) to (i) fix the
  `matchV2` API-shape doc drift and (ii) decide, per §2(a) above, whether a
  client gets built. Do not let `matchV2` sit as a third silently-abandoned
  construction the way `ingest_jobs` sat undiscovered in content-ingestor.
- **D2-06 (silent-failure policy).** game-tracker owns instance #1 of
  D2-06's eight-instance list, and it's one of only two rated **live
  production data loss** (the other is no-cheat's orphaned-blob issue).
  This is the one obligation in this doc with no lower priority available
  — see §2(d) and §4.
- **D2-07 (shared-utility consolidation).** game-tracker owns item #4 of
  D2-07's seven-item list, and it's worse than the general census phrasing
  suggested: **four**, not two, hand-rolled `generateId`/`id()` functions
  — `match.ts:17-19`, `matchV2.ts:8-10` (renamed `id`), `turn.ts:8-10`,
  and `secondary.ts` (per D2-07, not re-read this pass but consistent with
  the pattern confirmed in the three files above). All four reimplement
  `` `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` `` — weaker
  collision resistance than `server-core`'s existing `nanoid()`-based
  `generateId()` (`packages/server-core/src/id.ts`), which nothing in this
  app imports. D2-07 correctly scores this "not a design decision, a
  correctness fix wearing a Rule-3 costume" — pure deletion + import swap,
  zero behavior risk (both are opaque ID strings; no consumer parses the
  format). This is the cheapest item in this entire doc and should not
  wait for anything else here.
- **D2-08 (doc drift).** game-tracker's own census lists 7 CLAUDE.md drift
  items (matchV2 API shape wrong, `match_player`/`round_player`/
  `score_event` schema mismatches, phantom Pages-deploy artifacts,
  `packages/db/CLAUDE.md`'s 2-vs-19-table undercount, undocumented
  `RoundEditor.tsx`, understated test count). Per D2-08's sequencing (A:
  trim policy → immediate sweep → B: generated sections → C: drift-checker
  CI), this app's slice of "immediate sweep" is: correct the `matchV2`
  input/output shapes in CLAUDE.md to match §2(a)/(b)'s actual code (or
  delete the detailed shape entirely per D2-08's Option A "link to the
  code instead" policy, given the shape may still move if §2(a)'s fallback
  triggers), replace the phantom Pages-deploy checkmarks with a pointer to
  `apps/gateway/CLAUDE.md` (D2-08's prescribed fix for all 5 affected
  apps, not a game-tracker-specific rewrite), and add `RoundEditor.tsx` to
  the architecture section.

## 4. Ordered work plan

Photo fix first, regardless of the V1/V2 verdict — this is the one item
with a live user harmed today.

1. **[Immediate, D2-06 Track 1]** Bind `PHOTOS_BUCKET` in
   `server/wrangler.toml` (provision the R2 bucket if it doesn't exist yet;
   confirm via `wrangler r2 bucket list --remote` per root CLAUDE.md's R2
   gotcha, not a local-emulator check) **and** add a guard in `turn.ts` so
   `ctx.storage.upload()` returning `null` in a context where photos were
   requested produces a clear error/warning field on the response instead
   of a silent success — defense in depth per §2(d), not an either/or with
   the binding.
2. **[Cheap, D2-07 item 4]** Delete the four hand-rolled `generateId`/`id()`
   bodies in `match.ts`, `matchV2.ts`, `turn.ts`, `secondary.ts`; import
   `generateId` from `@tabletop-tools/server-core`. Zero behavior risk,
   smallest diff in this doc — do it in the same PR as step 1 or
   immediately after; no reason to sequence it later.
3. **[Doc hygiene, D2-08]** Fix the `matchV2` CLAUDE.md section to match
   verified code (this pass's read of `matchV2.ts` is authoritative:
   `start` returns `{matchId, yourPlayerId, opponentPlayerId}`; `scoreRound`
   takes `{roundPlayerId, scoringMissionId, vp}`; `match_player` has
   `seat`/`listId`/`faction`/`detachment`/`isAttacker`/`goesFirst`/
   `battleReady`/`paintScore`, no `user_id`/`display_name`; `round_player`
   holds only `cpGained`/`cpSpent`, VP lives in `score_event`'s 3 columns).
   Replace the phantom client-deploy checkmarks with a pointer to
   `apps/gateway/CLAUDE.md`. Add `RoundEditor.tsx` to the architecture
   section. Correct the test-file count.
4. **[Decision, §2(a)]** Record the "V1 incrementally, V2 frozen"
   verdict as the tracked follow-up D2-03 requires — a short note in
   game-tracker's CLAUDE.md or a linked doc stating the flip trigger
   (V2 gets an actual client screen + doc-shape fix) so the next person
   who opens `matchV2.ts` doesn't have to re-derive "is this dead or
   in-progress" from scratch.
5. **[Opportunistic, §2(c)]** Extract `getPairingContext()` next time
   `startFromPairing` or a similar cross-app tournament read is touched
   for an unrelated reason — not urgent enough to schedule standalone,
   but flag it so it isn't forgotten the way `matchV2`'s doc drift sat
   unnoticed for a full migration cycle.
6. **[Only if §2(a)'s fallback triggers]** Build V2 client screens +
   add the `matchV2.get` VP rollup from §2(b) in the same PR, then define
   an explicit v1 sunset condition under D2-03's Option B policy (a
   calendar date or migration-flag threshold) before both models are
   allowed to stay live past one release cycle.
