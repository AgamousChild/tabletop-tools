# content-ingestor — W2 Phase C per-app design verdict

> Grounded in `wargame/w2/apps/content-ingestor.md` (Phase A census) and Phase
> B decisions D2-03, D2-05, D2-06, D2-08, D2-09. Code re-verified directly
> 2026-07-06 in this worktree: `packages/db/src/schema.ts:1063-1198`,
> `apps/content-ingestor/server/src/worker.ts` (full file, 330 lines),
> `apps/content-ingestor/server/src/lib/{discover,process,nodes}.ts` (full
> files), `apps/content-ingestor/src/{cli.ts,discover.ts,queue-newest.ts,
> process-queue.ts,commit-process-queue.ts,add-item.ts}`, and
> `.github/workflows/discover-content.yml`. LLM extraction quality (the
> `extract.ts` prompt/model choice) is W1's; this verdict is pipeline
> architecture only.

---

## 1. Verdict

**Redesign.** The strongest redesign candidate in the W2 roster, and the
evidence supports saying so plainly: content-ingestor does not have one
pipeline with rough edges — it has **three independently-running
implementations of the same job**, two on **overlapping daily cron
schedules writing to different table families**, plus a fourth acquisition
surface (`cli.ts`'s `channel`/`site`/`url` commands) that touches neither
database and instead reads/writes local JSON manifests.

- **Path 1 — deployed CF Worker.** `scheduled()` (`worker.ts:313-329`) fires
  `0 6 * * *` (`wrangler.toml`), discovers via YouTube RSS regex-parsing +
  single-page homepage regex-scraping (`lib/discover.ts`), writes to
  `ingest_sources`/`ingest_content`. No yt-dlp, no pagination, no cutoff date.
- **Path 2 — GitHub Actions + local pipeline scripts.** `discover-content.yml`
  fires the **same** `0 6 * * *` cron, running `npx tsx src/discover.ts` — a
  409-line script with real pagination (`MAX_PAGES = 5`), a 2026-01-01
  cutoff, per-source fetch budgets, and yt-dlp for upload-date resolution —
  writing to `pipeline_source`/`pipeline_item`. The workflow's own header
  comment admits processing can't run in CI ("depends on Ollama"), so
  `queue-newest.ts`/`process-queue.ts` are **run by hand, whenever Micah
  remembers**.
- **Path 3 — `cli.ts`'s `channel`/`site`/`url` commands.** A third, older,
  fully-manual acquisition surface writing drafts to `.local/ingest/` and
  local `manifest.json` files under `config.dataDir`, never touching either
  `ingest_*` or `pipeline_*`.
- **Dead weight riding alongside:** `lib/ingest.ts` (`ingest_jobs` schema
  generation) has zero production importers — `worker.ts` never imports it —
  yet its test file is the largest in the server package (280 lines, more
  than `discover.ts`+`process.ts` combined at 342 source lines with zero
  tests between them).

No other app in the census has two live cron schedules racing each other
against different schema generations for the same job. That's a redesign
signal, not a refactor backlog — the fix is "pick one pipeline and delete
the other two," not "harden the one we have." Everything below assumes that
consolidation decision is made first; nothing else here is worth doing
against a system that might be deleted next quarter.

---

## 2. App-local decision points wargamed

### (a) Which pipeline becomes canonical

**Option 1 — Worker (`ingest_content`/`ingest_sources`) canonical; retire
the local `pipeline_*` scripts.** Loses: yt-dlp upload-date resolution
(Workers can't shell out), the local scripts' pagination/cutoff/budget cap
(all absent from `lib/discover.ts`, which fetches one page/one RSS window
and stops), and the Playwright-based web crawler
(`crawlers/playwright-web.ts`) that handles JS-rendered sites the Worker's
regex-only `discoverWeb` (`lib/discover.ts:115-159`) cannot. Gains: single
schedule, already deployed with R2/Vectorize/AI bindings and the Gladia
webhook target. Throws away the more capable discovery logic to keep the
less capable one, purely because it's already on the edge.

**Option 2 — local `pipeline_*` scripts canonical; Worker keeps only
webhook receipt + R2/Vectorize writes.** Loses: unattended discovery still
runs (GH Actions), but *processing* gains no unattended path at all —
Ollama is a local-machine dependency, not CI/edge. Also breaks admin's
manual-ingest button, since `/ingest/youtube`/`/ingest/web` are the Worker's
today. Gains: the schema the codebase's own comment declares intent to
consolidate onto (`schema.ts:1112-1113`); the composite dedup key
(`uq_pipeline_item_source_external` on `(sourceId, externalId)`), strictly
better than `ingest_content`'s bare `url` unique constraint (survives
tracking-param/protocol variants); pagination, cutoff, yt-dlp accuracy.
Better discovery model, but trades "fragile discovery" for "no unattended
processing at all."

**Option 3 — Hybrid split by capability.** Discovery runs wherever yt-dlp/
Playwright/pagination live (local scripts, GH-Actions-driven); processing
(transcribe/extract/write-to-brain) stays a Worker-callable chain, invoked
either by the Worker's own cron over `pipeline_item` or a CI step calling
the same importable function. Loses nothing structural — additive
complexity (two runners, one schema), not a lost capability; costs more to
build since code has to move, not just a cutover flag. Gains: discovery
keeps pagination/cutoff/yt-dlp without asking a Worker to do what Workers
can't; processing gets a real unattended path via D2-05 Class 3's own
recommendation for this exact hotspot (GH Actions for the heavy half, thin
Worker endpoint for the webhook half).

**Scores** (Effort/Risk weighted highest — this is the gating decision
everything else sits behind):

| Option | Fit | Effort | Risk | Notes |
|---|---|---|---|---|
| 1 — Worker canonical | 2 | 4 | 3 | Cheapest to declare; discards the stronger discovery model and the only composite dedup key |
| 2 — pipeline_* canonical | 4 | 3 | 3 | Better schema/discovery; zero unattended processing path; breaks admin's manual-ingest endpoints unless replaced |
| 3 — hybrid split by capability | 5 | 2 | 3 | Keeps every proven capability; most implementation work; matches D2-05 Class 3's recommendation |

**Recommendation: Primary Option 3, fallback Option 2** if the Ollama
dependency is replaceable by a CF Workers AI model (check whether
`extract.ts`'s LLM call can run against `env.AI` directly — if so,
processing runs as a GH Actions step exactly like discovery does today,
collapsing Option 3 into Option 2 minus its gap). **Flip trigger:** if the
extract step is confirmed portable to a CI-callable path, skip straight to
Option 2 — don't build Option 3's Worker-side processing loop if it's about
to be redundant.

Either way: **do not resolve this by adding a fourth implementation.** The
census listed "wire pipeline scripts into the Worker" and "retire the
Worker cron" as separate options — they're the same decision (which runner
owns which stage), not two independent knobs.

