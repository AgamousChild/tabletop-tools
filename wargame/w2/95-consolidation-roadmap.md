# 95 — Consolidation roadmap: cleanup for future development

> **Purpose.** The deep-dive Micah asked for after the W2 second pass
> (2026-07-07): how to consolidate and clean up the implementation so
> future development is faster and stays clean, sequenced so every step
> follows the platform rules (root `CLAUDE.md`) instead of fighting them.
> Every item below is **verified against live code at `main` `d642a62`**
> by the 2026-07-07 hardening pass ([`90-hardening-log.md`](90-hardening-log.md))
> — no item rests on an unverified census claim.
>
> This is a synthesis of D2-01…D2-09 + the 14 Phase C verdicts into one
> dependency-ordered plan. It does not re-litigate any decision; where a
> decision doc names a primary and fallback, this roadmap schedules the
> primary.

---

## The shape of the problem (what the wargame actually found)

Four repeating patterns explain nearly every finding. Naming them matters
because each has a *different* correct fix, and past cleanup attempts
failed by applying the wrong one:

1. **Fork-instead-of-import (Rule 3).** Utilities get retyped instead of
   imported, then drift: slugify ×7 across two apps (4 byte-identical +
   2 near-identical + 1 divergent), `generateId` ×4 in one app (weaker
   than the nanoid one already exported by `server-core`), dice math ×2
   with diverging syntax support, 9 identical 18-line gateway proxies,
   battle-size table ×4 — where bcp-scraper's fork has drifted into a
   *semantically different* mapping ("Strike Force" labels different point
   totals per app). The forks start byte-identical and end as bugs.
2. **Data-in-code (Rule 6).** Rosters and lookup tables live in `.ts`
   files and drift against the datastore or each other: the app roster
   retyped in 7+ files (three documented drift incidents), faction aliases
   ×4, Micah's own task tracker as a 27-row array, tournament missions
   hardcoded while their schema home (`scoringMission`) sits empty.
3. **Ship-v2-never-retire-v1 (D2-03).** Both list routers mounted, both
   simulate routers mounted, matchV2 mounted with zero client callers,
   three ingest generations running simultaneously — two of them on
   **the same daily cron minute** (`0 6 * * *`, Worker + GitHub Actions).
   Dead code carries real cost here: the dead `ingest.ts` has the
   package's *largest test file* (280 lines) while the live pipeline has
   zero tests.
4. **Silent failure (D2-06).** Failures return success: photos accepted
   and discarded (`createNullR2Storage` — `requirePhotos` is stored but
   never checked), failed list migrations marked done forever, a
   "Rebuild Cube" button that no-ops through a normal success cycle, a
   rate limiter that runs and protects nothing, scrape errors dropped on
   the success path, a mid-scrape crash that permanently locks an event
   out of re-scraping.

The consolidation strategy follows directly: **fix the active data loss
first (0), delete before you build (1), build each shared primitive once
(2), point the forks at the primitives (3), then bound the pipelines (4–5).**
Each phase makes the next one smaller and safer.

---

## Phase 0 — Stop the bleeding (live bugs, all verified 2026-07-07, no dependencies)

Ship these first, in any order, independent PRs. None waits on any
consolidation decision.

| # | Fix | Evidence | Rule |
|---|---|---|---|
| 0.1 | **game-tracker photos**: bind `PHOTOS_BUCKET` in `wrangler.toml` (bucket exists per D2-06) AND enforce `requirePhotos` in `turn.add` — the match row already stores it (`match.ts:37,69`); `turn.ts` never reads it. Reject with a clear error when storage is null. | `worker.ts:27-29`, `r2.ts:44-49`, `turn.ts:66-127` | D2-06 Tier 1 |
| 0.2 | **list-builder migration**: gate `markMigrationDone()` on `failed === 0` (today it fires unconditionally at `migrateIndexedDbLists.ts:92` with a comment admitting it); surface `failed` in `ListBuilderScreen`. | `migrateIndexedDbLists.ts:84-94` | D2-06 Tier 1 |
| 0.3 | **content-ingestor webhook**: add `checkAuth` to `POST /ingest/callback` — the only unauthenticated non-`/health` route; fake transcripts are injectable today. | `worker.ts:223-250` | Security |
| 0.4 | **content-ingestor R2 race**: conditional writes (`onlyIf: {etagMatches}` + retry) on **both** `community.json` (`nodes.ts:97`) and `manifest.json` (`nodes.ts:107`). | `nodes.ts:74-107` | D2-06 |
| 0.5 | **auth-server rate limit**: wire Better Auth `rateLimit` to Cloudflare KV via `secondaryStorage`; provision the namespace. Today the limiter is *on* (production default) and backed by a per-isolate `Map` — protection that looks enabled and isn't. | `packages/auth/src/index.ts:118-141`, `wrangler.toml` (no KV) | Security |
| 0.6 | **bcp-scraper idempotency**: move the `metaEvents` insert *after* successful pairings capture (or delete-on-failure). Today the row lands at `scrape.ts:101-112` before pairings are fetched, so a mid-event crash permanently excludes the event via the `existingSourceIds` filter (`:88`). Persist `errors[]` on the success path too (`:227-236`). | `scrape.ts:80-236` | D2-06 |
| 0.7 | **no-cheat R2 cleanup + ownership**: `bucket.delete()` in `session.delete`/`training.delete`/`deleteFrame`; add the missing `diceSets.userId` check to the four training reads. | no-cheat verdict §1–2 | D2-06 / security |
| 0.8 | **admin honesty fix**: disable/label the "Rebuild Cube" button (`ScraperPage.tsx:112-123`) — it fires a stub that returns `not-configured` through a normal success cycle (`stats.ts:407-409`). One line now; the real wiring is Phase 4. | verified this pass | D2-06 |

