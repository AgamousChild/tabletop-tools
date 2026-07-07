# D2-03 — Legacy-version retirement policy

> **Decision.** Whether the platform adopts a standing policy for retiring a
> "v1" surface once its "v2" replacement ships, versus continuing to decide
> retirement ad hoc per app — and whether the four v1/v2 pairs the census
> found are safe to retire today.
>
> **Status:** drafted 2026-07-06. Census evidence:
> [`../apps/list-builder.md`](../apps/list-builder.md),
> [`../apps/game-tracker.md`](../apps/game-tracker.md),
> [`../apps/versus.md`](../apps/versus.md),
> [`../apps/content-ingestor.md`](../apps/content-ingestor.md). All file:line
> citations below re-verified against code on 2026-07-06 in this worktree
> (`C:\R\wargame-docs`), not carried over from the census unread.

## Forces

- **The pattern repeats four times independently.** list-builder (`list` v1
  router + `lists`/`listUnits` tables vs `listV2` + 4 tables), game-tracker
  (`match`/`turn` v1 JSON-blob tables vs 15-table `matchV2` relational
  model), versus (`simulate` v1 JSON-blob `simulations` table vs
  `simulateV2`), content-ingestor (three generations: `ingest_jobs` →
  `ingest_content`/`ingest_sources` → `pipeline_*`). Four teams, same
  failure: ship v2, never schedule v1's death. Every instance is a live
  Rule 1 violation (two storage models for one entity, alive at once).
- **Test investment inversion:** content-ingestor's dead `ingest.ts` has the
  single largest server test file (280 lines,
  `apps/content-ingestor/server/src/lib/ingest.test.ts`) while the modules
  actually wired into the live Worker (`discover.ts`, `process.ts`) have
  zero tests — effort spent maintaining confidence in code nobody runs.
- **Single-user/hobby reality today, multi-user future.** Micah can flip a
  flag and grep production code himself today — no external deprecation
  contract forces a window. But once other users exist, an in-place schema
  drop becomes a real data-loss event with no rollback, so the policy must
  work in both eras.
- **Rule 9 interacts directly:** list-builder's only Rule 9 risk *is* its
  v1 surface (`list.syncAll`, unbounded per-list insert+delete+insert loop,
  `apps/list-builder/server/src/routers/list.ts:88-145`). Retiring v1 there
  deletes the app's one chunking risk along with the Rule 1 violation.

## Grounding — what actually reads/writes each v1 surface today

Verified by grep against production (non-test) source in this worktree,
2026-07-06.

### list-builder: `list` v1 router + `lists`/`listUnits` tables

- Router mounted: `apps/list-builder/server/src/routers/index.ts:7-12`.
  Router body: `apps/list-builder/server/src/routers/list.ts:30` (`sync`,
  `syncAll`, `getAll`, `delete`).
- Tables: `packages/db/src/schema.ts:216` (`lists`), `:238` (`listUnits`).
- **Client production callers of `list.*`: none.** Grepped
  `apps/list-builder/client/src` for `list.sync|syncAll|getAll|delete` —
  the only hits are `apps/list-builder/server/src/routers/list.test.ts`
  (10 call sites, all test-only).
