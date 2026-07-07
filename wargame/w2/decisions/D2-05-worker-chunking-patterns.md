# D2-05 — A chunking pattern menu for the six Rule 9 hotspots

> W2 Phase B decision. Grounded in the six W2 Phase A censuses
> (`wargame/w2/apps/{admin,new-meta,tournament,bcp-scraper,content-ingestor,brain}.md`)
> and a direct read of the flagged code, 2026-07-06/07.

## Decision

Adopt **one pattern per hotspot CLASS**, not six bespoke fixes, for the Rule 9
violations found across W2's Phase A census. Four classes cover all six
hotspots: **interactive admin mutation**, **scheduled scrape**, **synchronous
ingest handler**, and **cold-start cache**. Each class gets a default pattern
and a named fallback; hotspots map to classes, not to individual solutions.

## Forces

- Six hotspots were found independently by six census agents, each proposing
  its own fix (cursor, queue, GH Actions). Without a shared menu, six PRs
  land six different resumability/observability models for the same
  underlying problem — a Rule 3 violation stacked on the Rule 9 one.
- The one precedent that's actually shipped and been battle-tested is
  **data-import's move to GitHub Actions** (`.github/workflows/sync-data.yml`),
  done after the 1102 CPU-cap incident: raise cpu_ms → chunking flags → move
  to GH Actions → retire the Worker's `/sync` + cron entirely
  (`data-import.md:60-65`, confirmed in git history). `content-ingestor`'s
  `discover-content.yml` independently reinvented the same move for its
  discovery stage. Two apps converged on GH-Actions-for-batch unprompted —
  that's signal, not coincidence.
- Not every hotspot is the same shape. `runLlmEvaluator` is a foreground
  admin action someone watches; `recomputeGlicko` is a destructive backfill
  nobody watches live; `getAllNodes` is a read-path cache problem, not a
  write pipeline. One universal answer is wrong for at least half of these.
- Hobby scale, one operator: Turso is HTTP-based (every DB call is a network
  round trip — why bcp-scraper's per-row inserts are a real cost, not a
  style nit), Cloudflare bill is Free/low-Paid, and Micah carries whatever
  ops burden gets added. New always-on infra (a Durable Object, a Queue with
  its own DLQ) is a standing cost, not a one-time cost.
- Rule 9's own text names the target shape: split into chunks "**that the
  caller orchestrates**." It presumes an external orchestrator (client, cron,
  CI) driving a bounded endpoint — not Queues or Durable Objects by default.
  Anything heavier has to earn its place.

## Options (the pattern menu)

