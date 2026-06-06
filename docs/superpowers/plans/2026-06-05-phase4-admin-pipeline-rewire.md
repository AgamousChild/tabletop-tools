# Phase 4 — Admin Pipeline Observability Rewire

> Spec: `docs/superpowers/specs/2026-05-28-admin-pipeline-observability-data-design.md`
> Status: **READY FOR IMPLEMENTATION**
> Dependencies: All Phase 0-3 complete. New tables (`pipeline_source`, `pipeline_item`,
> `pipeline_run`, `pipeline_run_item`) already in `schema.ts` and applied to prod.

---

## Executive Summary

Replace four legacy tracking tables (`bcp_scrape_jobs`, `ingest_jobs`, `ingest_sources`,
`ingest_content`) and a singleton status table (`meta_cube_status`) with the unified
`pipeline_source / pipeline_item / pipeline_run / pipeline_run_item` model that is already
schema'd and seeded. Every pipeline worker writes into the new model; the admin UI reads
from it. Legacy code paths are killed in the same pass as the data migration, so the old
tables can be dropped cleanly.

---

## 1. Build Order

The spec's three-phase build order maps to concrete deliverables as follows.

### Phase A — Data Migration (must complete before any code changes)

**Goal:** All historical data that is worth keeping lands in the new tables before we touch
any running code. Legacy tables remain present in the DB and schema while this runs.

**Deliverables:**

1. **Pre-migration backup** — run `.local/db-backup.mjs` before touching anything.
   Record the backup path in the commit message.

2. **Migration script** `.local/migrate-legacy-pipeline.mjs` — idempotent, dry-run flag,
   prints row counts before/after. Performs all four mappings below in order:

   - `bcp_scrape_jobs` → `pipeline_run` (16 rows). Mapping:
     - `id` → `id`
     - `started_at` → `started_at`
     - `completed_at` → `finished_at` (nullable)
     - `status`: map `'completed'` → `'ok'`; `'running'` → `'ok'` (running at migration
       time means the job was abandoned — treat as ok with no summary); `'failed'` → `'failed'`
     - `events_found` → `found`
     - `events_scraped` → `processed`
     - `errors` → `error`
     - `triggered_by` → `trigger` (values are already `'cron'` / `'manual'` — keep as-is)
       and also → `triggered_by` (same value)
     - `pipeline` = `'bcp-scrape'` (hardcoded)
     - `summary` = derive: `"found {events_found} events, scraped {events_scraped} events,
       {pairings_scraped} pairings"` (derive at migration time from the existing columns)
     - `failed` = `0` (no per-item failure count in old schema)

   - `meta_cube_status` → `pipeline_run` (1 row, id=1). Mapping:
     - Generate a new UUID for `id`
     - `last_started_at` → `started_at`
     - `last_completed_at` → `finished_at`
     - `status`: map `'complete'` → `'ok'`; `'pending'` → `'ok'` (the row exists as
       proof it ran); `'running'` → `'ok'` (same abandoned-job logic)
     - `pipeline` = `'meta-cube'`
     - `trigger` = `'cron'`
     - `triggered_by` = `'cron'`
     - `found`, `processed`, `failed` = `0` (not tracked in old schema)
     - `summary` = `"meta cube rebuilt"`

   - `ingest_jobs` → `pipeline_item` (11 rows) + `pipeline_run` rows. This is the most
     complex mapping because `ingest_jobs` mixed the item and run concerns.
     - **Source lookup**: for each `ingest_jobs` row, match `source_name` against
       `pipeline_source.name` (case-insensitive). If matched, use that source's `id`.
       If not matched, insert a stub `pipeline_source` row with `id = slugify(source_name)`,
       `name = source_name`, `kind = source_type`, `url = url_of_first_ingest_jobs_row_for_that_source`,
       `active = 0` (paused — these are legacy orphaned sources).
     - Map each `ingest_jobs` row to `pipeline_item`:
       - `id` → `id` (keep the same id — content-ingestor may reference these)
       - `source_id` = resolved source id above
       - `title` → `title`
       - `kind`: `source_type = 'youtube'` → `'video'`; `'web'` → `'article'`
       - `external_url` = `url`
       - `external_id` = generate a deterministic slug from the URL (to satisfy the
         `NOT NULL` constraint): `sha1(url).slice(0,16)` is fine, or just use the `id`.
         Actually: use `id` as the `external_id` since it was already stable.
       - `status`: map `'completed'` → `'done'`; `'failed'` → `'failed'`;
         `'pending'`/`'transcribing'`/`'transcribed'`/`'extracting'` → `'queued'`
         (they were mid-flight when the old system stopped)
       - `discovered_at` = `created_at`
       - `processed_at` = `completed_at`
       - `result_summary` = `"{nodes_extracted} brain nodes"` if nodes_extracted > 0, else null
       - `error` → `error`
     - For each batch of `ingest_jobs` rows that share the same `source_name` and
       `source_type`, create one `pipeline_run` row (pipeline=`'content-process'`):
       - `started_at` = min(`created_at`) in the batch
       - `finished_at` = max(`completed_at`) in the batch
       - `status` = `'ok'` if any row is completed, else `'failed'`
       - `found` = count of rows in batch
       - `processed` = count of `completed` rows in batch
       - `failed` = count of `failed` rows in batch
       - `trigger` = `'manual'` (the old ingest jobs were always manual)
       - `summary` = `"processed {processed}/{found} items, {total_nodes} nodes extracted"`
     - Insert `pipeline_run_item` linking each run to its items.

   - `ingest_sources` (0 rows in prod) — nothing to migrate; the table is empty. Skip.
   - `ingest_content` (0 rows in prod) — nothing to migrate; the table is empty. Skip.

