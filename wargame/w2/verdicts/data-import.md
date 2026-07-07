# data-import — W2 Phase C verdict

> Grounded in `wargame/w2/apps/data-import.md` (Phase A census), D2-04/05/06/
> 07/08/09 (Phase B), and a direct re-read of `apps/data-import/server/src/**`
> + `apps/data-import/client/src/lib/sync.ts` + `.github/workflows/*.yml`,
> 2026-07-06.

## 1. Verdict

**Keep, finish the job.** No redesign is on the table here — data-import
already did its one big redesign (`a3630e4` → `c19d8b3`/`c09378c` →
`312ed99` → `ab0799b`: CPU-cap raise → chunking flags → move sync to GH
Actions → retire the Worker's `/sync` + cron + `SYNC_SECRET` entirely,
confirmed in git log). The Worker today is a 2-route read-only R2 proxy
(`worker.ts:29,38`); the sync pipeline is an importable `runSync()`
(`lib/sync.ts:177`) wrapped by a Node CLI (`sync-cli.ts`) and orchestrated by
CI (`sync-data.yml`). That is the Rule 9 target shape D2-05 recommends for
every other app's Class-2/3 hotspot — data-import is the **solved precedent**,
not a pending redesign.

What's left is finishing work: one live Rule 5 violation (10e source feeding
an 11e-exclusive pipeline), one live Rule 6 violation (4× hand-maintained
alias tables), one live Tier-1 silent data loss (STORE_MAP gap), one dead CI
artifact, one stale CLAUDE.md, and a packaging smell against `game-content`.
None of these require touching the sync-to-CI architecture; all are
in-place fixes against the shape that already exists.

## 2. App-local decision points wargamed

### (a) Wahapedia 10e→11e — the live Rule 5 violation

**Forces.** `wahapedia.ts:6` hits `https://wahapedia.ru/wh40k10ed` — a
literal 10th-edition URL — inside a pipeline root CLAUDE.md Rule 5 declares
11e-exclusive. This isn't a latent risk; every weekly sync run
(`sync-data.yml`, Mon 03:00 UTC) currently pulls 10e data into the live
platform. The census calls it "reads as oversight not decision" — Phase C's
job is to turn that into an actual decision.

What Wahapedia uniquely provides that BSData/MFM don't (verified against
`CSV_FILES` in `wahapedia.ts:9-27`): `Stratagems`, `Enhancements`,
`Detachments` + `Detachment_abilities`, `Abilities`, and the datasheet↔
stratagem/enhancement/detachment-ability junction tables
(`Datasheets_stratagems`, `Datasheets_enhancements`,
`Datasheets_detachment_abilities`). BSData supplies unit/wargear/points
structure; MFM supplies points/legality; neither ships stratagem or
enhancement **text**, core detachment rules prose, or ability prose. Losing
Wahapedia isn't a data-source swap — it's losing the only source for entire
content classes the brain and list-builder depend on today (confirmed
against `apps/data-import.md`'s Data model section: `content_entity` rows
for stratagems/enhancements/abilities have no other producer in this repo).

**Options:**

1. **Wait for Wahapedia to publish 11e CSVs.** Zero engineering cost, but
   Wahapedia has run the same 10e URL structure through this entire 11e
   migration to date (no evidence in the repo of an 11e CSV set existing)
   — waiting has no visible end date and every week compounds the
   Rule-5 debt silently.
2. **Replace the source entirely** (new scraper against a different 11e
   stratagem/enhancement text source — e.g. GW app data, a community 11e
   equivalent of Wahapedia). Highest engineering cost: a new adapter, new
   parser, new alias-reconciliation work against `CATALOG_FACTION_ALIASES`
   and friends (D2-04 items 9-12), and no confirmed 11e-parity source is
   named anywhere in the census or this app's code — this is a research
   spike wearing an implementation-task costume, the same shape D2-09 flagged
   for bcp-scraper's list-parser.
