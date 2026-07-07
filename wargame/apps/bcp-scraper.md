# Playbook — bcp-scraper: keep scraping deterministic, LLM only for the parse tail

> **Deliverable.** Confirmation (grounded) that the scraper needs almost
> nothing: the pipeline is already chunked, instrumented, and deterministic.
> The one LLM lane it feeds is the shared list-parse tail (owned jointly with
> the new-meta playbook).
>
> **Status:** drafted 2026-07-06 (loop iteration 10). Grounded this session:
> `server/src/worker.ts` (full read), `server/src/lib/parse-lists.ts` (full
> read); `lib/pipeline.ts` / `lib/scrape.ts` / `lib/list-parser.ts` present
> (not read line-by-line — noted).

## Current state (grounded)

- Hono Worker: `POST /scrape` (SYNC_SECRET-gated) + cron `scheduled` handler →
  `runScrape` (BCP credentials) → `runPipeline(db)` → `parsePendingLists(db)`.
- `parsePendingLists`: SQL-selects rows with `list_text` but no `list_ttt`
  (events after 2026-01-01), **LIMIT 100 per run** (Worker CPU budget —
  Rule 9 honored by design), runs deterministic `parseList(text)`, writes
  JSON + status, returns `{parsed, partial, failed, skipped}` counters.
- Data lands in the shared meta tables (`meta_event_players` etc.) — one
  data model with tournament/new-meta (Rule 1 honored).

## What the wargame concludes

1. **Scraping: no model, affirmatively.** Auth, fetching, pagination, and
   row-shaping are deterministic I/O. An LLM in the scrape path adds
   nondeterminism to the platform's *source of record* — rejected the same
   way tournament pairings were.
2. **Parsing: deterministic-first is already the architecture.** The
   `parseList` + status-counter design is exactly the D08 philosophy
   pre-built. The only addition: the **tail pass** (new-meta playbook §a
   owns the detail) — `partial`/`failed` rows re-parsed by Tier I local
   batch, `parsedBy: 'llm'` tagged, review-queued.
3. **Where the tail pass runs:** NOT in this Worker (a local model isn't
   reachable from Cloudflare, and 100-row chunks are already at the CPU
   budget). It runs as a **T1 local batch job** (D09 runner) reading/writing
   the same Turso tables the Worker uses — same data, different compute lane
   (D07's whole point). The Worker's counters tell the local job how much
   tail exists.

## Plan (thin by design)

1. Read-only grounding completion: skim `lib/list-parser.ts` +
   `lib/pipeline.ts` before the tail job is built (the parse schema must be
   mirrored exactly — one Zod schema shared with new-meta's playbook).
2. Local tail job: `sweepParseTail({limit, minConfidence})` importable + CLI
   (Rule 4), D09 runner, writes `list_ttt` with `parsedBy` tag.
3. **Proof:** counters before/after a sweep; Worker behavior byte-identical
   (it never learns the LLM exists).

## Verification checklist

- [ ] `list-parser.ts` schema mirrored in the shared Zod module (grep: one
      definition).
- [ ] Tail sweep runs locally against Turso; Worker untouched (git diff
      empty under `apps/bcp-scraper/`).
- [ ] Counter deltas + spot-check recorded in the new-meta playbook run log.

## Risks / notes

- BCP credentials stay Worker-side secrets; the local tail job needs only
  Turso credentials — least privilege by construction.
- The 2026-01-01 date floor in `parsePendingLists` is a hardcoded policy
  worth surfacing: if the tail sweep should cover older events, that's a
  deliberate flag on the sweep, not an edit to the Worker's floor.