3. **Verification step in the script** — after migration, assert:
   - `pipeline_run` count = 16 (bcp) + 1 (cube) + N (ingest batches) ≥ 18
   - All `pipeline_run.pipeline` values are valid strings
   - All `pipeline_run_item.item_id` FK references exist in `pipeline_item`
   - Print the counts so they can be spot-checked.

### Phase B — Code Rewire (all legacy consumers replaced; new tables become truth)

**Goal:** Every read/write path that touched a legacy table now targets the new tables.
This phase must be completed atomically per consumer — don't leave a consumer half-wired.

See Section 4 (Code-Rewire Mapping) for the per-file detail.

**Deliverables:**

1. **`apps/bcp-scraper/server/src/lib/scrape.ts`** — replace `bcpScrapeJobs` imports and
   all DB writes with `pipelineRuns`. The existing `runScrape()` signature and return type
   are unchanged; only the DB write calls change.

2. **`apps/bcp-scraper/server/src/lib/pipeline.ts`** — replace raw `meta_cube_status` SQL
   with `pipelineRuns` writes (insert on start, update on finish/fail).

3. **`apps/content-ingestor/server/src/lib/discover.ts`** — replace `ingestSources` /
   `ingestContent` reads/writes with `pipelineSources` / `pipelineItems`. The discovery
   logic (RSS/web crawl) is unchanged; only the DB layer changes.

4. **`apps/content-ingestor/server/src/lib/process.ts`** — replace `ingestContent` reads/
   writes with `pipelineItems`. Add a `pipeline_run` open/close wrapper around each
   `processDiscovered()` invocation.

5. **`apps/content-ingestor/server/src/lib/ingest.ts`** — replace `ingestJobs` reads/writes
   with `pipelineItems` + `pipelineRuns`. The Gladia callback path (`saveTranscript`,
   `processAfterTranscript`) uses the item's `id` — that's stable and unchanged.

6. **`apps/admin/server/src/routers/stats.ts`** — delete the legacy procedures
   (`ingestSourcesList`, `addIngestSource`, `toggleIngestSource`, `ingestJobs`,
   `bcpScraperStatus`, `bcpScraperHistory`, `triggerDiscover`, `triggerProcess`,
   `triggerYoutubeIngest`, `triggerWebIngest`) and the `pipeline` procedure (which reads
   `meta_cube_status`). Replace with new `pipeline.*` procedures (see Section 4).
   The `bcpScraper` service binding invocation in `triggerBcpScrape` stays — only the
   admin-side read queries change.

7. **`apps/admin/client/src/pages/IngestPage.tsx`** + **`ScraperPage.tsx`** — retire both
   pages. These are replaced by the new `RunsPage`, `QueuePage`, `SourcesPage` pages.
   Remove `ingest` and `scraper` nav items; add `runs`, `queue`, `sources`.

8. **`apps/admin/client/src/App.tsx`** — update `Page` type and `NAV` array.

