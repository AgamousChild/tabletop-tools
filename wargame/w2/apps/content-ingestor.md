# content-ingestor — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day. LLM extraction itself owned by W1.

## Purpose

Discovers and ingests external 40K content (YouTube, web articles), extracts
brain knowledge nodes, writes to the brain R2 bucket + Vectorize. **Exists as
three parallel, non-integrated implementations**: a deployed CF Worker, a
large local Node CLI, and a newer local "pipeline" script set.

## Architecture

1. **CF Worker** (`server/`, deployed): entry `worker.ts:310` (fetch +
   scheduled); `scheduled()` runs `discoverContent()` → `processDiscovered()`
   in `ctx.waitUntil` (`worker.ts:313-329`). Discovery via YouTube RSS +
   regex web-link extraction (`lib/discover.ts:74,115`); processing branches
   YouTube→Gladia vs web→fetch+extract (`lib/process.ts:81,99,136`); nodes
   written via `lib/nodes.ts:69`.
   **Dead code in the Worker package:** `lib/ingest.ts`
   (startYoutubeIngest/saveTranscript/processJob/ingestWebArticle against
   `ingestJobs`) imported only by its own test; `test-r2.ts` unmounted.
2. **Local CLI** (`src/cli.ts:33`, Commander): fetch/process/channel/site/
   url/review/commit/list/auto-review/fix/bcp-* — writes drafts to
   `.local/ingest/`, human review, `commit/` promotes into the brain app's
   local nodes dir (`src/types.ts:105`).
3. **Newer pipeline scripts** (`src/discover.ts`, `queue-newest.ts`,
   `process-queue.ts`, `commit-process-queue.ts`): standalone Node scripts
   talking **raw SQL via @libsql/client** to `pipeline_*` tables, "daily
   cron" that is actually run-by-hand locally (depends on yt-dlp).

## Data model

**Three generations of ingest tracking coexist in schema.ts:**
- `ingest_jobs` (`schema.ts:1063-1076`) — dead `ingest.ts` only.
- `ingest_sources`/`ingest_content` (`schema.ts:1078-1109`) — live Worker.
- `pipeline_source/item/run/run_item` (`schema.ts:1116-1198`) — local
  scripts only; comment declares it replaces the others
  (`schema.ts:1112-1113`) but nothing was retired or migrated.

Brain nodes: single flat JSON array `nodes/community.json` in R2,
**read-modify-written wholesale per ingested item** (`nodes.ts:73-97`).
No hardcoded lookup tables in this app's source.

## API surface

Hono (no tRPC): `/health`, `/sources` (GET/POST/PATCH), `/content`,
`/discover`, `/process`, `/ingest/youtube`, `/ingest/web`
(**synchronous full-chain in-handler**), `/ingest/callback`
(**unauthenticated Gladia webhook** — anyone with the URL can inject
transcripts into matching rows), `/jobs`. Cron `0 6 * * *`
(`wrangler.toml:22`).

## Deploy

- Worker with R2 + Vectorize + AI bindings; **`[limits] cpu_ms = 30000`
  already raised** (`wrangler.toml:6-7`) — CPU pressure was already hit.
- **Rule 9:** `/ingest/youtube|web` run fetch → transcribe/extract → R2 RMW →
  embed synchronously in one handler; cron path bounded only by
  `batchLimit=5`, each item a full chain, no chunk checkpointing. Relies on
  the raised ceiling rather than chunked design.

## Shared-package usage

- Worker: `db` (tables), `server-core` (generateId only).
- **Rule 3 violations:** local pipeline scripts bypass `@tabletop-tools/db`
  entirely (hand-written SQL, `process-queue.ts:15,63-73`); slugify+dedup
  logic reimplemented ≥3× (`server/src/lib/nodes.ts:23-34`,
  `src/commit/commit.ts`, `src/commit-process-queue.ts:39-44`); `.env`
  hand-parsing duplicated in two scripts.

## CLAUDE.md drift

**No CLAUDE.md exists for this app.** Closest doc
(`docs/etl-data-pipelines.md:222-306`) is materially stale: claims
manual-only trigger (cron exists), `ingest_jobs` as the live tables (it's
`ingest_content`/`ingest_sources`), and documents `/ingest/process/:id` +
`/test-r2` endpoints that don't exist; cites dead `ingest.ts` functions as
the live pipeline.

## Health signals

- **Test investment inverted:** the two modules actually wired into the live
  Worker (`discover.ts`, `process.ts`) have **zero tests**; dead `ingest.ts`
  has the largest server test file (280 lines). CLI has 19 test files.
- 41 silent `catch {}` blocks across the app. `console.log` debug left in
  the production extract path (`extract.ts:113-119`). No TODO/FIXME.
- Per-item failures correctly marked `failed` with error text in the live
  loops (`discover.ts:54-59`, `process.ts:62-69`).

## Candidate design decision points

1. **Pipeline consolidation** — pick `pipeline_*` as canonical (the schema
   comment already declares intent), retire `ingest_jobs` AND migrate the
   Worker off `ingest_content`; one tracking system, not three.
2. **Crawl-frontier model** — visited-set/pagination/backoff vs today's
   fragile "refetch homepage daily" RSS/regex scraping.
3. **community.json monolith** — per-node R2 objects or a DB table vs
   full-file read-modify-write per item (race/contention/cost as it grows).
4. **Dedup strategy** — title-slug identity today (typos → silent dupes);
   content-hash or embedding-similarity alternatives.
5. **Queue-backed ingestion** — CF Queues instead of synchronous handlers,
   given cpu_ms was already raised once (Rule 9).
6. **Local-only stages** — port pipeline scripts into the Worker (lose
   yt-dlp) vs retire the Worker cron in favor of a properly scheduled local
   runner; today "daily cron" means "whoever remembers to run it."
