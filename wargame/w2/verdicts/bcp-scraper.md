# bcp-scraper — W2 Phase C per-app design verdict

> Grounded in `wargame/w2/apps/bcp-scraper.md` (Phase A census) and Phase B
> decisions D2-01, D2-04, D2-05, D2-06, D2-07, D2-08, D2-09. Code re-verified
> directly 2026-07-06: `server/src/worker.ts`, `lib/scrape.ts`, `lib/cognito.ts`,
> `lib/bcp-api.ts`, `packages/server-core/src/worker.ts`, `packages/db/src/client.ts`.
> Non-LLM scope.

---

## 1. Verdict

**Refactor.** The app's shape is right (Hono Worker, cron + manual trigger,
3-stage pipeline) and its test suite is real (11 files / 1596 lines, real
SQLite, no TODOs) — nothing here calls for a redesign. But it carries five
concrete, independently-fixable defects (unbatched writes, silent partial
failure, hand-rolled bootstrap, a second faction-name source of truth, an
unbounded per-event/round fan-out) that six of the seven Phase B decisions
already scoped fixes for. This app is a rollup of cross-cutting debt, not a
novel problem — the work is applying already-decided patterns, not inventing
new ones.

---

## 2. App-local decision points wargamed

### (a) Batch multi-row inserts vs per-row awaits

**What's in code today** (`scrape.ts`): every player insert (`:181`) and
every pairing insert (`:207`) is its own `await db.insert(...).values(...)`
inside a `for` loop. No `insert().values([...])` batching anywhere in the
scrape path.

**Why it matters here specifically.** `packages/db/src/client.ts:1,11` wires
Drizzle to `@libsql/client`'s `createClient` — for a deployed Worker this
resolves to Turso's remote HTTP transport, not a local file handle. Every
`db.insert()` is a full HTTP round trip (TLS handshake amortized by
keep-alive, but request/response framing + auth on every call). A single
multi-row `insert().values([rows])` is one round trip regardless of row
count (up to libSQL's statement size limits, which a single event's player/
pairing counts never approach).

**Quantified for a typical event.** BCP GTs matching this scraper's search
filter (`minPlayers: 20, minRounds: 5`, `scrape.ts:76-77`) are ≥20 players,
≥5 rounds. Player inserts: 1 round trip × player count (≥20). Pairing
inserts: 1 round trip × (players/2) × rounds (≥10 × 5 = 50). **Total: ≥70
sequential awaited round trips per event**, serialized (no `Promise.all`).
Batched: **2 round trips** (one `values([...])` for players, one for
pairings) — a **~35x reduction** for the minimum-size event this scraper
targets, scaling linearly (a 128-player/8-round major is ~640 vs. 2).

At Turso's typical HTTP latency (tens of ms/call, worse under edge-to-region
jitter), this is real wall-clock cost stacking toward the per-invocation
ceiling — and it multiplies across the `newEvents` loop (`:94`), so a
weekly cron catching 5-10 events compounds it 5-10x in one invocation.

**Options:**

| Option | Fit | Effort | Risk | Notes |
|---|---|---|---|---|
| A — Leave per-row (status quo) | 1 | 5 | 2 | Simplest to read, worst round-trip cost; compounds with D2-05's chunking work since more round trips per event pushes toward the CPU ceiling sooner |
| B — Batch player inserts + batch pairing inserts (2 calls/event) | 5 | 4 | 4 | Straightforward `values([...])` swap; `playerIdMap` build (needs generated IDs before insert) already computes IDs upfront (`:167-170`), so batching doesn't change control flow, just collects rows into an array first |
| C — Batch via D2-01's shared `upsertMetaEvent()` | 5 | 3 (once D2-01 lands) | 3 | Best long-term: batching becomes the shared function's problem, not bcp-scraper's; but gated on D2-01 shipping first |

**Recommendation: Primary Option C, fallback Option B.** D2-01 already
commits to building `packages/server-core/meta-ingest.ts`'s `upsertMetaEvent()`
and explicitly names bcp-scraper as one of the three call sites to swap
(`D2-01 Implementation notes #4`). Batching belongs inside that shared
function so all three writers (tournament, new-meta, bcp-scraper) get it
once, not three times — a second instance of the exact duplication D2-07
already flags elsewhere. **Fallback: Option B** (batch locally in `scrape.ts`)
if D2-01 slips or scope-cuts bcp-scraper from its first cut — batching is
cheap and safe to do standalone, and doesn't conflict with a later D2-01
migration (a batched insert is a strict improvement either way).