9. **`apps/admin/server/src/schemas/ingest.ts`** — delete (or repurpose if `addIngestSource`
   schema becomes `addPipelineSource`). The `ZodForm` import chain in the old IngestPage
   uses this schema — it goes away with the page.

### Phase C — Schema Drop (after Phase B is deployed and verified)

**Goal:** Remove legacy tables from `schema.ts`, generate the drop migration, apply it.

**Deliverables:**

1. Remove from `packages/db/src/schema.ts`:
   - `export const metaCubeStatus = sqliteTable('meta_cube_status', ...)`
   - `export const bcpScrapeJobs = sqliteTable('bcp_scrape_jobs', ...)`
   - `export const ingestJobs = sqliteTable('ingest_jobs', ...)`
   - `export const ingestSources = sqliteTable('ingest_sources', ...)`
   - `export const ingestContent = sqliteTable('ingest_content', ...)`
   - The comment block above these (`// === Pipeline observability ... // ingest_jobs / ...`)
     is kept (and refers to the new model); the `// ── BCP Scraper` and
     `// ── Content Ingestor` sections are removed.

2. Run `drizzle-kit generate` — the diff will be five `DROP TABLE` statements.

3. Apply via `.local/apply-pending-migrations.mjs` (the `when` timestamp workaround).

4. Verify: `drizzle-kit generate` → "No schema changes, nothing to migrate". All db tests
   still pass (they will need the `CREATE TABLE` stubs removed from the test beforeAll blocks).

---

## 2. File-Level Changes

### `packages/db`

| File | Change |
|---|---|
| `src/schema.ts` | Phase C: remove 5 table exports (`metaCubeStatus`, `bcpScrapeJobs`, `ingestJobs`, `ingestSources`, `ingestContent`) |
| `migrations/XXXX_drop_legacy_pipeline.sql` | Phase C: generated by drizzle-kit, applied via the workaround script |

### `apps/bcp-scraper/server`

| File | Change |
|---|---|
| `src/lib/scrape.ts` | Phase B: replace `bcpScrapeJobs` import + all `.insert`/`.update` calls with `pipelineRuns`. Open run on start, close on completion/failure. |
| `src/lib/scrape.test.ts` | Phase B: update in-memory CREATE TABLE to match `pipeline_run` DDL; update assertions to read from `pipeline_run` |
| `src/lib/pipeline.ts` | Phase B: replace 4 raw SQL `meta_cube_status` writes with `pipelineRuns` Drizzle calls |
| `src/lib/pipeline.test.ts` | Phase B: update in-memory CREATE TABLE; update assertions to read from `pipeline_run` |
| `src/worker.ts` | Phase B: update doc comment (remove `bcp_scrape_jobs` reference) |

### `apps/content-ingestor/server`

| File | Change |
|---|---|
| `src/lib/discover.ts` | Phase B: replace `ingestSources`/`ingestContent` imports with `pipelineSources`/`pipelineItems`; update all DB calls |
| `src/lib/process.ts` | Phase B: replace `ingestContent`/`ingestSources` with `pipelineItems`/`pipelineSources`; open/close a `pipeline_run` around each batch |
| `src/lib/ingest.ts` | Phase B: replace `ingestJobs` with `pipelineItems` + `pipelineRuns` |
| `src/lib/ingest.test.ts` | Phase B: update in-memory DDL and all assertions |

### `apps/admin/server`

| File | Change |
|---|---|
| `src/routers/stats.ts` | Phase B: delete legacy procedures; add new `pipeline.*` router procedures |
| `src/routers/stats.test.ts` | Phase B: remove `bcp_scrape_jobs`, `ingest_jobs`, `ingest_sources`, `ingest_content` from `beforeAll` DDL; add `pipeline_source`, `pipeline_item`, `pipeline_run`, `pipeline_run_item` DDL; update/add tests for new procedures |
| `src/schemas/ingest.ts` | Phase B: delete, or rename to `pipeline.ts` with `addPipelineSourceSchema` if the "add source" flow is kept in new SourcesPage |

### `apps/admin/client`

