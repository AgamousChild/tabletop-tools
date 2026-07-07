# new-meta — W2 Phase C per-app design verdict

> Grounded in `wargame/w2/apps/new-meta.md` (2026-07-06 census), a direct
> re-read of `apps/new-meta/server/src/routers/{admin,source,meta}.ts`,
> `apps/new-meta/server/src/lib/{glicko2.test.ts,aggregate.ts}`,
> `apps/content-ingestor/src/meta/build-cube.ts`, and Phase B decisions
> D2-01/05/06/08/09. Non-LLM scope (W2).

## 1. Verdict

**Refactor, not redesign — but the refactor is about ownership boundaries,
not new-meta's own code quality.** The app's read surface (`meta`/`player`
routers, `frameFilters.ts`'s dim-driven resolution) is well-built: real SQL
against a real cube, Rule 6 honored, tests substantial. The problem is that
**new-meta is a read-mostly analytics app that cannot populate its own
primary read tables** — the cube (`meta_for`/`fact_game_results`/`meta_top`/
`meta_cube_status`) is built by an orphaned script living in a different
app (`content-ingestor/src/meta/build-cube.ts`), nobody schedules it, and
new-meta's own admin surface has no button for it. Layered on top: the one
write path new-meta *does* own — `admin.import`'s CSV ingestion — has a
broken dedup key (`sourceId: null`, unique-index-proof), a fabricated
success contract (`importId: 'batch'`, `errors: []` always empty, malformed
rows fail silently), and a doc comment claiming it writes `metaPairings`
when the code never does. None of this is a rewrite-the-app problem; all of
it is "who owns which write path, and does that path tell the truth about
what it did." Fix the boundaries (D2-01, D2-09) and the two local defects
(admin.import's contract, the error-convention cleanup), and this app is
sound as-is.

## 2. App-local decision points wargamed

### (a) Matchup data policy — approximated (CSV) vs. exact (pairing-level) matchups

**Forces.** Verified directly: the live `meta.matchups` procedure
(`meta.ts:226-254`) queries `fact_game_results` — a cube table built by
`build-cube.ts` **from `meta_pairings` rows** (`build-cube.ts:203-240`,
joins on real pairing data). `admin.import`'s CSV path inserts
`metaEventPlayers` W/L/D records but **never writes `metaPairings`**
(confirmed: `metaPairings` is imported into `admin.ts` only to be *read*
during Glicko computation, `admin.ts:166-170` — no `insert(metaPairings)`
call exists anywhere in the file, despite the doc comment at `admin.ts:22`
claiming it does). This is stricter than the census's framing: CSV-imported
events don't get an *approximated* top/bottom-half matchup — they get
**zero** matchup representation, because the cube's only matchup source
(`fact_game_results`) has no rows for them at all. The top/bottom-half
approximation logic the census flagged (`lib/aggregate.ts`'s
`buildMatchupCells`, `aggregate.ts:160-169`) is dead code per D2-09 (item
3, delete) — it was never the live path. So the real policy question isn't
"label the approximation," it's "CSV imports currently contribute win-rate
stats but are invisible to the matchup matrix, silently."

**Options**

| Option | What it is | Play-out here |
|---|---|---|
| 1. Label the gap in the UI | Matchup matrix / dashboard shows which frames include CSV-only events and flags them as "win-rate data only, no matchup data" | Cheapest, ships this week, matches D2-06's Tier-1 "user-facing, must surface" logic — but doesn't fix the underlying gap, just names it honestly |
| 2. Require pairing data for CSV imports | Extend `admin.import`'s CSV parsers (`parseBcpCsv`/`parseTabletopAdmiralCsv`/`parseGenericCsv`, all in `@tabletop-tools/game-content`) to also emit pairing rows where the source format has them (BCP CSV exports typically include round-by-round opponent columns); reject or clearly partial-flag formats that don't | Real fix for formats that have the data (BCP CSV likely does); doesn't help `generic-csv`, which by definition may not carry pairing structure — still needs option 1's label as a fallback for that format |
| 3. Deprecate CSV-only import in favor of pairing-level sources | Steer new tournament data through `bcp-scraper` (real pairings) or `tournament.exportToMeta` (real pairings via D2-01's shared writer) instead of hand-uploaded CSV; keep `admin.import` for backfill/one-off only, documented as matchup-incomplete by design | Matches where the platform is actually headed post-D2-01 (three writers converging on one shared ingestion path) — but forecloses CSV as a general on-ramp for meta data from sources with no BCP/native presence |

**Score** (weights: Quality — does the UI tell the truth — and Fit
highest; this is a data-integrity question, not a latency-sensitive one)

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Label the gap | 3 | 4 | 5 | 4 | 3 | 3.8 |
| 2. Require pairing data where possible | 4 | 5 | 3 | 4 | 3 | 3.9 |
| 3. Deprecate CSV-only, steer to pairing sources | 4 | 5 | 2 | 5 | 4 | **4.0** |

**Recommendation.** **Primary: Option 1 now, Option 2 as the real fix,
sequenced with D2-01.** Ship the UI label immediately — it's a one-line
honesty fix independent of anything else (D2-06's Tier-1 logic: don't let a
user believe matchup coverage is complete when it isn't). Then, when
D2-01's shared `upsertMetaEvent()` lands, extend `admin.import`'s CSV
parsing to populate pairings wherever the source format supports it
(BCP CSV first, since it's the most structured), closing the gap for the
formats that can support it. **Fallback: Option 3** if BCP CSV turns out
not to reliably carry round-by-round pairing columns in practice (verify
against a real sample export before committing to Option 2's parser work)
— in that case, formally scope `admin.import` to win-rate-only backfill
and point Micah at bcp-scraper/native export for anything needing matchup
coverage. **Do not ship Option 2 without Option 1** — even a full parser
rewrite won't cover `generic-csv` by construction, so the label is needed
regardless of which fix lands.

### (b) `admin.import` error contract — fake `errors: []` / `importId: 'batch'` vs. a real per-row contract

**Forces.** Verified directly (`admin.ts:103-109`): the mutation always
returns `errors: [] as string[]` — there is no code path that ever pushes
into it, so a malformed CSV row (bad faction name, missing placement) fails
however `resolveFaction`/the parser handles it internally and the caller
sees a clean success. `importId: 'batch'` is a literal string constant, not
a generated id — nothing downstream (`source.tournament`) can look up "the
import that just ran" by it, and the CLAUDE.md-documented
`source.download({importId})` procedure doesn't exist at all (confirmed:
`source.ts` has no `download` export). This is D2-06's Tier-1 shape (user
performed an action believing it succeeded) riding inside what looks like
Tier-2 admin tooling — Micah is the direct consumer of this contract, so a
silent partial import is exactly the failure D2-06 exists to close.

**Options**

| Option | What it is | Play-out here |
|---|---|---|
| 1. Build the real per-row contract | Catch per-record/per-player failures inside the import loop (`admin.ts:60-101`), collect them into `errors: string[]` with row context, generate a real `importId` (hash or `generateId()`) and return it, persisting an import-log row keyed by it so `source.tournament`/a future `source.download` can resolve it | Matches what the CLAUDE.md already documents — closes the doc-drift (D2-08) and the silent-failure gap (D2-06) in one change. Requires deciding what "partial success" means (per-player or per-event granularity) and adding an import-log table or reusing `metaEvents.id` as the importId |
| 2. Simplify the contract to match reality | Drop `importId`/`errors[]` from the documented and actual return shape; return `{ imported, skipped, playersUpdated }` only, and update CLAUDE.md to match. Malformed rows still need *some* signal — minimum bar is throwing on the first unrecoverable row rather than silently continuing | Cheapest, honest, but a worse UX than option 1 — an admin uploading a 60-row CSV with 3 bad rows either gets a hard failure on row 4 (loses the 3 good rows too, unless the loop is also made transactional) or silently drops rows, same as today minus the false promise |
| 3. Minimal real contract: per-record error collection only, keep `importId` simple | Wrap each player-insert in try/catch, collect `{row, reason}` into `errors`, keep `importId` as `eventId` (already generated, already real) instead of a separate concept | Small diff — same loop, same generated `eventId`, just start capturing rather than swallowing. Doesn't add a full import-log subsystem; `source.tournament({eventId})` already exists as the lookup path (docs need to stop claiming `importId` as a distinct field) |

**Score** (weights: Quality and Risk highest — this is D2-06's exact
Tier-1 pattern)

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Full real contract + import log | 5 | 5 | 2 | 3 | 4 | 3.8 |
| 2. Simplify to match reality | 3 | 2 | 5 | 4 | 3 | 3.4 |
| 3. Minimal real contract (errors + reuse eventId) | 5 | 5 | 4 | 5 | 4 | **4.6** |

**Recommendation.** **Primary: Option 3.** Wrap the per-player insert
(`admin.ts:84-94`) in a try/catch that pushes `{row, reason}` into a real
`errors` array instead of the hardcoded `[]`; return `eventId` (already
generated at line 61, already the real lookup key `source.tournament`
uses) as `importId` so the field means something instead of a shared
constant. This is a small, local diff — no new table, no new concept — and
directly kills the D2-06 Tier-1 exposure and the D2-08 doc-drift item
(`source.tournament({importId})` vs `{eventId}`) in the same change.
**Fallback: Option 1** if Micah wants a persistent import history view
later (an admin page listing past imports with their error counts) —
that's a real feature, not a bug fix, and should wait until there's a
stated need for it. **Do not ship Option 2** — dropping the fields is
honest but strictly worse than Option 3 for the same effort budget; there
is no reason to give up the error visibility when capturing it is this cheap.

### (c) Error-convention cleanup — plain `Error` vs `TRPCError`; untyped `db: any`

**Forces.** Verified directly: `meta.ts:44-47`'s `resolveGranularityId`
throws a plain `Error` when a granularity name isn't found in
`dim_granularity` — this is public-procedure code (`meta.factions` and
every sibling call it), so an unhandled dim-lookup miss becomes an
unstyled 500 rather than a typed tRPC error the client can branch on.
Separately, `updateGlickoForEvent(db: any, eventId: string)`
(`admin.ts:157`) is the most complex function in the app (167 lines,
per-player Glicko-2 computation, called from both `admin.import` and
`admin.recomputeGlicko`) and takes an untyped `db` parameter — the same gap
D2-01 already flags in `tournament.ts`'s twin implementations
(`tournament.ts:331,521`), suggesting this is a repeated authoring pattern,
not a one-off.

**Options**

| Option | What it is | Play-out here |
|---|---|---|
| 1. Fix locally, now | Replace `throw new Error` with `throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })` at `meta.ts:44-47` (and any sibling call sites reachable from public procedures); add the real Drizzle `db` type to `updateGlickoForEvent`'s signature | Small, mechanical, no cross-app dependency — ships independently of D2-01 |
| 2. Defer both to D2-01's shared-writer work | D2-01 already commits to "type the `db` parameter" for the shared `upsertMetaEvent()` (implementation note 2) and to consolidating Glicko-2 into that same shared function — since `updateGlickoForEvent` is exactly the function D2-01 targets for replacement/absorption, fixing its typing here risks being thrown away when D2-01 lands | Avoids double work on the Glicko function specifically; the `TRPCError` fix at `meta.ts` is unrelated to D2-01 and doesn't need to wait |
| 3. Split: fix `TRPCError` now, defer `db: any` to D2-01 | Do the cheap, independent `meta.ts` fix immediately; explicitly fold `updateGlickoForEvent`'s typing into D2-01's implementation note 2 rather than duplicating the fix here first | Matches each defect to its actual dependency graph instead of batching them because they're both "error convention" |

**Score** (weights: Effort and Risk highest — this is a hygiene pass, not
new capability)

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Fix both locally now | 3 | 4 | 4 | 4 | 3 | 3.6 |
| 2. Defer both to D2-01 | 3 | 3 | 5 | 4 | 3 | 3.6 |
| 3. Split — TRPCError now, db-typing deferred | 5 | 5 | 5 | 5 | 5 | **5.0** |

**Recommendation.** **Primary: Option 3.** Fix `meta.ts:44-47`'s
`TRPCError` conversion now — it's a two-line change, unrelated to D2-01,
and closes a real public-endpoint defect immediately. Leave
`updateGlickoForEvent`'s `db: any` for D2-01's shared-writer change, since
that function is slated to be replaced or absorbed into
`packages/server-core`'s `upsertMetaEvent()` per D2-01's implementation
note 1 — typing it twice (once here, once when it moves) is wasted effort.
**No fallback needed** — both halves of this fix are cheap regardless of
sequencing; the only risk is doing the `db` typing here and then redoing
it during D2-01, which Option 3 avoids by naming the dependency explicitly.

### (d) Possible duplicate Glicko-2 implementation — resolved, not actually a duplicate

**Forces.** The census flagged `lib/glicko2.ts` as "in-app copy —
relationship to server-core's `updateGlicko2` unverified, possible second
implementation." Verified directly this pass: **no `lib/glicko2.ts` file
exists** in `apps/new-meta/server/src/lib/` (confirmed via glob of the
full `lib/` directory — only `glicko2.test.ts` is present, alongside
`playerMatch.ts`, `detachment.ts`, `frameFilters.ts`, `aggregate.ts`).
`glicko2.test.ts:1` imports `updateGlicko2` directly from
`@tabletop-tools/server-core`, and `admin.ts:12` does the same
(`import { generateId, updateGlicko2 } from '@tabletop-tools/server-core'`).
There is one implementation, in `packages/server-core/src/glicko2.ts`, with
its own test file there too (`packages/server-core/src/glicko2.test.ts`) —
new-meta's `glicko2.test.ts` is a second test suite exercising the same
shared function against the Glickman (2012) worked example, not a second
implementation. This item is closed with no action needed; the census's
"unverified" flag is resolved to "false alarm" by direct file listing.

**Recommendation.** No decision needed. Note in CLAUDE.md (per D2-08's
drift-cleanup pass) that `lib/glicko2.ts` doesn't exist — only its test
does — so a future census doesn't re-flag it. Optionally consolidate
new-meta's `glicko2.test.ts` into `packages/server-core`'s existing test
file if having the worked-example test duplicated across two packages is
judged wasteful, but this is a nice-to-have, not a defect.

## 3. Cross-cutting obligations — D2 decisions that apply here

| D2 decision | What it covers platform-wide | new-meta's specific share |
|---|---|---|
| **D2-01** (tournament/meta unification) | Replace three independent `meta_events` writers with one shared `upsertMetaEvent()` in `packages/server-core`; resolve cube ownership in the same change | new-meta's `admin.import` is one of the three writers being replaced — its call site (`admin.ts:60-101`) becomes a call to `upsertMetaEvent()` per parsed CSV record, fixing the `sourceId: null` dedup gap as part of the swap (D2-01 implementation note 3). Cube ownership resolution (D2-01 note 6: delete the orphaned `content-ingestor/build-cube.ts`, trigger cube-build from inside `upsertMetaEvent`) is what actually closes "new-meta cannot populate its own primary read tables" — this is the load-bearing fix behind this app's §1 verdict, and it isn't new-meta's code to write, it's D2-01's shared module absorbing the responsibility no app currently owns. |
| **D2-05** (Worker chunking, Class 1) | Cursor/offset pattern for interactive admin mutations | `admin.recomputeGlicko` (`admin.ts:113-129`) is D2-05's own named Class-1 hotspot #2: deletes all Glicko rows then loops every `metaEvents` row through `updateGlickoForEvent` in one unbounded synchronous handler. D2-05's implementation notes for this hotspot: add `{cursorEventId?, limit?}`, guard the destructive `delete()` to fire only on the first call, select events `WHERE id > cursorEventId ORDER BY date LIMIT limit`, loop and return `{updated, nextCursorEventId, done}`, drive it from the Admin page the same way as the other Class-1 hotspot (admin's `runLlmEvaluator`). Type `updateGlickoForEvent(db: any, …)` properly while touching this code (folds in §2c's deferred item). |
| **D2-08** (doc drift) | Trim/generate/check strategy for stale CLAUDE.md/PLAN.md claims | Two direct corrections owed to new-meta's own CLAUDE.md: (1) `source.tournament({importId})` documented, code takes `{eventId}` (`source.ts:44-46`) — fix the doc, or fix the code if `eventId` should be renamed for API clarity (recommend fixing the doc; `eventId` is the correct, real key); (2) delete the documented `source.download({importId, format})` procedure entirely — no such code exists anywhere in `source.ts`, and PLAN.md's paired claim ("Download buttons wired for JSON + CSV") is equally fictional. Also: correct `admin.import`'s documented return shape once §2b's fix lands (real `errors`/`importId` semantics), and note in CLAUDE.md that `lib/glicko2.ts` doesn't exist (§2d). |
| **D2-09** (dead-subsystem disposition) | Per-item wire/delete/park verdicts for six orphaned subsystems | new-meta owns item 3: `lib/aggregate.ts` (344 lines) — **delete**, confirmed unused by any live router (grep of `routers/` for `./aggregate` imports: zero matches; only `aggregate.test.ts` consumes it). Its `buildMatchupCells`/`computeMatchups` top/bottom-half approximation (the mechanism §2a's original census framing referenced) was never live — `meta.matchups` queries the cube directly. Remove `lib/aggregate.ts` + `aggregate.test.ts` together. D2-09 also names new-meta's cube-read dependency as the reason item 6 (admin's `triggerMetaPipeline` stub) matters: once D2-01 resolves cube ownership, admin's "Rebuild Cube" button should call the real (relocated) function instead of staying a labeled stub — new-meta doesn't own that fix, but is the direct beneficiary of it. |

## 4. Ordered work plan

1. **[App-local §2b]** Fix `admin.import`'s error contract: capture
   per-row failures into a real `errors` array, return `eventId` as
   `importId` instead of the hardcoded `'batch'` string. Small, local,
   closes both a D2-06 Tier-1 exposure and a D2-08 doc-drift item.
2. **[App-local §2c, partial]** Convert `meta.ts:44-47`'s plain `throw new
   Error` to `TRPCError` — two-line fix, independent of everything else.
3. **[D2-09]** Delete `lib/aggregate.ts` + `aggregate.test.ts` — confirmed
   dead, zero production imports.
4. **[D2-08]** Correct new-meta's CLAUDE.md: `source.tournament({eventId})`
   not `{importId}`; delete the fictional `source.download` entry and
   PLAN.md's paired "download buttons wired" claim; note `lib/glicko2.ts`
   does not exist (only its test does, importing the shared
   `server-core` implementation); update `admin.import`'s documented return
   shape once item 1 above lands.
5. **[App-local §2a]** Ship the matchup-coverage-gap UI label (Option 1):
   flag frames/events that have win-rate data but no matchup data because
   they lack pairing rows. Independent of D2-01, ship immediately.
6. **[D2-01, cross-app]** Adopt the shared `upsertMetaEvent()` once it
   lands in `packages/server-core`: replace `admin.import`'s hand-rolled
   insert loop (`admin.ts:60-101`) with a call per parsed CSV record,
   fixing the `sourceId: null` dedup gap as part of the swap. Extend CSV
   parsing to populate `metaPairings` where the source format supports it
   (BCP CSV first) — this is §2a's Option 2, sequenced here because it
   depends on the shared writer existing.
7. **[D2-01, cross-app]** Confirm cube-build triggers from inside (or
   immediately after) `upsertMetaEvent()` once D2-01 ships — this is the
   change that actually closes "new-meta cannot populate its own primary
   read tables," the headline finding behind this app's verdict.
8. **[D2-05]** Chunk `admin.recomputeGlicko` with `{cursorEventId?,
   limit?}`; guard the destructive delete to the first call only; type
   `updateGlickoForEvent(db: any, …)` properly while touching this code
   (closes §2c's deferred item in the same pass).
9. **[App-local §2a, fallback check]** Before committing to item 6's parser
   extension, verify a real BCP CSV export actually carries round-by-round
   pairing columns — if it doesn't, fall back to §2a's Option 3 (scope
   `admin.import` to win-rate-only, steer matchup-needing imports to
   bcp-scraper/native export) rather than building parser work the format
   can't support.