### (b) Scrape idempotency / re-scrape semantics

**Verified behavior today** (`scrape.ts:80-88`): before scraping, the app
queries all existing `metaEvents` rows where `source = 'bcp'`, builds a
`Set<sourceId>`, then filters `events` to `!existingSourceIds.has(e.id)`.
This is an **app-level pre-check skip**, not a DB-constraint upsert — D2-01
confirms `bcp-scraper`'s dedup "is app-level... not a DB-constraint upsert;
the unique index [on `(source, sourceId)`] is a backstop it never exercises
in the happy path."

**What actually happens if the same event is scraped twice:**
1. **Whole-event re-scrape (event already fully committed):** `existingSourceIds`
   contains it → filtered out of `newEvents` (`:88`) → **silently skipped,
   zero rows touched.** Correct outcome, but only because the first scrape
   fully committed. There is no re-scrape path for updating a completed
   event's pairings if BCP corrects a result after the fact — the contract
   today is "first successful scrape wins forever," not "latest data wins."
2. **Partial-failure re-scrape (first attempt died mid-event):** the event
   insert (`:101-112`) commits before any player/pairing rows are written.
   If the process throws partway through player or pairing inserts (network
   blip, a bad faction string hitting `errors.push` at `:174-179` but
   continuing the loop, or an uncaught error escaping the per-event `try`
   at `:221-223`), the **event row already exists** with `source: 'bcp'`,
   `sourceId: event.id` — so the *next* cron run's pre-check sees it as
   already-scraped and **permanently skips it**, even though it has zero or
   partial players/pairings. There is no rollback of the partial `metaEvents`
   row and no partial-state marker distinguishing "fully scraped" from
   "event row created, then died." This is a real gap, not a hypothetical:
   the per-event `try/catch` (`:94-223`) exists specifically because
   individual events are expected to fail sometimes (`errors.push` at `:222`
   confirms this is anticipated), and every such failure after the event
   insert leaves an unrecoverable half-row.

**Decide the contract:**

| Option | What it does | Fit | Effort | Risk |
|---|---|---|---|---|
| A — Status quo (pre-check skip, no rollback) | Leave as-is | 2 | 5 | 3 (silent permanent partial-data gap on any mid-event failure) |
| B — Wrap per-event write in a transaction; only commit `metaEvents` row after players+pairings succeed | Move the event insert to *after* player/pairing rows are staged, or use a libSQL transaction/batch so partial failure leaves nothing | 5 | 3 | 4 |
| C — Full upsert semantics (delete-then-reinsert on `(source, sourceId)`, always re-scrape recent events) | Match tournament's `exportToMeta` pattern (D2-01 notes it already has "real idempotency: delete-then-reinsert") — re-fetch and overwrite even already-seen events within the 7-day window | 4 | 3 | 3 |

**Recommendation: Primary Option C, folded into D2-01's shared
`upsertMetaEvent()`.** D2-01 already specifies the shared function "does
the `(source, sourceId)` delete-then-reinsert" — adopting it for bcp-scraper
gives correct re-scrape semantics (a corrected result on re-run overwrites
cleanly) for free, and closes the partial-failure gap as a side effect
(delete-then-reinsert means a half-written prior attempt gets cleanly
replaced, not permanently locked out). **Fallback: Option B** as a
standalone fix if D2-01 is delayed — at minimum, don't leave Option A's
silent permanent-skip gap live. Either way, **keep the `existingSourceIds`
pre-fetch** (D2-01 explicitly says to retain it) as a cheap early skip for
the common case (nothing changed), not as the correctness mechanism.

### (c) BCP auth/session management robustness

**Verified flow** (`cognito.ts:15-73`): two sequential HTTP calls — `GET
/oauth/authorize` with Basic auth (email:password) returning an
authorization `code`, then `POST /oauth/token` exchanging it for an access
token. No token caching, no refresh path, no retry. `authenticateBcp` runs
fresh on every invocation (`scrape.ts:62-66`) — cron and manual `/scrape`
both re-authenticate from scratch.

**Failure modes, read directly from the code:**
1. Non-2xx on either step throws immediately (`cognito.ts:38-40,62-64`)
   with a message containing only the HTTP status — no response body, no
   diagnostic detail if BCP changes its error shape or rate-limits.
2. Missing fields in an otherwise-2xx response also throws (`:44-46,68-70`),
   same message-only shape.