| File | Change |
|---|---|
| `src/App.tsx` | Phase B: remove `IngestPage`, `ScraperPage` imports/nav; add `RunsPage`, `QueuePage`, `SourcesPage` |
| `src/pages/IngestPage.tsx` | Phase B: delete |
| `src/pages/IngestPage.test.tsx` | Phase B: delete |
| `src/pages/ScraperPage.tsx` | Phase B: delete |
| `src/pages/ScraperPage.test.tsx` | Phase B: delete |
| `src/pages/RunsPage.tsx` | Phase B: new — Runs feed |
| `src/pages/RunsPage.test.tsx` | Phase B: new |
| `src/pages/QueuePage.tsx` | Phase B: new — Queue (discovered/queued items) |
| `src/pages/QueuePage.test.tsx` | Phase B: new |
| `src/pages/SourcesPage.tsx` | Phase B: new — Sources list with active toggle and item counts |
| `src/pages/SourcesPage.test.tsx` | Phase B: new |

---

## 3. Migration Sequence

### Pre-migration

```bash
node .local/db-backup.mjs
# Record the new backup path — e.g. .local/db-backup-2026-06-05T<time>/
```

The backup at `.local/db-backup-2026-06-05T02-52-54/` already exists as a checkpoint.
Take a fresh one immediately before running the Phase A script.

### Phase A — Data migration script

```bash
node .local/migrate-legacy-pipeline.mjs --dry-run   # review counts
node .local/migrate-legacy-pipeline.mjs              # apply
```

Script is idempotent via `INSERT OR IGNORE` on the target tables. Can be re-run if it
fails partway through.

### Phase B — Code changes

Normal dev cycle: branch → code → tests pass → commit. No migration needed — new tables
already exist. Legacy tables are still present (schema + DB) during this phase, so the
old code can still compile against them while you're working.

### Phase C — Drop migration

After Phase B is deployed and verified against prod:

1. Remove legacy exports from `schema.ts`.
2. `drizzle-kit generate` → review the generated SQL (should be exactly five DROP TABLE
   statements and their index/FK cleanup — no surprises).
3. Apply:
   ```bash
   node .local/apply-pending-migrations.mjs
   ```
   This script handles the `when` timestamp ordering issue with the drizzle journal.
4. Run `drizzle-kit generate` again → confirm clean.
5. Run `packages/db` tests → confirm all pass.

### `when` timestamp pitfall (known workaround)

Each new migration's `when` in the drizzle journal must be strictly greater than the
`when` of the last applied migration. If `drizzle-kit generate` assigns a `when` equal
to or earlier than the last recorded entry in `__drizzle_migrations`, the migrator will
silently skip it. The `.local/apply-pending-migrations.mjs` script handles this: it reads
the last `when`, bumps the new migration's `when` by 1ms if needed, and then applies it.
Do not use `drizzle-kit migrate` directly for Phase C — always go through the workaround
script.

---

## 4. Code-Rewire Mapping

### `apps/bcp-scraper/server/src/lib/scrape.ts`

**Reads now:** `bcpScrapeJobs` (insert on start, update on complete/fail)

**After:**
- On `runScrape()` entry: `db.insert(pipelineRuns).values({ id: jobId, pipeline: 'bcp-scrape', trigger: triggeredBy ?? 'cron', status: 'running', startedAt: Date.now(), triggeredBy: triggeredBy ?? 'cron' })`
- On completion: `db.update(pipelineRuns).set({ status: 'ok', finishedAt: ..., found: events.length, processed: eventsScraped, failed: errors.length, summary: '...' })`
- On failure: `db.update(pipelineRuns).set({ status: 'failed', finishedAt: ..., error: message })`
- **Remove** all `bcpScrapeJobs` import references.
- `listsScraped` had its own column in `bcp_scrape_jobs` — it is not a first-class field in
  `pipeline_run`. Encode it in `summary`: `"found X events, scraped Y events, Z pairings, W lists"`.

### `apps/bcp-scraper/server/src/lib/pipeline.ts` (`runPipeline` function)

**Reads now:** raw `meta_cube_status` SQL (4 direct `db.run(sql\`UPDATE meta_cube_status ...\`)` calls)

**After:**
- At the top of `runPipeline()`:
  ```ts
  const runId = generateId()
  await db.insert(pipelineRuns).values({ id: runId, pipeline: 'meta-cube', trigger: 'cron', status: 'running', startedAt: Date.now(), triggeredBy: 'cron' })
  ```
- Replace `SELECT last_completed_at FROM meta_cube_status WHERE id = 1` with a query on
  `pipelineRuns` ordered by `started_at DESC` where `pipeline = 'meta-cube'` and
  `status = 'ok'` — take `finished_at` of the most recent ok run as the equivalent
  of `last_completed_at`.
