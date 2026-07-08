# D2-01 — Tournament data unification (Rule 1)

> **Decision:** How do we collapse the three parallel "tournament" concepts
> (operational tournaments, meta-analytics events, BCP passthrough) into the
> one data model Rule 1 requires — and who owns building the derived
> analytics cube once that's settled?
> **Status:** drafted 2026-07-06, W2 Phase B.

---

## Grounding

Root `CLAUDE.md:33-35` names this exact arrangement as forbidden:
*"Tournaments and meta analytics share one data model... No import/export
pipeline between apps."* Today's system is the pipeline it forbids.

**Three tournament concepts, three tables of record:**

- Operational: `tournaments` / `tournamentPlayers` / `rounds` / `pairings`
  (`packages/db/src/schema.ts:372-490`) — owned by `apps/tournament`.
- Meta-analytics: `metaEvents` / `metaEventPlayers` / `metaPairings`
  (`schema.ts:797-882`) — read by `apps/new-meta`.
- BCP directory: `passthroughEvent` / `bcpRegistration` (`schema.ts:581-618`)
  — a directory of external events to register into, not a results store.
  Out of scope for this decision; no unification action needed there.

**Three independent writers into `meta_events`, no shared interface:**

1. **`tournament.exportToMeta`** (`apps/tournament/server/src/routers/tournament.ts:330-515`),
   fired from `advanceStatus` on COMPLETE (`tournament.ts:200-202`). Copies a
   *snapshot* of `tournamentPlayers`/`rounds`/`pairings` into the meta tables
   with `source: 'native'`, `sourceId: tournament.id` (`tournament.ts:441-511`).
   Has real idempotency: delete-then-reinsert keyed on the unique index
   `(source, sourceId)` (`tournament.ts:366-374`, index at `schema.ts:820`).
   Runs `computeGlicko2ForEvent` inline (`tournament.ts:521-665`) — untyped
   `db: any` (`tournament.ts:331,521`).
2. **`new-meta admin.import`** (`apps/new-meta/server/src/routers/admin.ts:24-110`),
   CSV upload path. Writes `source: 'csv-import'`, **`sourceId: null`**
   (`admin.ts:71-72`) — the unique index can't dedup NULLs, so a re-uploaded
   CSV silently creates a second full copy of the event. Runs its own
   `updateGlickoForEvent` per record (`admin.ts:99-100`).
3. **`bcp-scraper`** (`apps/bcp-scraper/server/src/lib/scrape.ts:60-233`).
   Writes `source: 'bcp'`, `sourceId: event.id`. Dedup is app-level — it
   pre-fetches `existingSourceIds` and filters before inserting
   (`scrape.ts:81-88`), not a DB-constraint upsert; the unique index is a
   backstop it never exercises in the happy path.

Net: three writers, three idempotency strategies (real dedup / no dedup /
pre-check dedup), and Glicko-2 computed independently at two of the three
sites — whether `admin.ts`'s `updateGlickoForEvent` is the same
implementation as tournament's `computeGlicko2ForEvent` is unconfirmed by
this census and must be resolved before either is deleted.

