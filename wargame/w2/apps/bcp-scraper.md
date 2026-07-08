# bcp-scraper — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day.

## Purpose

CF Worker that scrapes tournament results (events, pairings, army lists)
from the BestCoastPairings REST API into the shared Turso DB, then
incrementally rebuilds the time-dimensioned analytics cube used by new-meta.

## Architecture

Server-only (no client dir). Entry `server/src/worker.ts`: `POST /scrape`
(optional Bearer `SYNC_SECRET`, :39-62), `GET /health`, `scheduled()` cron
`0 4 * * 1` (:71-85). Both run the same 3-stage pipeline sequentially:
`runScrape()` → `runPipeline()` → `parsePendingLists()`.

Key modules: `lib/scrape.ts:42-251` (job row, Cognito auth, BCP API,
faction normalize, meta_* writes); `lib/cognito.ts:15-73` (OAuth2 code
flow); `lib/bcp-api.ts:105-172` (REST client); `lib/faction-map.ts:17-32`
(DB-backed, cached); `lib/detachment-map.ts:26-55` (**unused**);
`lib/pipeline.ts:198-349` (cube builder); `lib/parse-lists.ts:10-51` +
`list-parser.ts`/`format-detector.ts`/`gw-parser.ts`/`bs-parser.ts` (army
list parsing → `TTTPackage`).

**Hand-rolls its own `cachedApp`/`getApp()`** (`worker.ts:30-33,64-66`)
instead of server-core's `createWorkerHandler` (Rule 3 — the caching half of
that factory applies even without tRPC/auth).

## Data model

Owns/writes: `bcp_scrape_jobs` (**`lists_scraped` never set**,
`scrape.ts:227-235`), `meta_events`/`meta_event_players`/`meta_pairings`,
`meta_for`/`fact_game_results`/`meta_top`/`meta_cube_status`. Reads
`dim_faction*` via `packages/db/src/factions.ts` (Rule 6 compliant).

- JSON columns: `meta_event_players.list_text` + `.list_ttt`.
- **Rule 6 concern:** `gw-parser.ts:5-59` hardcodes `FACTION_NAMES` (28) +
  `SUBFACTION_NAMES` (22) as parsing heuristics — second source of truth for
  names that already live in `dim_faction`/`dim_subfaction` (does fall back
  to the DB map first via `factionToSlug`, :95-100).
- **Dead pipeline half:** `bcp-api.ts` captures `listId` per player but
  `runScrape` never fetches/stores list text — `list_text` is never
  populated by this app, so **`parsePendingLists` + the entire ~800-line
  list-parsing subsystem is currently a no-op against production data**.
  `detachment_id` hardcoded to `null` at insert (`scrape.ts:187`);
  `extractDetachment()` never called from the live flow.

## API surface

Hono, no tRPC: `/health`, `POST /scrape`, cron. No queues.

## Deploy

`wrangler.toml`: worker `tabletop-tools-bcp-scraper`, `nodejs_compat`,
weekly cron, no `[limits]`, no R2/D1/KV bindings — env vars only
(TURSO_*, BCP_EMAIL/PASSWORD, SYNC_SECRET).

**Rule 9 risk:** one invocation fans out unboundedly — per event, per round
HTTP call (`for round 1..event.rounds`, `scrape.ts:116-119`), then one
`await db.insert()` per player and per pairing (:181, :207) — no batching,
no per-event chunk boundary, no retry unit. `parse-lists.ts:17-26` is the
only self-limiting stage (LIMIT 100, "Worker time budget" comment).

## Shared-package usage

`db` (tables + faction helpers), `server-core` (**generateId only** — see
hand-rolled bootstrap above), hono, libsql.

## CLAUDE.md drift

**No CLAUDE.md exists** for this app. Closest doc
`docs/etl-data-pipelines.md:148-219` is largely accurate (function/line refs
matched) EXCEPT it documents stage 3 (`parsePendingLists` on
`meta_event_players.list_text`) as if data flows there — it never does (see
dead pipeline half above).

## Health signals

- 11 test files, 1596 lines — thorough, correctly real-SQLite + mock
  external APIs only. No TODO/FIXME.
- **Error visibility gap:** per-event errors are collected (`scrape.ts:92,
  175-179, 221-223`) but only written to `bcp_scrape_jobs.errors` on the
  top-level failure path — partial failures inside a "completed" job are
  invisible in the DB.
- Sequential per-row inserts throughout scrape + pipeline — DB round-trips
  scale linearly with players/pairings/frames (Turso is HTTP-based).
- `pipeline.ts` builds frame IDs into raw SQL strings via `sql.raw()` —
  nanoid-derived so not injectable in practice, but fragile pattern.

## Candidate design decision points

1. **Chunk the scrape (Rule 9)** — per-event/per-round sub-invocations
   (queue or `/scrape/:eventId` enumerated by cron) vs single fan-out that
   grows with tournament volume.
2. **Wire up list scraping or delete the parser subsystem** — either fetch
   list text via the captured `listId` and populate `list_text`, or park
   ~800 lines of parsing + tests that nothing feeds.
3. **Batch DB writes** — multi-row `insert().values([...])` vs per-row
   awaits (material on HTTP-based Turso).
4. **Persist per-event errors on the success path** — thread `errors[]`
   into the completed-job update.
5. **Adopt `createWorkerHandler`** for isolate caching vs bespoke bootstrap.
6. **Load gw-parser name lists from `dim_faction`/`dim_subfaction`** at
   parse time — kill the second source of truth (new faction = DB insert,
   not code change).