- Replace the two `UPDATE meta_cube_status SET status = 'complete' ...` calls with:
  `db.update(pipelineRuns).set({ status: 'ok', finishedAt: Date.now(), summary: '...' })`
- Replace `UPDATE meta_cube_status SET status = 'failed'` with:
  `db.update(pipelineRuns).set({ status: 'failed', finishedAt: Date.now(), error: message })`

### `apps/content-ingestor/server/src/lib/discover.ts` (`discoverContent`)

**Reads now:** `ingestSources` (sources list), `ingestContent` (dedup check + insert)

**After:**
- Replace `ingestSources` import with `pipelineSources`.
- Sources query: `db.select().from(pipelineSources).where(eq(pipelineSources.active, 1))` —
  same query shape.
- Dedup check: `pipelineItems` unique index is `(source_id, external_id)` not URL. Change
  dedup to: extract `externalId` from the URL (for YouTube: the video id `v=` param; for
  web: the URL itself as the external_id), then check `pipelineItems` for that `(sourceId, externalId)`.
- Insert: map to `pipelineItems` columns (see Phase A mapping for field correspondence).
  `kind`: source `type='youtube'` → `'video'`; `type='web'` → `'article'`.
- The function now also needs to open/close a `pipeline_run` for each discovery pass.
  The caller in `worker.ts` likely calls `discoverContent()` directly — wrap it there or
  in a thin `runDiscovery(db)` helper that opens the run, calls `discoverContent`, closes
  the run with the summary.

### `apps/content-ingestor/server/src/lib/process.ts` (`processDiscovered`, `processTranscribed`)

**Reads now:** `ingestContent` (status-gated query), `ingestSources` (join for source type)

**After:**
- Replace all `ingestContent` reads with `pipelineItems`. Status values: `'discovered'`
  stays the same; `'transcribing'`/`'extracting'`/`'transcribed'` → `'processing'`;
  `'completed'` → `'done'`.
- Replace `ingestSources` join with `pipelineSources` join — `type` becomes `kind`.
- Add a `pipeline_run` open/close wrapper in a `runProcess(opts)` helper function (called
  from the worker). `processDiscovered` itself can remain pure (no run concerns) if the
  wrapper handles it.
- `resultSummary` on `pipelineItems`: set to `"{written} brain nodes"` on completion.

### `apps/content-ingestor/server/src/lib/ingest.ts` (`startYoutubeIngest`, `saveTranscript`, etc.)

**Reads now:** `ingestJobs` throughout (insert, multiple status updates, lookup by `gladiaJobId`)

**After:**
- All `ingestJobs` operations map to `pipelineItems`. The `gladiaJobId` field does not
  exist on `pipelineItems`. Two options:
  1. Use the `error` field for interim state (not clean).
  2. Store `gladiaJobId` in `externalId` when kind=`'video'` — but `externalId` is meant
     to be the YouTube video ID, not the Gladia job ID.
  3. Best: add a `gladia_job_id` column to `pipeline_item` in the drop migration (or a
     separate migration before Phase C).
  **Recommended:** add `gladiaJobId TEXT` nullable to `pipelineItems` in `schema.ts` as
  part of the Phase B code changes (before Phase C). Generate a migration for just this
  column addition. This keeps the Gladia callback lookup clean.
- Replace all `ingestJobs` imports with `pipelineItems`.
- The `startYoutubeIngest` function creates a job and returns a `jobId` — the job id is now
  a `pipelineItems` id. The caller in `worker.ts` returns this to the admin as `contentId`.
  Rename the return value to `{ contentId }` for clarity — the admin router's
  `triggerYoutubeIngest` already expects `{ contentId?: string }`.
- Status progression: `'pending'` → `'discovered'`; `'transcribing'`/`'transcribed'`/`'extracting'` → `'processing'`; `'completed'` → `'done'`; `'failed'` → `'failed'`.

### `apps/admin/server/src/routers/stats.ts` — Legacy procedures to delete