3. **No retry anywhere.** A single transient 5xx or network blip fails the
   *entire* scrape — the top-level catch in `runScrape` (`:237-247`) marks
   the whole job `'failed'`, so one flaky auth call zeroes out an entire
   cron run (all events for the week), not just one event.
4. **Single shared account** (`BCP_EMAIL`/`BCP_PASSWORD`, `worker.ts:16-17`)
   with no distinction between "wrong credentials" (permanent, needs a
   human) and "transient hiccup" (retry fixes it) — both throw the identical
   `Error` string shape, so `bcp_scrape_jobs.errors` can't tell an operator
   which one happened.
5. **No backoff across invocations.** If BCP starts rejecting the account,
   every weekly cron and manual trigger retries identically with no
   escalation — compounds D2-06's finding that job failures are only
   visible by querying `bcp_scrape_jobs` directly, never surfaced proactively.

**Options:**

| Option | Fit | Effort | Risk |
|---|---|---|---|
| A — Status quo (throw on any failure, no retry, no distinction) | 2 | 5 | 3 |
| B — Retry-with-backoff around `authenticateBcp` (2 attempts) + response body in thrown errors | 4 | 4 | 4 |
| C — B, plus classify errors (401/403 permanent vs. 5xx/network transient), surfaced in the persisted job error | 5 | 3 | 4 |