- The one production "migration" path,
  `apps/list-builder/client/src/lib/migrateIndexedDbLists.ts:1-95`, is **not**
  a v1→v2 DB migration — its own doc comment says so (line 7: "The
  IndexedDB lists/list_units stores are left intact"). It reads
  browser-local IndexedDB (`getLists`/`getList`/`getListUnits` from
  `@tabletop-tools/game-data-store`) and writes straight to `listV2` via
  `createListV2Imperative`/`addUnitV2Imperative` (lines 9-11, 61-76). It
  never calls `list.sync` or touches the server `lists` table.
- **Cross-app reader found:** `apps/admin/server/src/routers/stats.ts:9-10,
  71-72, 152-157` imports `lists`/`listUnits` and counts rows for an admin
  dashboard stat (`lbTotal`, 7-day growth) — the only live consumer of the
  v1 tables anywhere in the codebase.
- **Verdict: safe to retire the router now; table drop needs one admin
  patch first.** No UI and no non-admin app depends on `list.*` or the
  tables. Unmount the router immediately; drop the tables only after
  `stats.ts` stops counting them (or is pointed at `listV2`/`listUnit`).

### game-tracker: `match`/`turns` (JSON-blob) vs `matchV2` (15-table relational)

- Router mounted: `apps/game-tracker/server/src/routers/index.ts:8-15`
  (`match`, `matchV2`, `mission`, `turn`, `secondary`).
- Tables: `packages/db/src/schema.ts:286` (`matches`, JSON cols
  `twist_cards`/`challenger_cards`), `:327` (`turns`, 4 JSON unit-list
  cols), `:622` (`matchSecondaries`, JSON `vp_per_round`). V2:
  `packages/db/src/match-schema.ts:11` (`deployment`) through `:47`
  (`matchV2`) and 13 more tables to line 261.
- **Client production callers — the inverse of list-builder.**
  `apps/game-tracker/client/src/components/GameTrackerScreen.tsx:27,29,36`
  call `trpc.match.list`, `trpc.match.start`, `trpc.match.delete`.
  `EndGameScreen.tsx:38` and `BattleScreen.tsx:19` call `trpc.match.get`.
  `BattleScreen.tsx:25,31,38` call `trpc.turn.add`, `trpc.turn.update`,
  `trpc.match.close`. **`trpc.matchV2.*` has zero production client
  callers** — grepped the entire client `src` tree, no hits.
- Per the census (`game-tracker.md:74-79`), `matchV2`'s documented API
  shape doesn't match its own implementation — evidence the V2 model is
  mid-build, not mid-adoption. No client code exists to cut over.
- **Verdict: not safe to retire v1 today — v1 is the only thing live.**
  Retiring it would delete the entire working feature. The real decision
  isn't "sunset v1," it's "finish building the v2 client, then migrate."
  Treat `matchV2` as in-progress construction, not a completed migration
  waiting on a flag.

### versus: deprecated `simulate` router + JSON-blob `simulations` table vs `simulateV2`

- Router mounted: both `simulate` and `simulateV2` live per
  `versus.md:44-47`. Table: `packages/db/src/schema.ts:188` (legacy
  `simulations`, full JSON-blob `result` column). V2 tables:
  `packages/db/src/versus-schema.ts:13` (`simulation`), plus
  `simulation_weapon`/`simulation_modifier`.
- **Client production callers:** `SimulatorScreen.tsx:574` calls
  `trpc.simulate.lookup` (cache-hit check by `configHash`) — this is the
  **only** live call into the `simulate` v1 router. Grepped for
  `simulate.save`/`simulate.history`/`simulate.delete` in production
  client source: **no hits**. All writes and all history/delete UI go
  through `simulateV2` (`useSimulateV2.ts:163` `simulateV2.save`,
  `SimulatorScreen.tsx:1297,1301` `simulateV2.history`/`.delete`).
- **Verdict: nearly safe to retire — one read-only endpoint left.** Three
  of `simulate`'s four endpoints (`save`/`history`/`delete`) are already
  fully dead in production. Only `lookup` (a `configHash` cache-hit check,
  additive convenience, not correctness-load-bearing) is still called.
  Deleting that one call site plus the router and table is a same-day
  change; no data migration needed.

### content-ingestor: `ingest_jobs` / `ingest_content`+`ingest_sources` / `pipeline_*`

- Three generations in `packages/db/src/schema.ts`: `ingest_jobs`
  (`:1063-1076`); `ingest_sources`/`ingest_content` (`:1078-1109`);
  `pipeline_source`/`pipeline_item`/`pipeline_run`/`pipeline_run_item`
  (`:1116-1198`, comment at `:1112-1113` declaring intent to replace "the
  scattered ingest_jobs / ingest_content / bcp_scrape_jobs /
  meta_cube_status trackers").
- **`ingest_jobs` / `lib/ingest.ts`: fully dead.** Grepped
  `apps/content-ingestor/server/src` for any import of `./lib/ingest` or
  `../lib/ingest` outside the module itself: **no hits**. `worker.ts` never
  imports it. Only `ingest.test.ts` exercises it. This one has no caller
  at all, in test or prod, other than its own test.
- **`ingest_content`/`ingest_sources`: live in the deployed Worker.**
  `apps/content-ingestor/server/src/worker.ts:8` imports both; used
  throughout for source CRUD, content discovery/processing rows, and the
  Gladia webhook callback (`worker.ts:56-298`, ~15 call sites). This is the
  system that actually runs on the `0 6 * * *` cron.
- **`pipeline_*`: used only by local, hand-run Node scripts**
  (`apps/content-ingestor/src/process-queue.ts`, `queue-newest.ts`,
  `discover.ts`, `add-item.ts`) that talk to the tables via raw
  `@libsql/client` SQL, bypassing `@tabletop-tools/db` entirely (Rule 3
  violation, noted in `content-ingestor.md:67-71`). The schema comment
  calls this the canonical replacement, but nothing in the deployed Worker
  reads or writes it — it is canonical in name only.
- **Verdict: `ingest_jobs` safe to drop today; the other two are a real
  consolidation, not a simple retirement.** Dropping `ingest_jobs`/
  `lib/ingest.ts`/its test is zero-risk. But `ingest_content` (live,
  cron-driven, prod data) and `pipeline_*` (declared-canonical, where the
  newer design work lives) are two active systems doing the same job for
  different runners (Worker vs local script) — retiring either means
  porting the other's runner first: D2-09/D2-05 territory, not a
  same-day flag flip.

## Options

### A — Per-instance ad hoc retirement (status quo)

Each app's owner decides case-by-case, whenever it comes up, whether to
delete a v1 surface. No shared checklist, no tracked sunset date, no
required "both live" cap.

- **Track record in this codebase: 0/4.** Four independent teams, zero
  retirements. Two of the four (list-builder, versus) turned out to be
  safe to kill *today*, sitting unretired anyway because nobody scheduled
  the check. One (content-ingestor's `ingest_jobs`) is fully dead and
  nobody had noticed.
- Cost: zero process overhead per PR. Shows up instead as accumulated dead
  weight — extra tables/routers in every audit, misdirected test
  investment (content-ingestor's 280-line dead test file), and
  `packages/db/CLAUDE.md` drift (stale table counts for 3 of 4 apps here).

### B — Standing policy: every v2 ships with an explicit v1 sunset condition

A written rule requiring one of {migration-flag adoption %, a calendar
date, or a zero-traffic window} recorded *at v2 launch time*, plus a hard
cap on how long "both live" persists (e.g. 1 release cycle / 30 days)
before someone must flip the flag or explicitly re-approve an extension.

- Fixes the demonstrated failure mode directly: in all four instances,
  nobody set a condition, so nobody was ever wrong not to have met one —
  there was nothing to check against.
- Cheap: a paragraph in each app's `CLAUDE.md` ("v1 retires when X") plus
  one line in a tracked table — a `legacy_surfaces` section in
  `packages/db/CLAUDE.md` fits, since that's the file every app already
  treats as the ownership map.
- Doesn't retroactively fix the four instances by itself — needs Option C
  to clear the existing backlog.
- Fits single-user-now: "zero-traffic window" is trivially checkable today
  (grep production code, as this doc's Grounding section did) rather than
  needing usage analytics; upgrades to real flag-adoption metrics once
  multi-user traffic exists, without changing shape.

### C — Immediate retirement sweep for the four existing instances

Assess each of the four now, using the Grounding section's evidence, and
act per-instance instead of deferring to a future policy cycle.

- **Already shown above to be three different situations, not one:**
  list-builder and `ingest_jobs` are dead-safe-to-cut today; versus is one
  call site away from dead-safe; game-tracker is the opposite (v1 is the
  only live thing, v2 unfinished); `ingest_content`/`pipeline_*` is a
  genuine two-system consolidation needing a runner port, not a flag flip.
- Benefit: closes out already-diagnosed cases instead of leaving them as
  "known problem" — the census is the diagnosis; not acting on it wastes it.
- Risk alone: resets the clock with nothing preventing the next v2 from
  repeating the pattern.

## Wargame

- **A is falsified by its own track record** — 0/4, including a fully dead
  module nobody had noticed. Ad hoc didn't fail occasionally here; it
  failed every time it was tried.
- **B alone leaves money on the table** — three of four instances are
  provably safe or near-safe to retire today by grep. Waiting for "the
  next policy cycle" to clean up already-diagnosed work wastes the work.
- **C alone doesn't compound** — one-time cleanup. `matchV2` is already
  mid-construction and `pipeline_*` already declared-but-unadopted; a
  fifth and sixth instance are already forming with nothing to catch them.
- **B+C is sequential, not competing:** C closes today's backlog using
  evidence this doc already gathered; B stops the backlog refilling.
  Scoring them as alternatives would be a false choice.

### Scores

Axes are the platform-rule fit this decision actually turns on (not the
W1 hardware rubric — see `../README.md` "Method deltas vs W1"): Rule-1
compliance, effort to ship, risk of getting it wrong, and whether it
prevents recurrence.

| Option | Rule-1 fit | Effort | Risk | Prevents recurrence | Weighted |
|---|---|---|---|---|---|
| A — status quo | 1 | 5 | 2 | 1 | 1.8 |
| B — standing policy only | 3 | 4 | 4 | 5 | 4.0 |
| C — sweep only | 5 | 3 | 3 | 1 | 3.0 |
| **B + C together** | **5** | 3 | 4 | 5 | **4.4** |

Weights: Rule-1 fit ×2, Effort ×1, Risk ×1, Prevents-recurrence ×2 (this
decision is graded on stopping the pattern, not just cleaning today's
mess).

## Recommendation

**Primary: B + C together.** Adopt the standing policy and execute the
four per-instance verdicts from Grounding now, using this doc's evidence
directly rather than re-deriving it.

**Immediate (safe today, can ship independently, in any order):**
1. list-builder — unmount `list` router; patch `stats.ts` to stop counting
   `lists`/`listUnits`; drop the two tables in a follow-up migration once
   the patch is live.
2. versus — delete the `trpc.simulate.lookup` call site; unmount
   `simulate`; drop `simulations`.
3. content-ingestor — delete `lib/ingest.ts` + its test and the
   `ingest_jobs` table. Zero risk, zero callers.

**Deferred (tracked as its own follow-up, not a flag flip):**
4. game-tracker — do not touch `match`/`turn`/`matchSecondaries`; they're
   the only working feature. Track `matchV2` as under construction.
5. content-ingestor pipeline consolidation — hand to D2-09/D2-05; a
   runner-porting decision, not a same-day cleanup.

**Fallback:** if a retirement surfaces an undiscovered cross-app reader
mid-implementation (as `stats.ts` did here for list-builder), don't drop
the table in the same PR — land the router/call-site removal first, drop
the table once the dependent is patched.

## Flip triggers

- **Back toward deferring the sweep:** if removing any of the three "safe"
  surfaces turns up a second undiagnosed cross-app reader — re-run the
  grep sweep before proceeding, don't assume the census is still current.
- **On the policy's mechanics:** once multi-user traffic exists,
  "zero-traffic window" needs real flag-adoption telemetry instead of a
  grep check — the policy's shape (condition at launch, capped "both
  live" duration) doesn't change, only which condition type is checkable.
- **On game-tracker:** flip from "leave v1 alone" to "start the migration
  conversation" only once `matchV2` has an actual client screen and its
  documented API-shape drift (`game-tracker.md:74-79`) is fixed.

## Implementation notes (per-instance ordered checklist)

1. **list-builder** — (a) patch `apps/admin/server/src/routers/stats.ts`
   to read `listV2`/`listUnit` counts instead of `lists`/`listUnits`;
   (b) remove `list` from `routers/index.ts`, delete `list.ts`/
   `list.test.ts`; (c) migration dropping `lists`, `listUnits`; (d) update
   `packages/db/CLAUDE.md`'s ownership map (stale per `list-builder.md:83-
   84`) in the same PR.
2. **versus** — (a) delete the `trpc.simulate.lookup` block in
   `SimulatorScreen.tsx:574-577` and any now-unused `currentConfigHash`
   plumbing; (b) remove `simulate` from the router mount; (c) migration
   dropping `simulations` (`schema.ts:188`); (d) update
   `packages/db/CLAUDE.md` table count (`versus.md:73-75`).
3. **content-ingestor** — delete `lib/ingest.ts`, `lib/ingest.test.ts`,
   `test-r2.ts`; migration dropping `ingest_jobs` (`schema.ts:1063-1076`).
4. **game-tracker** — no schema/router change. Open a tracked follow-up to
   (a) fix the `matchV2` API-shape doc drift, (b) build client screens
   against `matchV2`, (c) only then define a sunset condition under the
   Option B policy.
5. **content-ingestor pipeline consolidation** — route to D2-09/D2-05; out
   of scope for a same-day retirement per this doc's own verdict.
6. **Policy artifact** — add a "Legacy surfaces" table to
   `packages/db/CLAUDE.md` listing each live v1/v2 pair, its sunset
   condition, and status. Require it updated at every future v2 launch as
   part of that PR's checklist, not a separate chore.