| Procedure | Was reading | Action |
|---|---|---|
| `ingestSourcesList` | `ingestSources` | Delete |
| `addIngestSource` | `contentIngestor` service binding | Delete (or repurpose to `addPipelineSource` pointing at `pipelineSources`) |
| `toggleIngestSource` | `contentIngestor` service binding | Delete (or repurpose to `togglePipelineSource` pointing at `pipelineSources`) |
| `ingestJobs` | `ingestContent` + `ingestSources` join | Delete |
| `triggerDiscover` | `contentIngestor` service binding | Repurpose as `pipeline.triggerDiscover` — same binding, different response shape |
| `triggerProcess` | `contentIngestor` service binding | Repurpose as `pipeline.triggerProcess` |
| `triggerYoutubeIngest` | `contentIngestor` service binding | Repurpose as `pipeline.triggerYoutubeIngest` |
| `triggerWebIngest` | `contentIngestor` service binding | Repurpose as `pipeline.triggerWebIngest` |
| `bcpScraperStatus` | `bcpScrapeJobs` | Delete — replaced by `pipeline.recentRuns` filtered to `pipeline='bcp-scrape'` |
| `bcpScraperHistory` | `bcpScrapeJobs` | Delete — replaced by `pipeline.recentRuns` |
| `triggerBcpScrape` | `bcpScraper` service binding | Keep — name it `pipeline.triggerBcpScrape` |
| `triggerMetaPipeline` | (stub only) | Keep as `pipeline.triggerMetaPipeline` (still a stub) |
| `pipeline` (the existing one) | raw SQL `meta_cube_status`, `meta_for`, etc. | Retain the raw cube counts section; remove the `cubeStatus` / `meta_cube_status` query; wire status from `pipelineRuns` instead |
| `listParserStatus` | raw SQL `meta_event_players` | Keep unchanged — not a legacy pipeline table |

### New procedures to add in `stats.ts`

All admin-only procedures:

```typescript
// pipeline.recentRuns({ limit?, pipeline? }) — the Runs feed
//   query: pipeline_run ORDER BY started_at DESC LIMIT limit
//   optional filter by pipeline name
//   returns: id, pipeline, trigger, status, started_at, finished_at, found, processed, failed, summary, error

// pipeline.runItems({ runId }) — drill-down: run → its items
//   query: pipeline_run_item JOIN pipeline_item WHERE run_id = runId
//   returns: item title, status, external_url, result_summary, error

// pipeline.queue({ source?, status?, limit? }) — the Queue
//   default status filter: ('discovered', 'queued')
//   returns: id, title, source name, kind, status, discovered_at, result_summary, error

// pipeline.itemRuns({ itemId }) — drill-down: item → which runs processed it
//   query: pipeline_run_item JOIN pipeline_run WHERE item_id = itemId

// pipeline.sources() — Sources list
//   returns: id, name, kind, url, active, last_checked_at, item count

// pipeline.toggleSource({ id, active }) — direct DB write (no service binding needed)
//   update pipeline_source SET active = active WHERE id = id
```

Note: `addPipelineSource` can proxy to the `contentIngestor` service binding if that
service handles the insert, or it can write directly to `pipeline_source` via the DB.
Given that `pipeline_source` is a regular DB table (not content-ingestor-owned), the admin
should write directly. The content-ingestor service just reads `pipeline_source` — it does
not own it.

---

## 5. Test Plan (Spec Section 6 → Actual Test Files)

### 5.1 Migration applies cleanly

**File:** Not a vitest test — verified manually during Phase A.
- Run `.local/migrate-legacy-pipeline.mjs --dry-run` first, then live.
- Script prints row counts. Verify:
  - `pipeline_run` has ≥ 18 rows (16 bcp + 1 cube + ≥1 ingest batch)
  - `pipeline_item` has 11 rows (from ingest_jobs)
  - All `pipeline_run_item` FKs resolve
  - `drizzle-kit generate` still reports no schema changes after migration (migration was
    data-only, not DDL)

### 5.2 Discovery run inserts `pipeline_item`s with titles + source, writes `pipeline_run`

**File:** `apps/content-ingestor/server/src/lib/discover.test.ts` (new or existing)
- Test: call `discoverContent(db)` with a mocked HTTP fetch that returns a known RSS/HTML.
- Assert: `pipeline_item` rows inserted with correct `title`, `source_id`, `kind`, `discovered_at`.
- Assert: `pipeline_run` row inserted with `pipeline='content-discovery'`, `status='ok'`,
  non-zero `found`, non-null `summary`.

### 5.3 Queue returns `discovered`/`queued` backlog with human titles