**The cube layer compounds this.** `apps/bcp-scraper/server/src/lib/pipeline.ts:198-349`
(`runPipeline`, called from bcp-scraper's own `worker.ts` after every
scrape, weekly cron `worker.ts:71-85`) already builds
`meta_for`/`fact_game_results`/`meta_top` and updates `meta_cube_status`
(`pipeline.ts:200,217,343,346`) — a real, scheduled cube builder.
**Corrected 2026-07-07 hardening pass: it is NOT scoped to BCP data.** Its
event-selection query (`pipeline.ts:210-213`) is
`SELECT id, date, name FROM meta_events WHERE imported_at > ${lastCompleted}`
— no `source = 'bcp'` filter. It cubes every new row from all three
writers, so tournament's delete-then-reinsert re-exports and new-meta's
dedup-free CSV imports silently perturb the cube bcp-scraper thinks it
owns. This makes the shared-writer recommendation below a **correctness
fix**, not just hygiene. Separately,
`apps/content-ingestor/src/meta/build-cube.ts`
is a **second, standalone implementation** of the same cube tables
(identical DDL, `build-cube.ts:1-60`), runnable only via manual
`npx tsx src/meta/build-cube.ts` per its own header comment —
`content-ingestor/package.json` has no script calling it, `cli.ts` never
imports it. `new-meta` itself never touches `metaCubeStatus` outside test
fixtures (only reference: `server.test.ts:38`'s CREATE TABLE). So the cube
is both orphaned *and* duplicated (a Rule 3 problem nested inside the Rule 1
one): native/csv-import events are cubed by bcp-scraper's pipeline only if
they happen to land before its weekly run (or by hand-running the
content-ingestor script); the cube's ownership lives in a scraper, not in
the app that reads it.

**Consumer that must not break:** `game-tracker`'s `match.startFromPairing`
(`apps/game-tracker/server/src/routers/match.ts:81-154`) reads `pairings` →
`tournamentPlayers` → `rounds` → `tournaments` directly (verified
`match.ts:84-121`) to seed a live match from an in-progress pairing. This
only works pre-COMPLETE, against the *operational* tables; it has no
relationship to `metaEvents` and doesn't need one, since meta rows only
exist after COMPLETE. Any unification that removes or reshapes the
operational tables mid-tournament breaks this consumer.

---

## Options

### Option A — Status quo, documented as accepted exception

Leave three tables, three writers, orphaned+duplicated cube script; add a
note that Rule 1 has a carve-out for tournament/meta.

**Play-out:** Free to build, but leaves the platform's foundational doc
wrong on its own worked example. Every future import source inherits the
same "invent your own idempotency" risk `admin.import`'s `sourceId: null`
already shows is error-prone.

**Verdict:** Rejected as primary; kept on the board per methodology
("do-nothing is always an option") and as the documented fallback.

### Option B — Full unification: native events write directly to meta 3NF tables

Delete `tournaments`/`tournamentPlayers`/`rounds`/`pairings`. Add
TO-management columns (status lifecycle, check-in, list-lock,
mission-per-round) directly onto the meta tables. `exportToMeta` deleted —
nothing to export to.

**Play-out against this codebase:**
- **Breaks `startFromPairing` immediately.** `metaPairings.player2Id` and
  `result` are `.notNull()` (`schema.ts:868-870,875`) — the meta schema has
  no bye representation and no in-progress state, while operational
  `pairings.player2Id`/`result` are nullable specifically to support byes
  and unreported rounds (`schema.ts:474,479`). The meta tables model
  *completed, immutable* history by design; loosening those constraints to
  support live play defeats the purpose of the separation.
- Metric-stack standings (`tournament.ts:236-250`) and Swiss pairing
  (`lib/swiss/pairings.ts`) both need a mutable, round-scoped working set
  the meta tables' single-writer-at-COMPLETE design doesn't provide.
- Every operational router (`tournament`, `player`, `round`, `result`,
  `card`, `award`, `metric`) gets rewritten against a differently
  constrained schema, alongside all 100 server + 58 client tournament
  tests — the highest-cost option, and it rewrites the app the census found
  healthiest (100% pass, no TODOs).

**Verdict:** Correct in the limit, but the operational/completed split is
load-bearing, and `startFromPairing` is concrete proof a live consumer
depends on it. Bigger and riskier than the actual problem requires (which
is the copy step and its inconsistent idempotency, not the existence of two
shapes).

### Option C — Keep two models, unify the write path

Keep both shapes, but replace all three writers with **one shared ingestion
function**, e.g. `packages/server-core/src/meta-ingest.ts` exporting
`upsertMetaEvent(db, { source, sourceId, name, date, ..., players, pairings })`.

- `tournament.exportToMeta` calls it at COMPLETE instead of hand-rolling
  insert/delete.
- `new-meta admin.import` calls it per parsed CSV record — and starts
  passing a real `sourceId` (hash of event name + date + CSV content) so
  re-uploads dedup instead of duplicating.
- `bcp-scraper` calls it per scraped event; keeps its `existingSourceIds`
  pre-filter as a cheap early skip but stops relying on it for correctness.
- The shared function owns the `(source, sourceId)` upsert semantics, the
  single Glicko-2 call (resolving the possible second-implementation flag),
  and the cube trigger (see cube ownership below).
- `startFromPairing` and every operational router are untouched.

**Play-out:** A Rule 3 (DRY) fix wearing a Rule 1 hat — the actual harm here
is three inconsistently-correct copies of write logic, which is a
shared-package problem. Bounded cost: one new `server-core` module (already
home to `updateGlicko2`, `generateId`, `createWorkerHandler`), three
call-site swaps, no schema migration, no operational-router rewrite. Blast
radius: the three writer call sites and their tests only.

**Residual Rule 1 exposure:** two tables of record still exist for "a
tournament" — a literal reading of Rule 1 wants one. This option scopes
compliance to "one write path, one idempotency contract" rather than "one
table," on the grounds that mutable in-flight state and a frozen analytics
ledger are legitimately different data. Flagged explicitly below.

### Option D — Hybrid: Option C now, Option B as a scoped future migration

Do Option C immediately. Track Option B as a follow-on **only if/when**:
(1) metric-stack standings gets wired into `generatePairings` (tournament
census decision #2 — today `round.ts:118` still calls legacy
`computeStandings`), and (2) `startFromPairing`'s bye/in-progress needs are
re-examined against whatever that rework produces. Merging schemas before
the operational side stabilizes risks doing the merge twice.

**Play-out:** Same near-term play-out as C; same long-term risk profile as
B, deferred rather than paid for now against a moving target.

---

## Scores

Weights for this decision: backend data-model work, not a live inference
surface — **Latency** is dropped (no model, no token generation) in favor
of weighting **Risk** and **Effort** higher, per methodology's "weights
differ per decision." Stack fit folded in as general fit-to-existing-pattern
since there's no Ollama/VRAM axis here.

| Option | Fit (solves violation) | Quality (integrity/dedup) | Effort | Risk (blast radius) | Stack fit | Weighted |
|---|---|---|---|---|---|---|
| A — status quo, documented | 1 | 2 | 5 | 5 | 3 | **2.4** |
| B — full unification | 5 | 4 | 1 | 1 (breaks startFromPairing) | 3 | **2.6** |
| C — shared ingestion service | 4 | 5 | 4 | 4 | 5 | **4.4** |
| D — C now, B deferred | 4 | 5 | 4 | 4 | 5 | **4.4** |

Weights (sum 1.0): Fit 0.30, Quality 0.25, Effort 0.20, Risk 0.20, Stack
0.05. C and D tie near-term because D's Phase 1 *is* Option C; D's score
carries B's deferred cost as a named future line item, not a discount.

---

## Recommendation

**Primary: Option D — do Option C now, hold Option B as a named, gated
future step.**

Build one `upsertMetaEvent()` in `packages/server-core`, point
`tournament.exportToMeta`, `new-meta admin.import`, and `bcp-scraper`'s
scrape writer at it, fix `admin.import`'s `sourceId: null` gap in the same
change, and consolidate Glicko-2 into the shared function. This kills the
thing Rule 1's own text complains about — "import/export pipeline between
apps" — without touching the operational tables `startFromPairing` and the
Swiss/metric-stack code depend on.

**Fallback: Option A (status quo, explicitly documented)** if building the
shared function turns up a writer-specific requirement that can't be
generalized cleanly (e.g., bcp-scraper's per-round incremental capture
needing a materially different insert order). In that case, document the
three writers as an accepted exception here with the specific reason,
rather than forcing a bad abstraction.

**Not recommending Option B now.** It's the literal end state Rule 1 wants,
but it's gated on work that hasn't happened (metric-stack pairing wiring)
and its cost is dominated by rewriting the healthiest app in the census.
Doing it early risks merging schemas twice.

---

## Flip triggers

- **Flip to Option B** when metric-stack standings gets wired into
  `generatePairings` *and* a second import source beyond CSV/BCP/native is
  proposed — a 4th ad hoc writer is worse than the operational rewrite once
  the metric-stack precondition has cleared.
- **Flip to Option A** if implementing Option C reveals the three writers'
  data shapes are irreducibly different at the row level, not just
  different call sites (e.g., BCP's per-round fetch can't produce a
  "whole event at once" shape without a costly staging rewrite).
- **Revisit cube ownership sooner than either trigger** if `new-meta` ships
  an admin-surfaced data-freshness indicator — at that point the orphaned
  content-ingestor cube build becomes user-visible, not just internal drift.

---

## Implementation notes

1. **Add `upsertMetaEvent()` to `packages/server-core`** (e.g.
   `packages/server-core/src/meta-ingest.ts`). Accepts
   `{ db, source, sourceId, name, date, location, format, rounds, players, pairings }`;
   does the `(source, sourceId)` delete-then-reinsert (mirroring
   `tournament.ts:366-374`'s existing pattern), inserts the three meta
   tables, then calls one Glicko-2 path. First resolve whether
   `tournament.ts`'s `computeGlicko2ForEvent` (:521-665, uses real opponent
   pairing data) or `admin.ts`'s `updateGlickoForEvent` is the version to
   keep — don't assume; check both.
2. **Type the `db` parameter.** Both existing implementations take
   `db: any` (`tournament.ts:331,521`) — give the shared function a real
   Drizzle type, closing a census-flagged gap in the highest-blast-radius
   code path.
3. **Fix `admin.import`'s dedup gap.** Replace `sourceId: null`
   (`admin.ts:72`) with a deterministic hash of event name + date + CSV
   content so re-imports actually dedup.
4. **Swap the three call sites:**
   - `tournament.ts`: replace `exportToMeta`'s body (`:330-515`) with a call
     to `upsertMetaEvent`; delete `computeGlicko2ForEvent` from this file if
     step 1 confirms it moves into `server-core`.
   - `admin.ts`: replace the per-record insert loop (`:60-101`) with a call
     per parsed CSV record.
   - `scrape.ts`: replace the insert sequence (`:101-220`) with a call;
     keep `existingSourceIds` (`:81-88`) as a cheap pre-fetch skip only.
5. **Update tests in place.** All three sites have existing real-SQLite
   suites (tournament: 100 server tests; new-meta: 6 server files incl. HTTP
   integration; bcp-scraper: 11 files/1596 lines) — point them at the shared
   contract rather than rewriting from scratch.
6. **Resolve cube ownership in the same change**, per root CLAUDE.md's
   "rebuild dependent indexes in the same pass" rule (`CLAUDE.md:221`):
   delete the orphaned `apps/content-ingestor/src/meta/build-cube.ts` and
   trigger cube-build from inside (or immediately after)
   `upsertMetaEvent`, so every writer path keeps
   `meta_for`/`fact_game_results`/`meta_top`/`meta_cube_status` current —
   matching what bcp-scraper's own pipeline already does correctly for its
   source. Closes "new-meta cannot populate its own primary read tables"
   without adding a fourth owner.
7. **Do not touch `apps/game-tracker`.** `startFromPairing` reads only
   operational tables, untouched by this refactor. Smoke-test it manually
   against an in-progress tournament post-change — cheap confirmation the
   boundary was respected, not because the code changed.