**Recommendation: Primary Option C, fallback Option B.** Small, local,
independent of any Phase B decision — ships standalone. Retry only on
network error/5xx (not 4xx — a bad credential won't fix itself), include
status + body snippet in the thrown message, tag the error so `runScrape`'s
catch can write `errorType: 'auth-permanent' | 'auth-transient'` into
`bcp_scrape_jobs` (slots into D2-06's Tier 2 work — same table, richer
payload). **Fallback: Option B** alone if the classification tag doesn't
fit cleanly once D2-06's shared error-shape work lands.

---

## 3. Cross-cutting obligations

bcp-scraper appears in **all seven** Phase B registers — the highest of any
app in the census. Rolling that up here is the actual value of this section:
no single Phase B doc shows the *combined* obligation this app owes.

| Decision | This app's share | Status |
|---|---|---|
| **D2-01** (tournament/meta unification) | One of three writers into `metaEvents`/`metaEventPlayers`/`metaPairings` (`scrape.ts:101-217`). Swap the hand-rolled insert sequence for `upsertMetaEvent()` once built; keep `existingSourceIds` as a cheap pre-fetch skip only, not the correctness mechanism. Also owns the only *working* cube-build pipeline (`pipeline.ts`), which D2-01 says the shared function should absorb/trigger from — bcp-scraper is the one app doing this right today; D2-01's cube-ownership fix must not regress it. | ⏳ Pending D2-01 |
| **D2-04** (data-in-code, Rule 6) | `gw-parser.ts:5-59`'s `FACTION_NAMES`(28)/`SUBFACTION_NAMES`(22) — class **B**: keep as a single shared module, but generate `gw-parser.generated.ts` from `dim_faction`/`dim_subfaction` instead of hand-maintaining the literal. Already falls back to DB-backed `normalizeFaction` first (`:95-100`) — this closes the fallback's own staleness, doesn't touch working logic. | ⏳ Pending D2-04 codegen script |
| **D2-05** (worker chunking, Rule 9) | Named **Class 2 — scheduled scrape/fan-out**. Primary pattern **D**: move to GitHub Actions mirroring `sync-data.yml`, not Queues/DO — today's volume is weekly-cron-sized. Extract `runScrape`/`runPipeline`/`parsePendingLists` into an importable CLI entry (Rule 4, nearly free — already plain functions); keep `POST /scrape` as a thin manual passthrough. Batching (2a) is named as the "adjacent cheap win" to do in the same pass. | ⏳ Pending — highest-effort item for this app |
| **D2-06** (silent-failure policy) | Instance **#5**, Tier 2. Per-event `errors[]` (`scrape.ts:92,175-179,221-223`) only reaches `bcp_scrape_jobs.errors` on total job failure (`:237-247`); the success-path update (`:227-236`) has no `errors` field, so partial event failures report as clean `'completed'`. Fix: thread `errors[]` into the success path; consider `'completed_with_errors'`. D2-06's own Track 2 ranks this its #5 priority item. | ⏳ Pending D2-06 Track 2 |
| **D2-07** (shared-utility consolidation, Rule 3) | Item **7**: hand-rolled `cachedApp`/`getApp()` memo (`worker.ts:30-33,64-66`) duplicates `server-core`'s `createWorkerHandler` (byte-for-byte equivalent build-once memo). bcp-scraper already imports `server-core` for `generateId` — zero-new-dependency, import-swap-only fix. D2-07 ranks it 2nd overall, right after `generateId` cleanup, for exactly this reason. | ⏳ Pending — smallest fix in the whole cluster |
| **D2-08** (doc drift) | One of only **two apps platform-wide with no CLAUDE.md** (the other: content-ingestor). Its fallback doc, `docs/etl-data-pipelines.md:148-219`, is itself stale — documents stage 3 list-parsing as live when D2-09 confirms it's a permanent no-op. D2-08's sweep commits to writing this app's CLAUDE.md from scratch off the Phase A census. | ⏳ Pending D2-08 sweep |
| **D2-09** (dead-subsystem disposition) | Owns **two** of six platform-wide dead subsystems. Item 1, the list-parser chain (≈615 lines + ≈675 test lines): **park with a scoped research-spike unpark condition** — `listId` isn't a fetch key into any REST endpoint this Worker can call; the only proven list-text path is Playwright, which a CF Worker can't run. Item 2, `detachment-map.ts`'s `extractDetachment` (10 test-only callers, zero production callers, `scrape.ts:187` hardcodes `detachmentId: null`): **delete outright** — inherits item 1's blocker, no independent value. | ⏳ Item 2 delete unblocked today; item 1 needs the research spike |

---

## 4. Ordered work plan

Priority-ranked, with dependency notes where a Phase B decision must land
before a local change touches the same code.

1. **Delete `detachment-map.ts` + `detachment-map.test.ts`** (D2-09 item 2).
   Zero production callers, zero blockers. Purely subtractive — do first.

2. **Swap hand-rolled `cachedApp`/`getApp()` for `createWorkerHandler`**
   (D2-07 item 7). Independent of everything else; touches only `worker.ts`.

3. **Persist `errors[]` on the success path** (D2-06 instance #5, Tier 2).
   Thread the existing array into the `'completed'` job update
   (`scrape.ts:227-236`), not just the catch branch. Independent of the
   chunking work below — do it now, it doesn't need to be redone once the
   function moves into a CLI entry point.

4. **Retry + classify BCP auth failures** (2c above). Local to `cognito.ts`.
   Do alongside item 3 — same theme, same blast radius (this app only).

5. **Extract `runScrape`/`runPipeline`/`parsePendingLists` into an
   importable CLI entry + add the GH Actions workflow** (D2-05, Class 2,
   pattern D). Highest-effort item; sequence carefully:
   - **Batch inserts (2a) in the same pass** — D2-05 names this the
     "adjacent cheap win" since the extraction already touches the insert
     loops; don't edit `scrape.ts` twice.
   - **Do not wait for D2-01** — moving *where* the code runs (D2-05) is
     orthogonal to *how* it writes (D2-01). If D2-01's `upsertMetaEvent()`
     has already landed by the time this is picked up, write the CLI
     against it directly to avoid a second pass.

6. **Swap insert sequence for `upsertMetaEvent()`** (D2-01). **Hard
   dependency: D2-01's shared function must exist first.** If D2-01 hasn't
   landed by the time item 5 happens, use item 5's local-batching fallback
   so extraction isn't blocked, then swap in `upsertMetaEvent()` as a
   follow-up once D2-01 ships — don't hold chunking hostage to a separate
   decision's timeline, but don't duplicate D2-01's delete-then-reinsert
   logic locally if D2-01 is imminent.

7. **Generate `gw-parser.generated.ts`** from `dim_faction`/`dim_subfaction`
   (D2-04 item 8). Independent of 1-6 — touches only the parsing fallback.
   Lower priority: fixes a fallback path, not a live-data or visibility bug.
   Do once the codegen script itself exists (D2-04's job, not this app's).

8. **Write `apps/bcp-scraper/CLAUDE.md`** (D2-08 sweep item #5). Do last —
   after items 1-6 land, so it documents the settled architecture
   (CLI-extracted, GH-Actions-scheduled, shared-writer) rather than a
   transitional state.

9. **Park D2-09 item 1 (list-parser subsystem) as a standalone research
   spike**, not gated on anything above. Add the pointer comment at
   `parse-lists.ts:1` and near `scrape.ts`'s `metaEventPlayers` insert now;
   the spike itself (live network trace of bestcoastpairings.com while
   logged in, looking for a JSON list-text endpoint) is separate scoped
   work Micah owns, not a code change bundled with 1-8.