**File:** `apps/admin/server/src/routers/stats.test.ts`
- New test: seed `pipeline_source` + `pipeline_item` rows (mix of statuses).
- Call `pipeline.queue()` — assert only `discovered`/`queued` items returned.
- Assert each row has `title` (not just id/URL), `sourceName`, `discoveredAt`.
- Also test the source filter: `pipeline.queue({ source: 'auspex-tactics' })` returns
  only that source's items.

### 5.4 Manual and cron triggers produce identical `pipeline_run` shapes

**File:** `apps/bcp-scraper/server/src/lib/scrape.test.ts` (update existing)
- Two existing test cases (`runScrape` with default trigger and with explicit user id) should
  each create a `pipeline_run` row.
- Assert: both rows have same shape; `trigger` field differs (`'cron'` vs `'manual'`);
  `pipeline` = `'bcp-scrape'` in both.
- **Note:** The test's `beforeAll` DDL block currently creates `bcp_scrape_jobs` —
  replace with `pipeline_run` DDL after Phase B.

### 5.5 Run → items and source → items drill-downs resolve

**File:** `apps/admin/server/src/routers/stats.test.ts`
- Seed: one `pipeline_run`, two `pipeline_item`s, two `pipeline_run_item` link rows.
- Call `pipeline.runItems({ runId })` — assert two items returned with correct titles.
- Seed: two `pipeline_item` rows with same `source_id`.
- Call `pipeline.queue({ source: sourceId })` — assert both items returned.

### 5.6 Counts reconcile

**File:** `apps/admin/server/src/routers/stats.test.ts`
- Seed a run with `found=5`, `processed=4`, `failed=1`.
- Seed 5 `pipeline_item` rows: 4 with `status='done'`, 1 with `status='failed'`.
- Seed `pipeline_run_item` linking all 5.
- Call `pipeline.recentRuns()` — assert the returned run has correct found/processed/failed.
- Assert done-item count matches `processed` (manual reconciliation).

### 5.7 Updated test DDL (all in-memory test files)

These test files have `CREATE TABLE` blocks in `beforeAll` that include legacy tables.
Each must be updated to remove the legacy tables and add the new pipeline tables:

| File | Legacy tables to remove | New tables to add |
|---|---|---|
| `apps/admin/server/src/routers/stats.test.ts` | `bcp_scrape_jobs`, `ingest_jobs`, `ingest_sources`, `ingest_content` | `pipeline_source`, `pipeline_item`, `pipeline_run`, `pipeline_run_item` |
| `apps/bcp-scraper/server/src/lib/scrape.test.ts` | `bcp_scrape_jobs` | `pipeline_run` |
| `apps/bcp-scraper/server/src/lib/pipeline.test.ts` | `meta_cube_status` | `pipeline_run` |
| `apps/content-ingestor/server/src/lib/ingest.test.ts` | `ingest_jobs` | `pipeline_item`, `pipeline_run` |

---

## 6. Risk Register and Rollback

### Risk 1 — `gladiaJobId` lookup in content-ingestor/ingest.ts (HIGH)

The `saveTranscript` callback looks up an in-flight job by `gladiaJobId`. The new
`pipeline_item` table has no `gladia_job_id` column. This will break the Gladia async flow.

**Mitigation:** Add `gladiaJobId TEXT` nullable to `pipelineItems` in `schema.ts` during
Phase B (before Phase C). Generate and apply a focused migration (`0XXX_pipeline_item_gladia`)
before wiring up the Gladia lookup. The field is nullable so it doesn't affect existing rows.

**If missed:** The Gladia callback will 404 — new YouTube items will be stuck at `processing`.
Already-completed items are unaffected.

### Risk 2 — `external_id` NOT NULL constraint on `pipeline_item` (MEDIUM)

`pipeline_item` requires `external_id NOT NULL`. The old `ingest_jobs` had no stable
source-side ID — only a URL. The Phase A migration must derive a stable `external_id`.

**Mitigation:** Use the `ingest_jobs.id` as the `external_id` for migrated items. These
are legacy rows and will never be re-discovered, so the dedup uniqueness constraint
`(source_id, external_id)` will not be violated.

**If missed:** Migration INSERT will fail on NOT NULL. The dry-run step will catch this
before the live run.

### Risk 3 — `meta_cube_status` "last_completed_at" semantic change (LOW)