**A — Cursor/offset endpoints, caller-orchestrated.** Endpoint takes
`{cursor, limit}`, does one bounded unit of work, returns `{done,
nextCursor}`; a client button loop or re-invoked cron drives it to
completion. Already half-live: brain's `/index-vectors` takes
`?file=&offset=&limit=` (`worker.ts:1314-1328`, `BATCH_SIZE=50`), and
admin's `runLlmEvaluator` already re-queries `WHERE status='pending' LIMIT
batchSize` each call (`crosswalk.ts:449-454`) so a second call naturally
resumes — nothing currently re-calls it, but the resume model is correct.
Low ops burden (no new binding), resumable by construction, per-call
response gives direct progress.

**B — Cloudflare Queues consumer batches.** Producer enqueues messages; a
separate consumer Worker drains them with built-in retry/DLQ. Right tool for
true independent fan-out at volume (bcp-scraper's per-event/round shape).
Biggest ops-burden jump on the menu — new binding, new consumer Worker, new
DLQ policy, two things to check when something silently stops. Strong
resumability once wired.

**C — Durable Object batch coordinator.** A DO holds cursor/state and
self-schedules chunks via alarms; no external caller needed. Technically
capable but none of the six hotspots need the DO's actual differentiator
(single-writer consistency, WebSocket coordination). Highest ops burden —
would be the platform's first DO, with all the "is this actually working"
uncertainty that implies for one operator. Least observable pattern here
(no per-chunk request/response) unless a status page is also built. Not
recommended for any hotspot; kept on the menu for completeness only.

**D — Offload to GitHub Actions CI.** Move the work off the edge entirely: a
scheduled/dispatched workflow runs on a normal runner (30-min timeout, no
Workers CPU budget), then pushes results back. Proven twice already:
`sync-data.yml` (data-import) and `discover-content.yml` (content-ingestor
discovery). Low ops burden if the logic is already an importable function
(Rule 4) — CI becomes a thin `tsx` wrapper, exactly how `sync-cli.ts` and
`discover.ts` are shaped. Resumability is coarse (job-level, not per-item)
but idempotent design (delete+reinsert, upsert) makes re-runs safe. Good
observability — GH Actions run history and step summaries are already a
repo habit. Free tier (2,000 CI min/mo) comfortably covers weekly/daily jobs.

**E — Accept-with-cap.** Leave the handler synchronous but cap input size so
the worst case provably fits the CPU budget. Zero ops burden, but zero
resumability — an exceeded cap just fails or truncates, the exact situation
Rule 9 exists to prevent. Only defensible where the domain genuinely bounds
the input *and* the cap is stated in code, not assumed.

## Scores

Weights: ops burden and resumability matter most (hobby scale, one
operator); raw scale ceiling matters least (nobody here processes millions
of rows). Ops-burden column is pre-inverted (5 = lowest burden).

| Option | Fit | Ops burden | Resumability | Observability | Scale ceiling | Weighted |
|---|---|---|---|---|---|---|
| A — Cursor/offset | 4 | 5 | 5 | 4 | 3 | **4.4** |
| B — CF Queues | 4 | 2 | 5 | 3 | 5 | 3.5 |
| C — Durable Object | 3 | 1 | 4 | 2 | 5 | 2.6 |
| D — GitHub Actions | 5 | 4 | 3 | 5 | 5 | **4.5** |
| E — Accept-with-cap | 2 | 5 | 1 | 1 | 1 | 2.2 |

(Weighted = mean weighted 2x on ops burden + resumability, 1x on the rest.)

A and D are close and answer different questions: A wins for interactive
work with a human/client in the loop; D wins for unattended batch work. B
earns its cost only at real fan-out volume. C wins nothing here today.

## Recommendation (primary + fallback, per class)

**Class 1 — Interactive admin mutation** (a UI is watching, needs a
reactable response)
Primary: **A** — cursor/offset, client-driven loop or auto-poll.
Fallback: **E** — only if the domain is provably small and the cap is
stated in code and UI.
Flip trigger: if the batch must be all-or-nothing atomic, move the whole
unit off the request path into a background job + status poll (A applied
one level up), not a new pattern.

**Class 2 — Scheduled scrape / fan-out over external APIs**
Primary: **D** — GitHub Actions, matches bcp-scraper's existing cron shape.
Fallback: **B** — only if a single CI run's 30-min wall clock becomes
binding, or per-event retry/DLQ semantics become worth the tooling.
Flip trigger: single-run wall time pushing past ~20 minutes, or a hard
requirement for near-real-time scraping (cron cadence unacceptable).

**Class 3 — Synchronous ingest handler** (fetch→transform→write chain
living inside one HTTP handler)
Primary: **D** for the heavy, unattended half of the chain — matches
content-ingestor's existing split (discovery already moved to CI).
Fallback: **A** for the half that must stay a live Worker endpoint (e.g. a
webhook callback) — keep it thin (record-and-return), defer the actual work
to a cursor-driven follow-up rather than running it inline.
Flip trigger: per-item work needs sub-minute latency after ingest and the
handler can't be decomposed into record+defer — that's when B earns its cost.

**Class 4 — Cold-start cache / read-path full-scan**
Primary: **A applied to the artifact, not the request** — partition the
lookup so only the needed slice is fetched per request; the module-scope
cache already in place amortizes repeat cost within a warm isolate.
Fallback: **E** — keep today's full-scan-and-cache, explicitly documented as
accepted cold-start cost, if the lazy-index rework isn't worth it yet.
Flip trigger: cold-start latency/CPU becomes user-visible (support report,
or a synthetic check crossing a stated threshold).

B and C are not primary for any class today; the flip triggers above name
exactly when B earns its keep. Do not pre-build either speculatively.

## Implementation notes — mapping the six hotspots

**1. admin `runLlmEvaluator`** (Class 1) — `crosswalk.ts:439-610`. Already
90% at pattern A: re-selects `pending LIMIT batchSize` every call, so a
second invocation naturally resumes.
1. Lower the default `batchSize` (currently 50, cap 200) to a value measured
   to fit under ~10s wall time (`N × p95_per_item_latency`), per Rule 9.
2. Change the admin "Run evaluator" button to loop: call, read the result
   counts, call again while a full batch came back, stop on a partial batch.
3. Surface running totals + `errors[]` across the loop (today's UI barely
   renders per-item errors — fix while the loop already inspects them).
4. No server-side resumability change needed — only the cap and the loop.

**2. new-meta `recomputeGlicko`** (Class 1 — DB-only backfill, no external
fan-out) — `admin.ts:113-129`.
1. Add `{cursorEventId?, limit?}`. Guard the `delete()` of `glickoHistory`/
   `playerGlicko` to run only on the first call (no cursor), not every chunk.
2. Select events `WHERE id > cursorEventId ORDER BY date LIMIT limit`
   (verify a stable, unique cursor key before choosing keyset vs. offset).
3. Loop `updateGlickoForEvent` over the page; return `{updated,
   nextCursorEventId, done}`.
4. Drive it from new-meta's Admin page the same way as hotspot 1.
5. Type `updateGlickoForEvent(db: any, …)` properly while touching this.

**3. tournament `exportToMeta` + Glicko** (Class 1; E may be legitimate
here, but state it explicitly) — `tournament.ts:200-202,330-515,521-665`.
1. Verify the real player/pairing ceiling from existing event row counts
   before assuming "it's small" (Rule 0).
2. If comfortably inside budget at today's max event size: adopt **E**
   explicitly — comment on `exportToMeta` naming the assumed ceiling and
   what happens if exceeded (loud failure, not silent partial write).
3. If not comfortable, or the platform expects bigger BCP-passthrough
   events: apply **A** — split into `exportPlayers(cursor)` /
   `exportPairings(cursor)` / `runGlicko(cursor)` chained by `advanceStatus`.
4. Either path: type the `db: any` params properly while touching this.
5. Sequence after the Rule 1 tournament/meta unification decision — if
   native events become meta-table rows directly, `exportToMeta`'s copy step
   may be deleted outright rather than chunked.

**4. bcp-scraper `scrape`** (Class 2) — `lib/scrape.ts` (event loop
`:90-224`, round fan-out `:116-119`, per-row inserts `:181,:207`).
1. Extract `runScrape()`/`runPipeline()`/`parsePendingLists()` into an
   importable CLI entry (Rule 4) — nearly free, the logic is already plain
   functions in `lib/scrape.ts`, not inline in the Hono handler.
2. Add a GH Actions workflow mirroring `sync-data.yml`: same `0 4 * * 1`
   schedule moved off the Worker's `[triggers]` cron, calls the CLI, writes
   straight to Turso.
3. Keep `POST /scrape` as a thin manual-trigger passthrough (admin's
   `triggerBcpScrape`) — either cap it explicitly (E, for "re-scrape one
   event now") or route it through a `workflow_dispatch` too.
4. While extracting, fix the adjacent cheap wins: batch per-row inserts into
   multi-row `insert().values([...])` (material given Turso's HTTP cost),
   and persist per-event `errors[]` on the success path.
5. Do not adopt B yet — volume today is weekly-cron-sized. Revisit per the
   Class 2 flip trigger.

**5. content-ingestor `/ingest` handlers** (Class 3; `cpu_ms` already raised
to 30000, `wrangler.toml:6-7`).
1. This app already demonstrates the split — discovery moved to
   `discover-content.yml`; `process.ts`'s extract/transcribe/embed chain is
   what's still synchronous (cron path and the direct HTTP endpoints).
2. Move `processDiscovered()`'s cron-triggered loop to GH Actions too, if
   the embed step can run off `env.AI` (check whether it needs the Workers
   AI binding specifically or can hit the CF REST API from a runner). If it
   must stay bound to the Worker, apply **A** instead: chunk by `{cursor,
   limit}` over `pipeline_item`/`ingest_content` status.
3. The two synchronous `/ingest/youtube`, `/ingest/web` endpoints are
   manually-triggered from admin's Ingest page — Class 1 shaped: split into
   `POST /ingest/start` (returns a job id) + a resumable chunked chain the
   admin UI polls, rather than leaning on the already-once-raised cpu_ms.
4. Do not raise `cpu_ms` again — the census already flags the 30s raise as
   "relying on the ceiling rather than chunked design," the exact anti-
   pattern Rule 9 exists to stop.
5. Resolve the `ingest_jobs`/`ingest_content`/`pipeline_*` triple before or
   alongside this — don't build cursor logic against a table mid-consolidation.

**6. brain `getAllNodes` + `/index-vectors`** (Class 4 for the cache;
Class 1 for the re-index trigger) — `worker.ts:46-65`, `:1314-1404`.
1. `/index-vectors` already **is** pattern A (`?file=&offset=&limit=`,
   `BATCH_SIZE=50`, per-batch try/catch) — no chunking-model change needed.
   The gap is operational: nothing drives it across all files automatically.
   Add a small CLI (Rule 4) that loops `nodeFiles × offset` until every file
   reports done, and wire it into the existing rebuild/upload/deploy dance.
2. `getAllNodes` is the harder one — a read-path full scan (~25k nodes), not
   a write pipeline, so per-request cursoring doesn't apply. Apply A to the
   *artifact*: partition the manifest lookup so category/faction-scoped
   endpoints (`/browse/unit/:id`, filtered search) fetch only the specific
   `nodes/*.json` file(s) they need, reserving the full scan for endpoints
   that genuinely need the whole graph (`/graph-data`). A data-access
   refactor, not a new endpoint shape.
3. Until that lands, **E** is already what's happening in practice (cache
   absorbs cost after the first request per isolate) — make it explicit
   with a comment on `getAllNodes` so it reads as a decision, not an
   oversight.
4. Flip trigger: corpus is already ~25k nodes/~40 files and growing with
   every ingestion pass — a cold-start complaint or a measured threshold
   crossed moves the lazy-index work off the backlog immediately.

## Flip triggers (summary, all classes)

- **A → E**: domain measured and proven small enough the cap can never
  bind — must be stated in code, not assumed.
- **A/D → B**: independent fan-out volume grows past what a caller loop or
  one CI run comfortably handles, or per-item retry/DLQ becomes necessary.
- **D → B** specifically: GH Actions' 30-min wall clock becomes binding, or
  latency requirements drop below cron cadence.
- **Any → C**: only if a future feature needs the DO's actual differentiator
  (single-writer state, WebSocket fan-out) — never as a chunking mechanism
  alone. No hotspot here justifies it today.
- **E → A/B**: the stated cap gets exceeded in practice, or a known upcoming
  volume change (e.g. a multi-day BCP major) makes it about to be.
