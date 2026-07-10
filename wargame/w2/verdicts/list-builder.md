# list-builder — W2 Phase C per-app design verdict

> Grounded against Phase A census ([`../apps/list-builder.md`](../apps/list-builder.md))
> and Phase B decisions D2-03, D2-04, D2-06, D2-08. All file:line claims
> re-verified directly against code in this worktree (`C:\R\wargame-docs`)
> on 2026-07-06.

## 1. Verdict

**Refactor.** The V2 data model, ownership boundary, and attachment logic
(`content_can_lead`, `can_deploy_solo`) are sound and data-driven — not a
rebuild. But the app has one real correctness gap (server accepts invalid
lists) and a cluster of scale/maintainability debt that should be paid
down before this schema becomes load-bearing for tournament and
game-tracker, which it already is by the code's own admission
(`packages/db/src/list-schema.ts:49` — `listUnit` "shared with
Versus/Game Tracker/Tournament").

## 2. App-local decision points wargamed

### (a) Validation engine placement

**Forces.** `validateArmy` (`client/src/lib/armyRules.ts:29-68`) checks
points-cap, duplicate limits, and warlord designation — verified as the
only place these rules run. `list-v2.ts` (422 lines, read in full) never
calls it; `addUnit`/`updateUnit` accept any `points`/`datasheetId` with no
server-side check beyond list ownership. A buggy or malicious client can
write an arbitrarily over-cap, over-duplicated list straight into
`list`/`listUnit` — tables tournament and game-tracker are declared
readers of. Garbage written here is garbage two other apps display as fact.

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| A — Duplicate checks server-side in `list-v2.ts` | 4 | 3 | 4 | 3 | 2 | 3.2 |
| B — Extract to shared package, client + server both import | 5 | 5 | 3 | 5 | 5 | **4.6** |
| C — Client-only, accept as-is | 2 | 1 | 5 | 5 | 1 | 2.4 |

**Wargame.** A recreates exactly the drift D2-04 warns about: two copies
of one rule that will diverge, the same failure shape that already hit
the *data* half of this rule (battle-size table, 3 copies, one already
wrong — §3). C is disqualified the moment a second app trusts these
tables as ground truth. B costs about the same as A — `armyRules.ts` is
already 68 lines of pure functions, no DOM/React dependency — but yields
one source of truth instead of two.

**Recommendation:** **Primary: B.** Move `validateArmy`/`BattleSize`/
`ValidationError` into a shared package (`packages/game-content` fits).
Server calls it as a hard gate in `addUnit`/`updateUnit`/`computePoints`
— reject `OVER_POINTS`/`DUPLICATE_LIMIT`, warn-only for `NO_WARLORD`
(a list mid-build is legitimately warlord-less). Client keeps calling it
for live UI feedback. **Fallback:** A, if the shared-package extraction
fights the module boundary — still closes the correctness gap, just
re-accepts the duplication cost.

### (b) V2 read fan-out

**Forces.** `listV2.get` (`list-v2.ts:101-138`, read in full) issues 4
sequential dependent selects: `list` → `listUnit` → `listUnitLoadout`
(by `inArray(unitIds)`) → `listUnitLoadoutWeapon` (by
`inArray(loadoutIds)`). Per-request cost, not a batch job.

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| Single joined query, de-dupe in app code | 4 | 4 | 5 | 3 | 4 | 3 | 3.8 |
| Accept at current scale | 5 | 3 | 3 | 5 | 5 | 3 | 4.0 |

**Wargame.** At today's list sizes, 4 round-trips to edge libSQL is
milliseconds, not a Rule-9 risk — matches the census's "no acute risk"
read. A join collapses to one round-trip but costs real code to
de-duplicate three levels of one-to-many, for a latency win nobody feels
yet. Unlike (a)/(d), this degrades with *one user's list size* (bounded
by the game's own points cap), not an unbounded table — the one point
here where "accept" is a genuine answer, not a shortcut.

**Recommendation:** **Primary: accept at current scale**, no effort now.
**Fallback trigger:** revisit as a joined query if list sizes grow past
matched-play norms, or `listV2.get` shows up in real latency telemetry
once multi-user traffic exists.

### (c) UnitSelectionScreen monolith

**Forces.** `UnitSelectionScreen.tsx` is 1163 lines (direct count,
matches census), holding pickers, roster view, export/clipboard, and
rating-suggestion logic in one component.

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| Split into sub-components | 4 | 4 | 2 | 4 | 4 | 3.6 |
| Accept as-is | 4 | 2 | 5 | 4 | 3 | 3.6 |

**Wargame.** Maintainability call, not correctness — no census bug traces
to size alone. But the two real bugs in this app (the `document.write`
export fallback at `:1078-1087`, and (d) below) both live in this file, so
a split would isolate blast radius for fixes already needed here. Against
that: no failing test, no user-facing symptom, and a split is pure
refactor risk against 82 client assertions across 11 files that already
touch pieces of this component's behavior.

**Recommendation:** **Primary: accept as-is, split opportunistically as a
side effect of (a) and (d)** — both already touch this file, so pull
export and suggestion logic into their own components as part of landing
those fixes rather than opening a dedicated split PR. **Fallback:** open
a standalone split PR if the file crosses ~1400 lines or a third bug
traces to cross-concern coupling inside it.

### (d) Rating-suggestion fetch pattern

**Forces.** `UnitSelectionScreen.tsx:884` holds
`trpc.rating.alternatives.useQuery({})` — already a full unfiltered,
cached fetch. `handleAddUnit` (`:928-983`) separately calls
`trpcClient.rating.alternatives.query({})` again on every unit add
(`:951`) — a second full-table round-trip, redundant with the already-held
`allRatings`, filtered/ranked client-side after the fact. The server
procedure (`rating.ts:17-32`, read in full) takes only an optional
`metaWindow` — no `unitId`, faction, or points filter; it returns every
`unitRatings` row every time.

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| Scope it: server-side faction/points filter + reuse cached `allRatings` | 5 | 4 | 2 | 5 | 4 | 3.9 |
| Accept as-is | 3 | 2 | 5 | 4 | 2 | 3.2 |

**Wargame.** Two stacked problems: (1) the redundant fetch — `allRatings`
is already current when `handleAddUnit` runs, refetching is pure waste,
fixable today at zero schema cost. (2) no narrowing parameter on the
router — every faction's ratings ship on every screen regardless of the
active list's faction. Today's table size hides this; it's the same
"fine now, won't scale" shape the census flags, and it compounds with
(1) rather than standing apart from it.

**Recommendation:** **Primary: scope it.** Remove the second
`rating.alternatives.query({})` call; filter the already-mounted
`allRatings` client-side instead. Add an optional `factionId`/`maxPoints`
filter to the server procedure, sourced from the active list. **Fallback:**
if faction-scoping proves awkward, accept the full-table fetch but still
land the redundant-refetch fix — that part is worth doing regardless.

### (e) Sharing/collaboration model

**Forces.** `list.userId` is `NOT NULL`, FK'd to `authUsers`; all 11
V2 call sites gate strictly on `eq(list.userId, ctx.user.id)`, verified.
No `sharedWith`/team/org column, no share link. Yet `list-schema.ts:49`'s
own comment declares `listUnit` "shared with Versus/Game Tracker/
Tournament" — cross-*app* reads of one user's own data are already
intended; cross-*user* sharing (tournament showing an opponent's list) is
the part with no schema hook, and sits immediately adjacent.

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| Decide now — add a minimal share primitive ahead of need | 3 | 4 | 2 | 4 | 4 | 3.3 |
| Decide later — stay strict per-userId until a concrete need lands | 4 | 3 | 5 | 4 | 4 | 4.0 |

**Wargame.** Cross-app reads (an app reading its own signed-in user's
list) need nothing new — same `userId`-scoped query per Rule 1. Cross-user
sharing has no concrete read pattern yet — building a `list_share` table
now risks guessing the wrong shape (ACL vs. token vs. org-visibility all
imply different UX nobody has designed). Building speculatively costs
real effort against an undefined requirement.

**Recommendation:** **Primary: decide later**, no schema change now. Flip
trigger: the first time any app needs to read a `list` row where
`userId !== ctx.user.id` for a real product reason — design the primitive
against that concrete pattern then. **Fallback:** if tournament's own
Phase B/C work surfaces a near-term need first, pull this forward rather
than letting tournament bolt on an ungated cross-user read from outside
this app.

## 3. Cross-cutting obligations (Phase B decisions)

**D2-03 — v1 retirement (approved, admin-patch-first).** Confirmed:
`apps/admin/server/src/routers/stats.ts:9-10` imports `lists`/
`listUnits`; `:71-72` counts both; `:152-157` computes `lbTotal` and
7-day growth from `lists` directly — this is the cross-dependency D2-03
requires patching before table drop. No other production code reads
`list.*`/`lists`/`listUnits` (confirmed by grep). Steps:
1. Patch `stats.ts` to read `listV2`/`listUnit` counts instead.
2. Unmount `list` from `routers/index.ts:10`; delete `list.ts` +
   `list.test.ts` (10 tests, all exercising a router with zero production
   callers).
3. Migration dropping `lists` (`schema.ts:216`), `listUnits` (`:238`).
4. Fix `packages/db/CLAUDE.md`'s ownership map (currently missing all 4
   V2 tables) in the same PR.

**D2-04 — battle-size table → data.** Three hand-maintained copies,
verified: `armyRules.ts:8-13` (`BATTLE_SIZES`), `useListsV2.ts:271-276`
(`BATTLE_SIZE_POINTS`), `ListBuilderScreen.tsx:56-63` (`byName`) — copy #3
already disagrees with copy #1 on Strike Force `maxDuplicates`, a live
bug. Move to a `battle_size` table in `packages/db`, one shared read via
`game-data-store` for all 3 call sites plus the new server-side
validation call site from §2(a). Do in the same pass as (a) — both need
the same canonical data; splitting into two PRs means touching
`armyRules.ts` twice.

**D2-06 — silent migration failure.** Confirmed:
`migrateIndexedDbLists.ts` has bare `catch {}` at the per-list, per-unit,
and outer-loop level; `failed` is tracked but `markMigrationDone()` fires
unconditionally, and `ListBuilderScreen.tsx:75-79` never reads
`result.failed`. Tier 1 (user-facing data loss) per D2-06. Fix, ordered:
1. Replace bare `catch {}` with error collection into the existing
   `failed` count.
2. Gate `markMigrationDone()` on `failed === 0`, or add a "partial"
   status so retry is possible.
3. Render `result.failed > 0` as a visible warning with retry in
   `ListBuilderScreen.tsx`.

**D2-08 — test counts and PLAN.md deploy claims.** Both confirmed stale
by direct read:
- `CLAUDE.md:203,230-231` claims "129 tests (53 server + 76 client)."
  Actual: server 113 (`score.test.ts` 14 + `list-v2.test.ts` 78 +
  `list.test.ts` 10 + `rating.test.ts` 7 + `server.test.ts` 4), client 82
  across 11 files (includes `AttachmentPicker.test.tsx`, omitted from the
  CLAUDE.md count). Total 195, not 129.
- `PLAN.md:78-79` checks `[x]` for `client/wrangler.toml` +
  `client/functions/trpc/[[path]].ts` — confirmed neither exists on disk.
  One of 5 apps with this exact phantom-deploy claim; real deploy path is
  gateway's single shared Pages project.

Per D2-08: replace the test-count line with a pointer to `pnpm test`
rather than a hand-maintained number; replace the phantom deploy `[x]`s
with a pointer to `apps/gateway/CLAUDE.md`. Bundle into the D2-03 PR
(same files touched for the ownership-map fix).

## 4. Ordered work plan

1. **D2-06 fix (Tier 1, ship first, independent).** Fix
   `migrateIndexedDbLists.ts`'s silent-failure/unconditional-done bug;
   surface `result.failed` in `ListBuilderScreen.tsx`. Active user-facing
   data loss — does not wait on anything else here.
2. **D2-03 admin patch + v1 retirement.** Patch `stats.ts`; unmount
   `list` router, delete `list.ts`/`list.test.ts`; migration dropping
   `lists`/`listUnits`; fix `packages/db/CLAUDE.md` ownership map — one PR.
3. **Battle-size consolidation (D2-04) + validation engine placement
   (§2a), combined.** Extract `BattleSize` data to a DB table; extract
   `validateArmy` to a shared package; wire the server-side hard gate
   into `addUnit`/`updateUnit`/`computePoints`. One PR — both need the
   same canonical data and touch the same call sites.
4. **Rating-suggestion fetch fix (§2d).** Drop the redundant per-add
   fetch; filter cached `allRatings` instead; add server-side
   `factionId` filter. Can ship independently of (3), but naturally
   follows since both touch `UnitSelectionScreen.tsx`.
5. **Opportunistic monolith split (§2c).** As (3)/(4) land, pull
   suggestion and export/clipboard logic into their own components
   rather than opening a dedicated split PR.
6. **D2-08 doc fixes.** Correct test counts and phantom deploy claims —
   bundle into the D2-03 PR (step 2), which already touches this app's
   docs.
7. **No action now:** V2 read fan-out (§2b) and sharing model (§2e) —
   both deliberate "accept today" verdicts with named flip triggers
   (list-size growth / latency telemetry; a concrete cross-user read
   request). Track as watch items, not backlog work.