`runPipeline()` reads `meta_cube_status.last_completed_at` to find events imported since
the last cube build. After Phase B, this reads the `finished_at` of the most recent
`pipeline_run` where `pipeline='meta-cube'` and `status='ok'`. If the Phase A migration
runs before Phase B is deployed, there will be a window where the old code tries to read
`meta_cube_status` and the new code is not yet live.

**Mitigation:** Keep `meta_cube_status` in the DB (and schema) until Phase C. The Phase A
migration only inserts into `pipeline_run` — it does not delete from `meta_cube_status`.
The old `runPipeline()` code continues to work until Phase B is deployed.

### Risk 4 — Admin nav disruption (LOW)

Deleting `IngestPage` and `ScraperPage` immediately removes existing admin functionality.
If Phase B is deployed partially (server done, client not yet), the admin UI will show
blank pages for those nav items.

**Mitigation:** Deploy server and client together. The admin app has no external consumers
of these specific pages. Nav disruption is bounded to the admin dashboard only.

### Risk 5 — `drizzle-kit generate` DROP TABLE order (LOW)

If the five legacy tables have FK relationships that `drizzle-kit` does not correctly order
in the DROP sequence, the migration will fail due to FK constraint violations.

**Mitigation:** Review the generated SQL before applying. The tables to drop are
`ingest_content` (FKs to `ingest_sources`), then `ingest_sources` (must drop `ingest_content`
first). The Drizzle generator should handle this, but verify manually. If ordering is wrong,
edit the generated SQL to put `DROP TABLE ingest_content` before `DROP TABLE ingest_sources`.

### Rollback Plan

**Phase A (data migration):** Rollback = restore from backup. The migration is data-only;
it does not modify the legacy tables. Restoring the `pipeline_run`, `pipeline_item`,
`pipeline_run_item` tables to their pre-migration state (empty, except the 6 seeded sources)
is sufficient. Command:

```bash
# Restore from backup using the db-backup.mjs restore mode (check if it has one)
# or manually DELETING the inserted rows by timestamp
```

Simplest: re-seed `pipeline_source` from scratch (6 seeded sources), DELETE FROM
`pipeline_run`, DELETE FROM `pipeline_item`, DELETE FROM `pipeline_run_item`.

**Phase B (code rewire):** Legacy tables are still in the DB. Revert the commit — old code
still compiles against old tables. Fast rollback with no data loss.

**Phase C (schema drop):** This is irreversible without the backup. Before running Phase C:
- Take a fresh backup.
- Confirm Phase B is stable in prod (let it run for at least one cron cycle of each pipeline).
- If a rollback is needed after Phase C, restore from the pre-Phase-C backup.

---

## 7. Open Questions

1. **`addPipelineSource` — DB-direct or service-binding?** The old `addIngestSource`
   routed through the `contentIngestor` service binding to create the row. Since
   `pipeline_source` is now a plain DB table, the admin can write directly. But the
   content-ingestor may want to validate the source (e.g., resolve the YouTube channel ID)
   before insertion. Confirm whether the new SourcesPage "Add" action should write directly
   to DB or proxy through the ingestor service.

2. **Status values on `pipelineItems` for the Gladia in-flight states.** The old
   `ingest_jobs` had statuses `transcribing` / `transcribed` / `extracting`. The spec's
   `pipeline_item` only has `discovered | queued | processing | done | failed | skipped`.
   Confirm that `processing` subsumes all three Gladia intermediate states (the status
   badge in the UI would show "processing" for all of them). This is the plan's assumption.

3. **`listsScraped` column.** The old `bcp_scrape_jobs` tracked `lists_scraped` as a
   first-class integer. The new `pipeline_run` does not have a lists-specific column —
   it goes in `summary` text. Is that sufficient for the Scraper/Runs page display, or
   does the admin want a structured count?

---

## Ready for Task Generation

- **Phase A (data migration):** Write `.local/migrate-legacy-pipeline.mjs` and run it
  against prod after a fresh backup; verify row counts.
- **Phase B (code rewire):** Per-file rewires for bcp-scraper (scrape.ts + pipeline.ts),
  content-ingestor (discover.ts + process.ts + ingest.ts), and admin (stats.ts + client
  pages); add `gladiaJobId` column to `pipeline_item` via a focused migration.
- **Phase C (schema drop):** Remove 5 legacy exports from schema.ts; generate + apply drop
  migration; update all in-memory test DDL blocks; verify clean drizzle-kit generate.