## Phase 1 — Delete before building (pure subtractions, D2-09 + D2-03)

Deletions come before shared primitives: every line deleted here is a line
that never needs migrating in Phases 2–3. All "zero callers" claims were
re-verified this pass.

1. **Dead subsystems, delete outright**: `detachment-map.ts` + test
   (0 production callers, 7 test call sites), new-meta `lib/aggregate.ts` +
   test (344 lines, 0 importers), content-ingestor `lib/ingest.ts` + its
   280-line test + `ingest_jobs` table + `test-r2.ts`, data-import's
   misplaced `update-data.yml`.
2. **versus v1**: delete the `trpc.simulate.lookup` call site
   (`SimulatorScreen.tsx:574-577`), unmount `simulate`, drop `simulations`.
3. **list-builder v1** — *ordered*: patch admin `stats.ts:9-10,71-72,152-157`
   first (the verified cross-app reader), then unmount the `list` router,
   then drop `lists`/`listUnits` in a follow-up migration. Never the table
   and the reader-patch in the same PR (D2-03's fallback rule).
4. **game-tracker matchV2: freeze, don't delete** — v2 has zero client
   callers but is the declared direction; v1 is the only working feature.
   Track as under-construction (D2-03 verdict; do not let a cleanup sweep
   "retire" the live v1).
5. **Rule 7 rider**: move `seedTestPlayers`' 16 fake players
   (`player.ts:230-255`) to a test-only module and gate the mutation.
6. **Doc-drift immediate sweep (D2-08)**: delete tournament's fictional
   ELO section; replace the phantom per-app-Pages `[x]` claims in **6**
   files (tournament's `PLAN.md:76` included — found this pass); fix
   `packages/db/CLAUDE.md` (says 22 tables; schema has **67** as of this
   pass) by *pointing at the schema* rather than restating a count; adopt
   the D2-08 policy line in root CLAUDE.md so none of this reaccumulates.

## Phase 2 — Build each shared primitive once (Rule 3 / Rule 6 / Rule 4)

The order inside this phase doesn't matter; everything here is additive
and consumed in Phase 3. Per D2-07: extract into *existing* packages,
create exactly one new package (`packages/util`) for the one case that
needs it.

| Primitive | Home | Replaces (verified counts) |
|---|---|---|
| `slug.ts` — parameterized (truncation length, apostrophe set as options) | `packages/server-core` | content-ingestor ×4 byte-identical + 1 variant; data-import ×3 (2 identical + faction-pack's divergent) |
| `dice-notation.ts` — union regex (`+`/`-`), `resolveAvg`/`resolveMin`/`resolveMax`, TDD union-behavior test first | **new** `packages/util` | versus client `pipeline.ts:9-44` + server `attackCount.ts:20-47` (already divergent in syntax and error behavior) |
| `generateId` — no build needed, already exists (`server-core/id.ts`, nanoid) | delete-and-import | game-tracker ×4 hand-rolled `Date.now()+Math.random()` (weaker) |
| `createWorkerHandler` — already exists (`server-core/worker.ts:9-22`) | delete-and-import | bcp-scraper's hand-rolled `cachedApp` (`worker.ts:30-66`) |
| `createProxyHandler({envKey, stripPrefix})` | `apps/gateway/functions/_lib/proxy.ts` (single consumer — not a shared package) | the 9 identical 18-line `[[path]].ts` proxies |
| `apps.json` roster manifest + `showOnLanding` flag | `apps/gateway` | **7+** hand-typed rosters: `build.sh:14` (11 apps), CLAUDE.md ("8"), `deploy-gateway.sh:4` ("7"), `verify-deployment.sh:44` (8), landing page (8 cards), `wrangler.toml` (9 bindings), **`deploy-workers.sh:14` (7 — found this pass)** |
| `upsertMetaEvent(db, {source, sourceId, …, players, pairings})` | `packages/server-core` | the three writers' three idempotency strategies. **Verified urgency upgrade**: the cube builder (`pipeline.ts:210-213`) has *no source filter* — all three writers feed one shared cube, so their inconsistent semantics are already perturbing derived data. This is a correctness fix, not hygiene. |
| `battle_size` table | `packages/db` + one read in `game-data-store` | 4 hardcoded copies; fixes the verified cross-app semantic divergence (bcp-scraper's `bs-parser.ts:51-58` vs list-builder) |
| `validateArmy` + `ValidationError` | `packages/game-content` | client-only validation; server currently persists over-points/duplicate/warlord-less lists on a raw tRPC call |
| Fail-loud helpers (`NullStorage` that throws, error-shape check) + hard-fail cache purge in `deploy-gateway.sh:28-37` | `server-core` / scripts | D2-06 Track 2; the purge currently warns-and-exits-0, contradicting root CLAUDE.md's "automatic" claim |

## Phase 3 — Point the forks at the primitives (consumer swaps)

Each row is a small PR against a primitive from Phase 2. Bundling rule
(from the verdicts): items touching the same file land together, once.

1. **Three writers → `upsertMetaEvent()`**: tournament `exportToMeta`
   (bundle with D2-04's `MISSIONS` → `scoringMission` backfill and the
   D2-05 sizing check — same function, touch it once), new-meta
   `admin.import` (fixes the verified `sourceId: null` no-dedup gap and
   the hardcoded `'batch'` return), bcp-scraper's insert sequence (after
   its Phase 4 extraction if that lands first).
2. **Cube ownership**: pick the owner (D2-01: trigger from inside/after
   `upsertMetaEvent()`), delete the orphaned duplicate
   `content-ingestor/src/meta/build-cube.ts` (353 lines, zero importers,
   manual-only), and *decide explicitly* whether the cube is all-sources
   (today's de-facto behavior, verified) or per-source — the current
   state is an accident, not a decision.
3. **Battle-size consolidation + server-side validation** in list-builder
   (one PR — same data, same call sites: `addUnit`/`updateUnit`/
   `computePoints` get the hard gate), then bcp-scraper's parsers read
   the same table.
4. **generateId ×4 delete-and-import; cachedApp delete-and-import;
   9 proxies → factory** — mechanical, each independently shippable.
5. **Roster manifest consumers**: `build.sh`, `verify-deployment.sh`
   (+ brain/study/physics specs — zero coverage today, verified),
   landing page (brain/study/physics cards are undiscoverable today),
   `deploy-workers.sh`, CI drift-check diffing `[[services]]` count vs
   manifest.
6. **Data-in-code moves (D2-04 classes A/B)**: admin `TASKS` (27 rows) →
   `tasks` table; alias tables ×4 → one `catalogAliases.ts` module
   (build-time constant — deliberately *not* a DB table, it changes only
   with source formats); `FACTION_NAMES`/`SUBFACTION_NAMES` → generated
   from `dim_faction`/`dim_subfaction`; brain `11th-edition-detachments.ts`
   → extract the one live node, delete (already 90% done — 795→82 lines).
   Class C stays put with flip triggers (now a verified 5-item cluster:
   missions, challenger cards, mission-card-urls, twists,
   secondary-mission-bodies). Class D (versus regexes, no-cheat
   statistical constants) stays put with basis+trigger comments.

## Phase 4 — Bound the pipelines (Rule 9 / Rule 4, D2-05 patterns)

All six hotspots re-verified unchunked this pass. Apply the assigned
pattern class; do not pre-build Queues/DOs (flip triggers named in D2-05).

- **Class 1 (cursor)**: new-meta `recomputeGlicko` gets
  `{cursorEventId?, limit?}` with the destructive delete guarded to the
  first call; admin `runLlmEvaluator` needs only a client resumable loop
  (server is already 90% pattern-A, verified).
- **Class 2 (GH Actions offload)**: extract bcp-scraper
  `runScrape`/`runPipeline` into an importable CLI entry (Rule 4) + GH
  Actions workflow, batching the per-row inserts in the same pass
  (`scrape.ts:181,207` are single-row inserts in loops).
- **Class 3 (record-and-defer)**: content-ingestor's webhook stays a thin
  Worker endpoint; heavy processing moves per the Phase 5 redesign.
- **Class 4 (partition the artifact)**: brain `getAllNodes` gets per-file
  scoped fetch paths for the id-scoped routes; full scan stays only for
  `/graph-data`. Wire admin's "Rebuild Cube" button to the real cube
  function via the existing `CONTENT_INGESTOR` service binding (replaces
  Phase 0.8's stopgap).

## Phase 5 — content-ingestor redesign (the one "redesign" verdict)

Sequenced last deliberately: Phases 0–4 fix everything that would have to
be rebuilt anyway, and the redesign deletes two of the three pipelines.
Per the verdict: **capability-split hybrid** (primary) — discovery runs
where yt-dlp/Playwright/pagination live (GH Actions), processing is an
importable Worker-callable chain over `pipeline_*` (the schema with the
composite dedup key); the Worker keeps webhook receipt + R2/Vectorize
writes. **Flip trigger before building**: if `extract.ts`'s LLM call runs
against Workers AI / a CI-callable path, collapse to Option 2 and skip the
Worker-side loop. Kills the verified cron collision (Worker `0 6 * * *`
vs `discover-content.yml` `0 6 * * *`) by retiring the Worker's discovery
half. The three-generation cleanup (D2-03) rides along: `cli.ts`'s manual
acquisition surface retires with the consolidation.

---

## Rule-by-rule scorecard (what each phase buys)

| Platform rule | Violations found (verified) | Closed by |
|---|---|---|
| Rule 1 — one data source | 3 writers × 3 idempotency strategies into `meta_events`; unscoped shared cube; duplicate cube builder | Phases 2–3 (`upsertMetaEvent`, cube ownership) |
| Rule 3 — DRY across apps | slugify ×7, dice ×2, generateId ×4, proxies ×9, battle-size ×4, cachedApp ×1 | Phases 2–3 |
| Rule 4 — callable functions | bcp scrape/pipeline callable only via Worker HTTP; cube script manual-only | Phase 4 (CLI extraction), Phase 3 (cube) |
| Rule 6 — data in datastores | roster ×7 files, aliases ×4, TASKS, MISSIONS, battle sizes ×4, faction lists | Phases 2–3 (manifest, tables, generated modules) |
| Rule 7 — no test data in prod | `seedTestPlayers` ungated | Phase 1.5 |
| Rule 9 — bounded Workers | 6 unchunked hotspots | Phase 4 |
| D2-06 — fail loud | 8 silent-failure sites | Phase 0 + fail-loud helpers (Phase 2) |
| D2-08 — doc/code drift | 22-vs-67 tables, 6 phantom deploys, 8-vs-11 rosters, ELO fiction | Phase 1.6 sweep + manifest + policy line |

## Sequencing gates (the only hard dependencies)

- 1.3 admin-stats patch **before** list-builder v1 table drop.
- 2 `upsertMetaEvent` **before** 3.1 writer swaps; cube ownership (3.2)
  decided in the same design, or the unscoped-cube accident persists.
- 2 `battle_size` table **before** 3.3 (validation needs the canonical data).
- 4's bcp CLI extraction and 3.1's writer swap are orthogonal (D2-05:
  *where* it runs vs *how* it writes) — whichever lands second adopts the
  first.
- 5 waits for 0.3/0.4 (security/race fixes don't wait for a redesign) and
  for the Phase 4 pattern decisions it reuses.
- Everything in Phase 0 and Phase 1 has **no** upstream dependency: start
  there.

## What NOT to do (deferred with named triggers — keep the plan honest)

- **No full tournament/meta table unification** (D2-01 Option B) until
  metric-stack pairing wiring exists — verified: no client calls
  `metric.setStack` at all today.
- **No Queues/Durable Objects** until a D2-05 flip trigger fires.
- **No matchV2 deletion, no matchV2 investment** until its product
  direction is decided — v1 is the only working feature.
- **No BCP list-parser wiring or deletion** until the research spike
  answers whether list text is REST-fetchable (verified: Playwright-only
  today; the 614-line parser is fetch-agnostic and cheap to keep).
- **No class-C/D data moves** (brain CA content ×5, versus regexes,
  no-cheat constants) — comment-documented in place, flip triggers named
  in D2-04.
- **No fourth ingest implementation** while consolidating the three
  (content-ingestor verdict's explicit warning).
