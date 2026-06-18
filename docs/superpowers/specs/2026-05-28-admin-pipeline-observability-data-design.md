# Admin Pipeline Observability — Data Model Design Spec

> Status: **DRAFT — for Micah's review.** Data-first.
> Goal: a **self-operating** data pipeline backed by **one coherent, rich dataset** — so at a glance you can see what's running, what it found, what's queued to parse, and what it produced. Human-readable titles, real dates, source info, and a visible to-be-parsed backlog are first-class, not afterthoughts.

---

## 0. Why (one line, then we move on)

Today the pipeline's state is scattered across mismatched, partly-unmigrated tables — `ingest_jobs` (legacy), `ingest_content` + `ingest_sources` (coded but **never migrated to the DB**), `bcp_scrape_jobs`, `imported_tournament_results`, `meta_cube_status`. Each pipeline invented its own shape; none of it composes into a view of "what's going on." We replace the scatter with **one model**.

---

## 1. The model — `source → item → run`

Three core tables. Every autonomous process reports into them, so the admin surface is uniform and rich.

### `pipeline_source` — where work comes from
```
pipeline_source
  id PK                 -- slug, e.g. 'auspex-tactics'
  name                  -- 'Auspex Tactics'  (HUMAN READABLE)
  kind                  -- 'youtube' | 'web' | 'bcp' | ...
  url
  active                -- 1 = crawl/scrape on schedule, 0 = paused
  created_at
  last_checked_at       -- when this source was last crawled (observability)
```
Sources are **data, not a hardcoded dropdown**. YouTube channels, web sites, and BCP are all sources.

### `pipeline_item` — the queue of discrete things (the to-be-parsed backlog)
```
pipeline_item
  id PK
  source_id FK -> pipeline_source
  title                 -- HUMAN READABLE (video / article title)
  kind                  -- 'video' | 'article' | ...
  external_url          -- the thing's URL / external ref
  status                -- 'discovered' | 'queued' | 'processing' | 'done' | 'failed' | 'skipped'
  discovered_at         -- DATE found
  processed_at          -- DATE finished (nullable)
  result_summary        -- what it produced, e.g. '8 brain nodes'
  error                 -- nullable
```
- **The "items TO BE parsed" you wanted** = `status IN ('discovered','queued')`, ordered by `discovered_at`.
- Title, source, and dates are columns — always shown, never just an opaque URL or id.
- Generalizes `ingest_content`; replaces `ingest_jobs`.

### `pipeline_run` — every execution (the "what's going on" log)
```
pipeline_run
  id PK
  pipeline              -- 'content-discovery' | 'content-process' | 'bcp-scrape' | 'meta-cube' | 'brain-rebuild' | 'glicko' | ...
  trigger               -- 'cron' | 'manual' | 'api'
  status                -- 'running' | 'ok' | 'failed'
  started_at
  finished_at           -- nullable while running
  found                 -- counts: items discovered / events scraped / rows built
  processed
  failed
  triggered_by          -- user id, or 'cron'
  summary               -- HUMAN one-liner: 'discovered 12 videos, processed 8'
  error                 -- nullable
```
One run log for the **whole** autonomous system — replaces `bcp_scrape_jobs`, `meta_cube_status`, and every ad-hoc job table. This is how you "see what's going on."

### `pipeline_run_item` — which run touched which item (drill-down)
```
pipeline_run_item
  run_id FK -> pipeline_run
  item_id FK -> pipeline_item
```
Lets a run show "these are the 8 videos I processed," and an item show "processed by the 3am run." (Thin link; optional but cheap.)

---

## 2. Self-operating

- **Cron** fires runs on a schedule: `content-discovery` (crawl active sources → insert new `pipeline_item`s), `content-process` (work the queue), `bcp-scrape`, `meta-cube`, etc. Each writes a `pipeline_run` (trigger=`cron`) and updates the items it touches.
- **Manual** triggers (admin buttons) create the **same** `pipeline_run` rows (trigger=`manual`) — no separate code path.
- So "operates on its own" = cron-driven runs, and because every run and item is recorded, it's fully observable after the fact.

---

## 3. What the admin surface shows (all from this one model)

- **Runs feed** — recent `pipeline_run`s: pipeline, when, status, counts, the human `summary`. *"bcp-scrape · 3:00am · ok · found 12, processed 12."* The at-a-glance "what's going on."
- **Queue** — `pipeline_item`s, default to the to-be-parsed backlog (`discovered`/`queued`): **title**, source name, status badge, discovered date, result summary. Filter by source and status.
- **Sources** — `pipeline_source` list: name, kind, active toggle, item count, **last checked**. Add/pause inline.
- **Drill-downs** — run → its items; source → its items; item → which run processed it.

(The UI is a thin read over the model — the richness is in the data, by design.)

---

## 4. What this replaces

| Old | New |
|---|---|
| `ingest_sources` (unmigrated) | `pipeline_source` |
| `ingest_content` (unmigrated) | `pipeline_item` |
| `ingest_jobs` (legacy, 10 rows) | dropped (migrate any worth keeping → `pipeline_item`) |
| `bcp_scrape_jobs` (15 rows) | `pipeline_run` (pipeline=`bcp-scrape`) |
| `meta_cube_status` | `pipeline_run` (pipeline=`meta-cube`) |
| `imported_tournament_results` (21, raw CSV) | kept as the raw-import artifact; its processing is a `pipeline_run` |

---

## 5. Build order (data first)

1. **Data** — create `pipeline_source` / `pipeline_item` / `pipeline_run` / `pipeline_run_item`; **generate + apply the migration** (the step that was skipped last time); migrate `ingest_content`→item, `ingest_sources`→source, `bcp_scrape_jobs`→run; drop `ingest_jobs`.
2. **Pipelines report in** — content-ingest cron (discovery + process), bcp-scraper, cube build, brain rebuild each open a `pipeline_run`, update items, close the run with a `summary`.
3. **Admin UI** — Runs feed + Queue + Sources, read straight off the model.

---

## 6. Test plan

- Migration applies cleanly to the live DB; the four tables exist and seed sources land.
- A discovery run inserts `pipeline_item`s with titles + `discovered_at` + source, and writes a `pipeline_run` with a summary.
- The queue query returns the `discovered`/`queued` backlog with human titles (never just ids/URLs).
- A manual trigger and a cron trigger produce identical `pipeline_run` shapes (trigger differs only).
- Run → items and source → items drill-downs resolve via `pipeline_run_item` / `source_id`.
- Counts on `pipeline_run` (found/processed/failed) reconcile with the item status changes in that run.