### (b) `community.json` monolith

**What's in code today** (`lib/nodes.ts:69-137`): `bucket.get()` the whole
`nodes/community.json` array, dedup new nodes in memory against a `Set` of
existing ids, concatenate, `JSON.stringify`, `bucket.put()` back. **No
ETag, no conditional write (`onlyIf`), no lock.** `/ingest/web` and
`/ingest/youtube` are synchronous awaited HTTP handlers and `scheduled()`
calls the identical function — two overlapping writers can both read the
same starting array and the second `put()` silently discards the first's
additions. This is a live correctness bug: it needs no unusual timing, just
a manual admin-triggered ingest firing during the 6am cron window.

| Option | What it is | Fit | Effort | Risk |
|---|---|---|---|---|
| A — Keep-with-lock | R2 conditional write (`onlyIf: {etagMatches}`) + retry-on-conflict; no schema change | 3 | 5 | 3 (closes the race; file still grows unbounded) |
| B — Per-node R2 objects | `nodes/community/<id>.json` per node; brain lists/merges the prefix | 4 | 2 | 4 (no RMW race by construction; brain's `getAllNodes` full-scan cost per D2-05 Class 4 would need to enumerate this prefix too) |
| C — DB table | `community_nodes` table in `packages/db`; brain queries instead of reading R2 JSON | 5 | 2 | 5 (matches Rule 1/6; queryable/indexable; bigger blast radius — touches brain's read path) |

**Recommendation: Primary Option A immediately** — same urgency class as
D2-06's game-tracker/no-cheat R2 data-loss bugs, just not yet flagged there
because the census read this as "cost as it grows" rather than "race
today." **Long-term: Option C**, sequenced behind decision (a) — don't move
brain's node storage model while this app's writer is still split across
two schemas. **Fallback: Option B** if Option C's cross-app blast radius is
judged too large to take on alongside consolidation.

### (c) Dedup strategy

Three dedup mechanisms exist today. `ingest_content`/`ingest_sources`: a
plain SQL `unique()` on the full `url` column (`schema.ts:1081,1091`) — a
tracking-parameter or protocol change double-inserts. `pipeline_item`: a
composite `uniqueIndex` on `(sourceId, externalId)` (`schema.ts:1154`) —
genuinely better, survives URL variance since the key is the source-side
stable id. The brain-node write path (`nodes.ts`): **title-slug identity**
(`slugify(title)` → `community:<slug>`, `nodes.ts:23-28,38`, dedup at
`:85`) — two sources producing a node with a coinciding title collide and
the second is silently dropped, even without a typo. This slugify function
is reimplemented byte-identically in three places (`nodes.ts:23-28`,
`src/commit/commit.ts:27`, `src/commit-process-queue.ts:39`) — a D2-07
duplication already scoped for extraction into `server-core`'s `slug.ts`
(D2-07 item 2), just not yet executed.

Options for the node-identity layer specifically (source-tracking dedup at
(a)'s two DB tables is solved enough once consolidation picks one):

| Option | Fit | Effort | Risk |
|---|---|---|---|
| Title-slug (status quo) | 2 | 5 | 2 — silent collisions on any title coincidence, no signal |
| Content-hash (hash of `content`/`summary`) | 4 | 3 | 4 — catches true dupes regardless of title; misses paraphrased near-dupes |
| Embedding-similarity (cosine vs. existing node vectors) | 5 | 2 | 3 — embeddings already computed for Vectorize in the same function; needs threshold tuning against false-positive merges |

**Recommendation: Primary embedding-similarity** — the embedding step
already runs in `nodes.ts`, so a similarity check is one extra Vectorize
query, not a new stage. **Fallback: content-hash** as a cheap exact-match
first pass if threshold tuning proves fiddly (the two combine fine: hash
first, embedding second). **Do not ship a fix that keeps title-slug as the
only signal** — extract the shared `slug.ts` per D2-07 regardless, since
slug generation still matters for the node `id` format even after dedup
logic moves.

### (d) Crawl frontier

The Worker's `lib/discover.ts` has no pagination, no cursor, no
visited-set beyond a per-candidate `SELECT` against `ingest_content.url`
inside the loop (`discover.ts:33-40`) — every cron tick re-fetches the
YouTube RSS window (~15 entries) and the single configured homepage URL
from scratch. The local CLI's `src/discover.ts` is materially better: real
pagination (`MAX_PAGES=5`, walking `/page/N/`), a hard cutoff date
(`CUTOFF_UNIX`, 2026-01-01), a per-source fetch budget
(`MAX_DATE_FETCHES_PER_SOURCE=100`), and an idempotent
`ON CONFLICT (source_id, external_id) DO NOTHING` upsert.

This isn't really an independent fork — the better model already exists
and already runs (via GH Actions) today. It's entirely subsumed by (a):
whichever runner becomes canonical for discovery carries the local
scripts' frontier model forward. Scoring it standalone would double-count
(a)'s analysis.

### (e) Test-investment inversion — minimum floor before any refactor

Confirmed inversion, precisely: `discover.ts` (159 lines) and `process.ts`
(183 lines) — the modules actually wired into the live Worker, 342 lines
combined — have **zero tests**. The dead `lib/ingest.ts` (196 lines, zero
production importers) has a 280-line test file, the largest in the server
package. The local pipeline scripts GH Actions actually invokes daily —
`discover.ts` (409), `queue-newest.ts` (211), `process-queue.ts` (221),
`commit-process-queue.ts` (172), `add-item.ts` (211) — 1,224 combined lines
constituting the currently-operating production pipeline — also have
**zero tests**, while the CLI's older, partially-superseded
`channel`/`site`/`url`/`bcp-*` commands carry 20 test files / 3,225 lines.

Per root CLAUDE.md's TDD rule (exploratory pipelines: test after the shape
stabilizes, not before), the floor isn't exhaustive pre-refactor coverage —
it's a characterization test for anything the consolidation could silently
break:

1. `lib/discover.ts`'s dedup check and `lib/process.ts`'s branch logic
   (`sourceType === 'youtube'` vs. implicit web fallback) — zero-tested,
   both in the consolidation's blast radius. Write first, real in-memory
   SQLite, no mocked DB.
2. `writeNodesToBrain`'s dedup-by-id + R2 RMW shape — already has
   `nodes.test.ts` (155 lines); confirm it exercises the race/dedup logic
   from (b)/(c), extend rather than duplicate.
3. The local `discover.ts`'s pagination/cutoff/budget logic — the most
   sophisticated and least-tested code in the app; whichever option in (a)
   carries it forward should not carry it forward untested.
4. Do **not** invest further in `ingest.ts`'s test file — slated for
   deletion per D2-03/D2-09.

---

## 3. Cross-cutting obligations (D2-03/05/06/08/09 shares)

- **D2-03 (legacy retirement):** content-ingestor is one of D2-03's four
  founding instances. `ingest_jobs`/`lib/ingest.ts` is **safe to delete
  today, zero risk, zero callers** — do this now, independent of which
  pipeline wins consolidation. The `ingest_content`/`pipeline_*` choice is
  explicitly **not** a same-day flag flip per D2-03 — it's routed here, to
  decision (a), resolved above (hybrid, Option 3 primary).
- **D2-05 (Worker chunking, Class 3):** already names
  `/ingest/youtube`/`/ingest/web` as Class 3 and recommends GH Actions for
  the heavy half, a thin record-and-defer Worker endpoint for the webhook
  half. Decision (a)'s Option 3 is the same conclusion reached
  independently — convergence, not coincidence. **Do not raise `cpu_ms`
  again** — already raised once (30000), and a second raise is the exact
  anti-pattern Rule 9 exists to stop.
- **D2-06 (silent-failure policy):** two direct hits. `POST
  /ingest/callback` has **zero auth** — no header/secret/signature check
  before processing an attacker-suppliable `gladiaJobId` and writing its
  `transcript`/`status` into matching rows. Fix **immediately**,
  independent of consolidation — it's a live security defect, not an
  architecture question. The 41 silent `catch {}` blocks get the
  `// DEGRADE-OK:` comment-token treatment under D2-06's lint-gate rollout
  on its own timeline, against whichever pipeline survives.
- **D2-08 (doc drift):** content-ingestor has **no CLAUDE.md** — one of
  only two apps in that state. D2-08 names writing it from scratch,
  grounded in the census, as an immediate-sweep item, rather than trusting
  the stale `docs/etl-data-pipelines.md` (documents dead `ingest.ts` as
  live, claims manual-only trigger when a cron exists, cites endpoints —
  `/ingest/process/:id`, `/test-r2` — that don't exist). **Write the
  CLAUDE.md after decision (a) lands**, not before — writing it today
  either documents a pipeline about to be deleted or requires a rewrite.
  A stopgap fix to `docs/etl-data-pipelines.md`'s two most actively-wrong
  claims (cron exists; live tables are `ingest_content`/`ingest_sources`)
  is cheap and doesn't need to wait.
- **D2-09 (dead-subsystem disposition):** item 4 is `ingest.ts` +
  `test-r2.ts`, verdict **delete**. D2-09 explicitly gates dropping the
  `ingest_jobs` schema table on this app's own consolidation decision —
  code deletion can proceed now; the schema drop waits for decision (a),
  so a table drop doesn't conflate "dead generation" with "generation
  being actively migrated."

---

## 4. Ordered work plan

Sequencing matters because decision (a) gates nearly everything else.
Building dedup/frontier/community.json fixes against a pipeline about to
be retired wastes the work twice.

1. **Ship independently, right now:**
   - Delete `lib/ingest.ts`, `ingest.test.ts`, `test-r2.ts` (the
     `ingest_jobs` table drop waits for step 3, per D2-09's gate).
   - Add auth to `POST /ingest/callback` (shared secret or signature check)
     — a live security defect (D2-06).
   - Fix the R2 race in `nodes.ts` with conditional write / retry-on-
     conflict (decision (b), Option A) — a live data-loss bug under
     realistic overlap, same-file patch, nothing downstream depends on it.
   - Correct `docs/etl-data-pipelines.md`'s two most-wrong claims (cron
     exists; live tables are `ingest_content`/`ingest_sources`) as a
     stopgap ahead of the full CLAUDE.md.
2. **Write the characterization tests (decision (e))** for `discover.ts`,
   `process.ts` (server), and the local `discover.ts`'s pagination/cutoff/
   budget logic before touching any of them in consolidation work — the
   regression harness the redesign needs.
3. **Decide and execute pipeline consolidation (decision (a)).** Primary:
   Option 3 — the local scripts' frontier model becomes the only discovery
   implementation (retire the Worker's regex/RSS-only `lib/discover.ts`);
   resolve processing's unattended-execution gap by confirming whether
   extraction can run off a CI-callable path (flip to Option 2 if yes) or
   building the Worker-side chunked processing loop against
   `pipeline_item` (if no). This is the point where `ingest_content`/
   `ingest_sources` retire and D2-09's `ingest_jobs` table drop executes.
4. **After consolidation:** extract the shared `slug.ts` into
   `server-core` (D2-07 item 2) against the surviving pipeline's node-write
   path, then layer the dedup upgrade (decision (c), embedding-similarity
   primary) on top. Doing this before step 3 risks building it twice.
5. **community.json long-term fix (decision (b), Option C)** — sequenced
   behind step 3, since it's a bigger blast-radius change (touches brain's
   read path) best done once there's exactly one writer into the pipeline.
6. **Write `apps/content-ingestor/CLAUDE.md` from scratch** (D2-08) once
   step 3 resolves — documenting the pipeline that actually exists.
7. **Ongoing, no fixed sequencing:** sweep the 41 silent `catch {}` blocks
   under D2-06's lint-gate rollout against the surviving pipeline's code.