3. **Document as a tracked Rule 5 exception**, with a stated trigger and a
   loud marker in code + CLAUDE.md, rather than resolving it. Lowest cost,
   preserves the content classes only Wahapedia supplies, converts "silent
   oversight" into "visible, owned debt."

**Scores** (Fit/Quality/Effort/Risk; Effort pre-inverted, 5=cheapest):

| Option | Fit | Quality | Effort | Risk | Weighted |
|---|---|---|---|---|---|
| 1. Wait | 2 | 2 | 5 | 2 | 2.5 |
| 2. Replace source | 4 | 5 | 1 | 3 | 3.0 |
| 3. Tracked exception | 4 | 3 | 5 | 4 | **4.0** |

**Recommendation: Option 3, primary.** Add a `// RULE-5-EXCEPTION:` comment
block at `wahapedia.ts:6` naming what's missing (11e stratagem/enhancement/
ability text has no alternate source), what the risk is (rules text may
drift from GW's actual 11e wording where 10e→11e changed a stratagem/
enhancement), and the flip trigger below. Update `CLAUDE.md` to state this
explicitly instead of leaving it undocumented (ties into D2-08's immediate
sweep — this app is not in D2-08's grounding list, so add it there too).

**Fallback: Option 2** the moment a concrete 11e-parity source is identified
(not "search for one" — that's the research spike, done once, separately,
not blocking this pass). If Micah names a specific source with stratagem/
enhancement prose for 11e, that collapses the research half of Option 2 and
it becomes a normal adapter-build task.

**Flip trigger:** Wahapedia publishes an 11e CSV set (URL change or new
path under the same domain — check on a quarterly cadence, not per-sync),
or a specific alternate 11e source is named and confirmed to carry
stratagem/enhancement/ability text. Either event moves this from Option 3
to Option 2, not a silent auto-migration.

### (b) CI matrix per-source vs. monolithic 30-min job

**Forces.** `sync-data.yml` runs one job, one `runSync()` call, 30-minute
timeout, weekly cron (`0 3 * * 1`) + `workflow_dispatch`. `RunSyncOptions.sources`
(`sync.ts:172`) already accepts a `Set<'wahapedia'|'bsdata'|'mfm'|'missions'|
'faction-pack'>` to restrict to a subset — built for exactly this chunking,
per its own comment ("Used by the CI workflow to chunk a long sync into
smaller per-source invocations"). But `sync-cli.ts` passes no options
(confirmed in the census, `sync-cli.ts:57-62`) — **the chunking mechanism
exists in code and is unused in the one CI workflow that would use it.**
CPU is no longer the constraint (D2-05 already classifies data-import as
Class-2, "scheduled scrape," GH-Actions-primary, and notes the 30-min
GH Actions ceiling only binds if a single run's wall time grows past
~20 minutes) — so this is a failure-isolation question, not a capacity one.

**Options:**

1. **Stay monolithic.** One job, one `runSync()` call, all 5 sources +
   producer chain in sequence. Simplest — one log to read, one pass/fail
   signal, no matrix YAML. Failure isolation is coarse: if BSData's GitHub
   fetch 404s mid-run, Wahapedia's already-fetched data plus everything
   downstream in that run is lost, and a re-run re-does all 5 sources even
   though only 1 failed.
2. **Full per-source CI matrix.** 5 parallel jobs (one per `sources` entry),
   each a thin `runSync({sources: new Set([x])})` call, converging at a
   final manifest-rebuild step. Best failure isolation and fastest
   feedback (data-import.md's own "candidate design decision" #1 names
   this). Cost: manifest rebuild has to run after all 5 finish (a `needs:`
   fan-in job), meaning the workflow gets a second job stage; the
   MFM/faction-pack/rekey stage in `runSync` (the "id-mapping/rekey/
   content-producers" stage per the census architecture section) currently
   runs inline as part of the monolith — splitting sources apart means that
   stage needs its own job too, consuming rekeyed outputs from the parallel
   fetch jobs via `actions/upload-artifact`/`download-artifact`, adding
   real workflow-authoring complexity for a job that runs once a week.
3. **Partial split — wire the existing `sources` param, keep one job.**
   Don't add parallel CI jobs; instead use `workflow_dispatch` inputs (or a
   scheduled matrix that still runs sequentially in one job) to allow a
   manual "re-run just BSData" call without re-running Wahapedia/MFM/
   faction-pack, by finally passing `sources` from `sync-cli.ts` through to
   `runSync`. Keeps one job (no fan-in complexity), fixes the actual pain
   point named in the census (a full re-run wastes ~30 min when only one
   source needs a retry) with a fraction of Option 2's cost.

**Scores** (Fit/Effort/Risk/Stack; weekly-cadence job, so ops burden and
effort matter more than raw parallel speed):

| Option | Fit | Effort | Risk | Stack | Weighted |
|---|---|---|---|---|---|
| 1. Stay monolithic | 3 | 5 | 3 | 5 | 4.0 |
| 2. Full per-source matrix | 4 | 2 | 4 | 3 | 3.3 |
| 3. Wire existing `sources` param | 4 | 4 | 4 | 5 | **4.3** |

**Recommendation: Option 3, primary.** Wire `sync-cli.ts` to accept a
`--sources` CLI flag that maps to `RunSyncOptions.sources`, and add a
`workflow_dispatch` input (`sources: choice`, default "all") to
`sync-data.yml` that passes it through. This uses code that already exists
(`RunSyncOptions.sources`), costs one CLI flag + one workflow input, and
directly answers the failure-isolation question ("BSData's upstream repo
moved, re-run just BSData") without a second job stage or artifact
fan-in. Delete the dead `skipProducers` no-op path only if this pass
confirms nothing else references it (it's currently also unused per the
census, `sync-cli.ts:57-62`).

**Fallback: Option 2** if the weekly job's wall time is ever observed
approaching the 30-min ceiling (matches D2-05's Class-2 flip trigger
verbatim: "single-run wall time pushing past ~20 minutes"). Don't
pre-build the matrix speculatively — Option 3 is strictly cheaper and
solves today's actual complaint (coarse retry granularity), not a capacity
problem that hasn't materialized.

**Flip trigger:** observed `sync-data.yml` run time crosses ~20 minutes
(check GH Actions run history — don't estimate), or a source's upstream
becomes flaky enough that partial-source re-runs happen more than
occasionally and Option 3's manual dispatch becomes a recurring chore
rather than an occasional escape hatch.

### (c) content-producer batch performance

**Forces.** `produceContentEntities` (`content-producer.ts:61-113`) loops
`for (let i = 0; i < rows.length; i += DB_BATCH_SIZE)` with `DB_BATCH_SIZE =
100`, `await`-ing each `db.insert(...).onConflictDoUpdate(...)` **sequentially**
— no `Promise.all`, no concurrency. Comment at `sync.ts:161-163` states this
runs "9 stages over ~17K entities with sequential JSON serialization" and
was "heavy enough that on the Workers Paid plan /sync was hitting CF error
1102" — that's the very problem the GH-Actions move already solved for CPU
budget. The remaining cost is wall-clock time inside a 30-min CI job, not a
hard cap violation.

The FK-order constraint is real: `factionId`/`parentId` use backfill-only
COALESCE semantics (`content-producer.ts:11-14,104-105`) specifically so a
later stage can fill an FK once the referenced entity type exists without
clobbering an already-set value — this is an intentional ordering dependency
across producer calls (factions before units, units before wargear, etc.),
not an accident. Batches *within* one producer call, however, don't depend
on each other — they're chunks of the same flat `rows` array with no
cross-chunk FK relationship.

**Options:**

1. **Leave sequential.** ~17K rows ÷ 100/batch ≈ 170 sequential libSQL HTTP
   round-trips per full sync, across however many producer calls compose
   the 9-stage chain. Zero risk of reordering FK-dependent stages
   incorrectly. Simplicity matches root CLAUDE.md's "don't polish what
   doesn't need polishing" if the wall-clock cost is actually small — this
   needs a measurement, not an assumption (Rule 0).
2. **Parallelize batches *within* a single producer call** (`Promise.all`
   over the batch chunks for one `config.records` array), while keeping the
   **inter-stage** ordering (faction producer → unit producer → wargear
   producer, etc.) strictly sequential. This respects the FK-order
   constraint exactly as documented — the constraint is inter-stage, not
   intra-stage — and turns ~170 sequential round-trips into a bounded
   number of concurrent batches (e.g., `Promise.all` in groups of 5-10 to
   avoid overwhelming Turso's HTTP connection pool, matching the "Turso is
   HTTP-based, every DB call is a network round trip" cost D2-05 already
   names for bcp-scraper).
3. **Raise `DB_BATCH_SIZE`.** Comment at `content-producer.ts:42-51`
   already states the ceiling: SQLite's 999-param default, 9 params/row,
   so >111 rows/batch risks the limit unless libSQL's HTTP API tolerance is
   reconfirmed. Marginal gain, already documented as bounded — not worth
   re-litigating without first measuring whether batch count or per-batch
   latency dominates the total time.

**Scores** (weekly batch job — Effort/Risk matter most, Latency matters
only insofar as it threatens the 30-min CI ceiling):

| Option | Fit | Effort | Risk | Latency-relief | Weighted |
|---|---|---|---|---|---|
| 1. Leave sequential | 3 | 5 | 5 | 1 | 3.5 |
| 2. Parallelize within-stage | 4 | 3 | 4 | 4 | **3.9** |
| 3. Raise batch size | 2 | 4 | 3 | 2 | 2.6 |

**Recommendation: measure before choosing (Rule 0) — this is not yet a
scored decision, it's an open measurement gap.** `sync-cli.ts` and
`sync-data.yml`'s "Verify manifest" step don't currently log per-stage or
total producer wall time anywhere the census or this read surfaced. Before
committing effort to Option 2:

1. Add stage-level timing output to `runSync`'s existing `errors[]`/
   per-stage try-catch structure (already has the isolation boundary,
   `sync.ts:225-227`…`:734-736` per the census) — log `Date.now()` deltas
   per stage to the CI step summary.
2. Run one real sync, read the numbers. If total producer time is a small
   fraction of the 30-min budget (e.g., under 5 minutes), **accept** —
   Option 1, formalized as a decision with the measurement cited in a
   comment, not an oversight.
3. If producer time is a material fraction of the budget or trending
   toward the ceiling as the corpus grows, implement **Option 2**
   specifically (bounded-concurrency `Promise.all` per stage, sequential
   across stages) — it's the only option that doesn't fight the documented
   FK-order design.

**Fallback:** Option 3 (raise batch size) only as a supplement to Option 2,
never as a replacement — it has the least headroom and the comment already
flags it as a fallback-of-a-fallback ("If hitting a parameter cap, lower to
100," implying 100 is already a conservative choice, not a lot of slack to
extract).

**Flip trigger:** measured producer-stage wall time exceeds ~15 minutes
(half the CI budget) or is visibly trending that direction as `~17K`
entities grows with future faction/detachment additions.

### (d) Deep-path imports into game-content internals

**Forces.** `bsdata.ts:4-9` imports `parseBSDataXml`, `type CatalogRegistry`,
`type Subfaction` from `@tabletop-tools/game-content/src/adapters/bsdata/
parser` and `type UnitProfile` from `@tabletop-tools/game-content/src/types`
— both are deep paths into package internals, not the public
`@tabletop-tools/game-content` entry. `faction-pack.ts:26-34` does the same
against `.../adapters/faction-pack/parser`.

Verified against the package's actual public surface
(`packages/game-content/package.json`: `"main": "./src/index.ts"`;
`packages/game-content/src/index.ts`): `parseBSDataXml` **is** already
exported publicly (`export { BSDataAdapter, parseBSDataXml } from
'./adapters/bsdata/index.js'`), and `parseFactionPackV2` **is** already
exported publicly. So part of this "violation" is pure laziness — importing
the internal path when the public one already re-exports the same function.
But `CatalogRegistry`, `Subfaction`, and `UnitProfile` (the type-only
imports) are **not** in the public export list at all — `index.ts` exports
a different, smaller `UnitProfile`-adjacent type set from `./types.js`
(no `CatalogRegistry`/`Subfaction` anywhere in the export block). This is a
genuine packaging gap, not just an unused shortcut: the public entry point
doesn't yet expose everything data-import actually needs.

**Options:**

1. **Fix the call sites only** — swap `parseBSDataXml`/`parseFactionPackV2`
   imports to the public path immediately (zero-risk, the function is
   already exported identically); leave the type-only deep imports as-is
   since no public alternative exists yet.
2. **Publish full package exports, then fix all call sites** — add
   `CatalogRegistry`, `Subfaction` to `bsdata/index.js`'s public re-export
   and confirm `UnitProfile` in `types.js` is the same shape data-import
   needs (or add a second export if it's a genuinely different type);
   then swap every deep import in `bsdata.ts`/`faction-pack.ts` to the
   public entry.
3. **Accept the coupling as-is.** Both packages live in the same monorepo,
   deep imports still type-check and still get bundled correctly (no
   published-npm boundary being crossed) — the practical blast radius of
   leaving this is "the next `game-content` refactor might silently break
   data-import if internal file paths move," not a runtime bug today.

**Scores:**

| Option | Fit | Effort | Risk | Stack | Weighted |
|---|---|---|---|---|---|
| 1. Fix call sites only (partial) | 3 | 5 | 3 | 3 | 3.5 |
| 2. Publish full exports + fix all | 5 | 3 | 5 | 5 | **4.5** |
| 3. Accept | 2 | 5 | 2 | 2 | 2.5 |

**Recommendation: Option 2, primary.** This is a small, mechanical fix now
that the actual export gap is identified: add `CatalogRegistry` and
`Subfaction` to `packages/game-content/src/adapters/bsdata/index.ts`'s
public re-export (confirm they're meant to be public types, not
intentionally internal — a 2-minute read of that adapter's own exports
will show), verify `UnitProfile` from `types.ts` is what `bsdata.ts`
actually needs or add the missing type, then swap all 4 deep-import lines
in `bsdata.ts`/`faction-pack.ts` to `@tabletop-tools/game-content` (bare
package specifier). This closes the packaging smell without inventing new
package boundaries — same package, just the front door instead of a side
door.

**Fallback: Option 1** if publishing `CatalogRegistry`/`Subfaction`
publicly turns out to leak an adapter-internal detail that shouldn't be
public API (unlikely on read, but verify before committing) — in that
case, fix only the two already-public function imports and leave a
tracking comment on the two type-only deep imports.

**Flip trigger:** none needed for the primary — this is a same-day fix
once scoped. Revisit only if `game-content`'s adapter internals are
restructured (adapter directories renamed/moved) and the deep-import
call sites break, which is exactly the failure mode Option 2 eliminates.

## 3. Cross-cutting obligations (D2-04/05/06/07/08/09 shares)

data-import carries pieces of five of the six Phase B decisions. The
**STORE_MAP gap (D2-06) is the user-facing one and should be treated as the
highest-priority item in this doc** — it is live, silent data loss, same
tier as game-tracker's photo-upload bug.

- **D2-04 (data-in-code cleanup, Class B).** `CATALOG_FACTION_ALIASES`
  (`sync.ts:83-99`), `MFM_FACTION_SLUGS`/`SM_CHAPTERS_WITHOUT_MFM`/
  `BSDATA_TO_MFM_NAME_ALIASES` (`sync.ts:789-820`+), `SM_CHAPTER_TO_
  SUBFACTION` (`bsdata.ts:48-60`), `factionSlugToBsdataName`
  (`faction-pack.ts:98-129`) — 4 hand-maintained variants of the same
  BSData↔canonical-slug fact. D2-04's verdict: **keep in code** (these are
  parse-time reconciliation, not user-editable entity data — a DB round
  trip adds latency for zero benefit in an already offline-tolerant CLI),
  but **consolidate into one shared module** (D2-04 recommends
  `packages/game-content` or `packages/db`, e.g. `catalogAliases.ts`)
  imported by `sync.ts`, `bsdata.ts`, `faction-pack.ts`. This is Rule 3
  (DRY), not Rule 6 — the inline comment's Rule 1 defense
  ("presentation-only ID mapping") is correct as far as it goes but doesn't
  address the 4x duplication.

- **D2-05 (Worker chunking patterns) — data-import is the cited precedent,
  not a pending action.** D2-05 names data-import's GH-Actions move as the
  proven Class-2/3 pattern every other hotspot should follow. Nothing to
  do here except keep the CI-matrix question (2b above) inside that same
  pattern family rather than inventing a new one (Queues/Durable Objects
  are explicitly not warranted per D2-05's scoring — data-import's weekly
  cadence and single-operator scale don't justify either).

- **D2-06 (silent-failure policy) — Tier 1, ship now.** The client
  `STORE_MAP` (`client/src/lib/sync.ts:87-160`, 19 keys) has no entries for
  `bsdata-subfactions.json`, `mfm-unit-costing.json`,
  `mfm-detachments.json`, `faction-pack-*.json`. `syncAllData` filters
  `manifest.files` to `STORE_MAP` keys (`:167`) before syncing — a user who
  runs Sync sees "success" with those files silently dropped, even though
  the manifest lists them as available. D2-06 classifies this as Tier 1
  (user performed an action believing it succeeded; some of it silently
  didn't) and puts it in the same urgency band as game-tracker's/no-cheat's
  live storage bugs. Fix: **add the missing STORE_MAP entries** (requires
  IndexedDB save functions for subfaction/MFM-costing/MFM-detachment/
  faction-pack data that don't yet exist client-side — check
  `game-data-store` for whether a schema home already exists before adding
  new IndexedDB stores) **or strip those files from the manifest's
  client-visible list** if they're not meant to sync to the browser at all
  (e.g., if MFM/faction-pack data is brain-only and never consumed by
  versus/list-builder's client). Verify which is true before picking — this
  is a Rule-0 check, not a coin flip.

- **D2-07 (shared-utility consolidation) — slugify ×3, genuinely
  divergent.** `sync.ts:52-59` (`contentEntitySlug`, strips curly/straight
  apostrophes, truncates to 60 chars) vs. `faction-pack.ts:86-92` (`slug`,
  different apostrophe class, no truncation); `content-producer.ts` reuses
  `contentEntitySlug` rather than forking a third body. D2-07's verdict:
  **extract now** into `server-core`'s new `slug.ts` export (shared with
  content-ingestor's byte-identical triplicate), parameterizing truncation
  length and apostrophe-strip class so both call sites' existing behavior
  is reproduced exactly — write a snapshot test against current output
  *before* deleting either original, since these two bodies are confirmed
  to differ (D2-07 flags this as the one migration in its list with real
  regression risk).

- **D2-08 (doc drift) — CLAUDE.md is 20+ commits stale, including the
  Worker retirement itself.** Current `CLAUDE.md` claims `POST /sync` +
  `SYNC_SECRET` + a weekly Worker cron — all retired in `ab0799b`; the
  Worker has exactly the 2 GET routes verified above. MFM source/stage/
  outputs and the faction-pack source are entirely undocumented; the
  `content_entity` producer chain (most of `runSync`'s actual body) is
  undocumented; test counts are stale (claims 56+22, actual 68+60 per the
  census). Per D2-08's Option A (trim policy) + immediate sweep: rewrite
  CLAUDE.md's Architecture section to match the read-only-proxy + CI-driven
  reality, delete the `/sync`/`SYNC_SECRET`/cron claims outright, add MFM +
  faction-pack + producer-chain sections, and drop hardcoded test counts in
  favor of "run `pnpm test`" (D2-08's stated policy: docs describe
  architecture and intent, not counts a test run already answers). Also
  add this app to D2-08's own grounding list — the Phase B doc's forces
  section doesn't cite data-import's staleness explicitly even though the
  Phase A census documents 5 separate drift points.

- **D2-09 (dead subsystem disposition) — `update-data.yml`, delete.**
  Verified doubly dead per D2-09's own correction: lives at
  `apps/data-import/server/.github/workflows/update-data.yml`, a path
  GitHub Actions never reads (only repo-root `.github/workflows/` is
  discovered — confirmed the real 4 active workflows all live there, this
  one doesn't). Even if moved to root, it clones a separate repo
  (`AgamousChild/sync-data`) for tooling not in this repo and calls
  `scripts/export-wahapedia.ts` — which exists but exports into a path the
  real `sync-data.yml`/`sync-cli.ts` pipeline already superseded. **Delete
  the file outright**, no park, no unpark condition — it's not reachable by
  CI today and describes a retired architecture, not a paused one.

## 4. Ordered work plan

1. **STORE_MAP fix (D2-06, Tier 1).** Highest priority — live, silent,
   user-facing data loss. Determine per-file whether the fix is "add the
   missing IndexedDB save path" or "stop advertising the file to the
   client," then implement. Smallest-diff version: audit which of the 4+
   missing keys are actually consumed anywhere client-side before building
   new IndexedDB stores for data nobody reads yet.
2. **Delete `update-data.yml`** (D2-09). One-line PR, zero risk, removes a
   dead artifact describing a retired pipeline.
3. **Wahapedia Rule 5 exception, documented** (2a). Add the code comment +
   CLAUDE.md note. Does not require touching the fetch logic — this step
   is purely making the existing behavior a visible decision.
4. **CLAUDE.md rewrite** (D2-08). Bundle with step 3 since both touch the
   doc; cover the retired `/sync`, the MFM/faction-pack sources, the
   producer chain, and drop stale test counts.
5. **Alias-table consolidation** (D2-04, Class B) — one shared
   `catalogAliases.ts` module replacing the 4 hand-maintained variants
   across `sync.ts`/`bsdata.ts`/`faction-pack.ts`.
6. **Slugify consolidation** (D2-07) — coordinate with content-ingestor's
   identical work item; snapshot-test data-import's two divergent bodies
   before cutover.
7. **game-content export fix** (2d) — publish `CatalogRegistry`/
   `Subfaction`, swap all 4 deep imports to the public package entry.
8. **Wire the `sources` CLI/workflow-dispatch param** (2b) — smallest CI
   change, directly fixes today's coarse-retry pain point.
9. **Producer-batch measurement, then decide** (2c) — add stage timing,
   run one real sync, only build `Promise.all` batching (Option 2) if the
   numbers justify it. Do this last: it's the one item gated on data that
   doesn't exist yet, and every earlier step in this plan is independent
   of the outcome.

None of steps 1-9 touch the Worker, the R2 proxy routes, or the CI-orchestration
architecture itself — confirming the Phase C verdict: this app's job is
closing out known debt against a design that's already right, not
redesigning anything.
