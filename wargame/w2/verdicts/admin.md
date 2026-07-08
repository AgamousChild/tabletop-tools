# admin — W2 Phase C per-app design verdict

> Grounded in `wargame/w2/apps/admin.md` (2026-07-06 census), a direct
> re-read of `apps/admin/server/src/routers/{stats,crosswalk}.ts`,
> `apps/admin/server/src/routers/crosswalk.test.ts`,
> `apps/admin/server/wrangler.toml`, `apps/admin/client/src/{App,pages/
> ScraperPage}.tsx`, and Phase B decisions D2-04/05/06/07/08/09. Non-LLM
> scope (W2) — `evaluateCandidate`/Workers AI model choice is out of scope
> here (W1).

## 1. Verdict

**Refactor, not redesign.** admin's shape is correct — one control panel,
tRPC-only, service-binding fan-out to the pipeline apps it doesn't own — and
nothing here calls for tearing that down. But the app carries three
concrete defects that are load-bearing today (a stale test fixture masking
16 real test failures, a dead-end button that lies to Micah, a raw-SQL
escape hatch with no compile-time safety over tables three other apps also
touch) plus the platform's worst single case of CLAUDE.md drift (router
docs mention 1 of 2 routers, omit a whole feature). None of these require
new architecture; all require fixing what's already half-built.

## 2. App-local decision points wargamed

Three census items are not settled by any D2 decision and need a call here.
(TasksPage → D2-04; LLM batch chunking → D2-05; AppShell nav slot →
D2-07 — all cross-cutting, tabled in §3.)

### (a) Raw-SQL analytics queries vs. adding meta/cube tables to Drizzle schema

**Forces.** `stats.pipeline` (`stats.ts:294-364`) fires ~10 raw `sql`
queries against `meta_events`, `meta_event_players`, `meta_pairings`,
`fact_game_results`, `meta_for`, `meta_top`, `meta_cube_status`,
`dim_faction`, `dim_detachment` — grepped `packages/db/src/schema.ts`
directly: **zero Drizzle table definitions exist for any of these nine
names.** This isn't a stylistic shortcut, it's the entire meta/cube domain
sitting outside the schema Drizzle can typecheck against. `listParserStatus`
(`stats.ts:411-430`) compounds it with `json_extract` on a raw column
(`list_ttt`) with no type modeling at all. A rename or drop of any of these
tables (new-meta or content-ingestor own the cube build) breaks admin
silently — exactly the failure D2-06 (§3) already flags: `.catch(() =>
[{n: 0}])` turns "table renamed" into "table has zero rows," and nothing
here would catch it before that.

**Options**

| Option | What it is | Play-out here |
|---|---|---|
| 1. Add tables to Drizzle schema | Model `meta_events`, `meta_event_players`, `meta_pairings`, `fact_game_results`, `meta_for`, `meta_top`, `meta_cube_status`, `dim_faction`, `dim_detachment` in `packages/db/src/schema.ts`; rewrite `stats.pipeline`/`listParserStatus` as typed Drizzle queries | Closes the compile-time gap for good — a rename becomes a build failure everywhere, not a silent "0" in one dashboard. But admin doesn't own this schema; new-meta and content-ingestor's `build-cube.ts` are the actual writers. Modeling it here means the schema definition lives somewhere that isn't the source of truth for the tables' shape, and every future cube-schema change now has two places to update (the writer's migration, and admin's read model) unless the writer app is made to own the Drizzle definition and admin just imports it. |
| 2. Document the escape hatch | Leave raw `sql`, add a code comment at `stats.ts:294` stating which app owns each table's schema/migration and a `// SCHEMA-OWNER:` pointer; no rewrite | Cheapest, ships this week, doesn't fix the type-safety gap or the `.catch` masking (D2-06 owns that half already). Correct if the cube schema is expected to keep evolving fast during new-meta's own Phase B work — locking admin's queries into Drizzle types now would mean a second migration every time new-meta's cube schema moves. |
| 3. Both, sequenced | Document ownership now (option 2); add Drizzle definitions once new-meta's cube-table ownership question (flagged in new-meta's own census, referenced by D2-09 item 6) settles, importing types from wherever that lands rather than re-declaring them in admin | Avoids committing admin to a schema shape that might move again in new-meta's own Phase C, while still closing the visibility gap immediately. |

**Score** (weights: Risk and Quality highest — this is a cross-app schema
ownership question, not a latency-sensitive endpoint; Latency dropped)

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Add tables now | 3 | 4 | 2 | 3 | 3 | 3.0 |
| 2. Document ownership | 4 | 2 | 5 | 4 | 2 | 3.5 |
| 3. Sequenced (document → schema once new-meta settles) | 5 | 4 | 4 | 5 | 4 | **4.5** |

**Recommendation.** **Primary: Option 3.** Add the `// SCHEMA-OWNER:`
comment and the narrower-catch fix from D2-06 (§3) now — both are cheap
and don't presuppose an answer to new-meta's cube-ownership question.
Defer full Drizzle modeling until new-meta's Phase C verdict settles who
writes the cube schema; then admin imports those types rather than
re-declaring them (Rule 1 — one canonical registry, admin reads it, doesn't
own a second copy). **Fallback:** if new-meta's ownership question stalls
past one more quarter, model the tables directly in `packages/db` anyway
(Option 1) — a slightly-duplicated-but-typed schema beats an untyped one
indefinitely. **Flip trigger:** new-meta's Phase C cube-ownership verdict
lands (watch for it) → execute Option 1 against whatever it specifies.

### (b) Service-binding Worker-to-Worker triggers vs. importing scraper/ingestor core logic (Rule 4 tension)

**Forces.** admin's `wrangler.toml` wires `BCP_SCRAPER` and
`CONTENT_INGESTOR` service bindings (`wrangler.toml:15-21`);
`triggerBcpScrape` (`stats.ts:393-405`) does a same-account
`Fetcher.fetch()` RPC to bcp-scraper's `/scrape` route. Root Rule 4 says
"every data process... is a repeatable function callable from the server
layer" — read narrowly, that could mean admin should import bcp-scraper's
`runScrape()` directly rather than hop Workers. But Rule 4's actual intent
(build as an importable module, wrap for CLI/cron/**API**) is already
satisfied *inside* bcp-scraper — `runScrape()` is (per D2-05's own
grounding) already a plain function in `lib/scrape.ts`, and the service
binding is admin correctly consuming that app's **API** surface rather than
reaching into its internals. Importing bcp-scraper's core logic directly
into admin would require admin to also import bcp-scraper's DB writes,
Turso client setup, and BCP API auth — i.e., partially re-implement a
second copy of bcp-scraper inside admin's Worker. That is the Rule 1/3
violation ("no app maintains its own copy"), not the service binding.

**Options**

| Option | What it is | Play-out here |
|---|---|---|
| 1. Keep service bindings (status quo) | admin calls bcp-scraper/content-ingestor over `Fetcher.fetch()`, treating them as the API surface | Matches how Cloudflare Workers are meant to compose (bindings exist for exactly this); zero-latency same-datacenter RPC, no HTTP round-trip cost; admin stays a thin trigger/status surface, which is its actual job (control panel, not pipeline owner) |
| 2. Import scraper/ingestor core functions directly into admin | `runScrape()`/`build-cube.ts` imported as workspace packages, called in-process from admin's Worker | Violates Rule 1/3 in the other direction — admin would need bcp-scraper's Turso bindings, BCP API credentials, and content-ingestor's R2/AI bindings all present in admin's own `wrangler.toml` just to trigger work that already has a perfectly good home. Also defeats each app's independent-deploy guarantee (root CLAUDE.md: "each deploys independently") — admin redeploying would now also redeploy pipeline logic paths |
| 3. Hybrid — bindings for trigger/status, shared package only for pure logic (e.g., `build-cube.ts`'s aggregation math, if content-ingestor exports it) | Keep RPC for anything stateful (DB writes, external API calls); extract only side-effect-free logic into a shared package if admin ever needs to *compute* something bcp-scraper/content-ingestor also compute | No live case in the current census needs this — flagged as the fallback shape only |

**Score** (weights: Fit-to-stack and Risk highest — this is an
architecture-boundary question)

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Keep service bindings | 5 | 4 | 5 | 5 | 4 | **4.6** |
| 2. Import core logic directly | 2 | 2 | 2 | 1 | 2 | 1.9 |
| 3. Hybrid (bindings + shared pure-logic package if/when needed) | 4 | 4 | 4 | 4 | 4 | 4.0 |

**Recommendation.** **Primary: Option 1 — keep service bindings**, this is
not actually a Rule 4 violation once Rule 4's target (an importable,
API-wrapped function) is checked *inside* bcp-scraper/content-ingestor
rather than from admin's vantage point. **Fallback: Option 3** only if a
future admin feature needs to *compute* something (not trigger a side
effect) that duplicates scraper/ingestor logic — extract that one function
to a shared package at that point, per D2-07's own extraction rubric.
**No code changes recommended for this item.** The one real action item
riding on this boundary is D2-09's item 6 (wire `triggerMetaPipeline` to
`build-cube.ts` via the existing `CONTENT_INGESTOR` binding) — that's
Option 1 already, just finishing what's half-wired.

### (c) Test-fixture generation from real migrations (the 16 red crosswalk tests)

**Forces.** Verified directly: `crosswalk.test.ts:53-90` hand-writes
`CREATE TABLE content_entity (...)` (and `dim_dataslate`,
`content_node_link`, `content_node_link_history`) as an inline fixture. The
census's root-cause claim checks out — this fixture predates migration
0012 (`can_deploy_solo` column, per the census) and every typed insert
against the real `contentEntity` Drizzle table now fails against the stale
hand-written shape. This is the second instance of the exact drift class
D2-08 names: a hand-maintained copy of a fact (`schema.ts`'s real table
shape) that only a human remembers to update, this time inside a test file
instead of a doc.

**Options**

| Option | What it is | Play-out here |
|---|---|---|
| 1. Hand-fix the fixture now | Add `can_deploy_solo` (and audit for any other drifted columns) to the inline `CREATE TABLE` statements | Fixes the 16 failing tests today in the smallest possible diff. Doesn't prevent a migration 0013 from re-breaking the same fixture next month — identical failure mode recurs by construction, same as D2-08's finding about hand-maintained doc facts |
| 2. Generate the fixture from the real migrations at test-setup time | Test setup runs the actual Drizzle migration files (`packages/db/migrations/*.sql`) against the temp SQLite file instead of hand-writing `CREATE TABLE`; `createDbFromClient` wraps the same connection already used | Structurally can't drift — the fixture *is* the schema, sourced from the same migrations that define production. Matches D2-08's Option B pattern (generated-from-source-of-truth) applied to tests instead of docs. One-time cost: wiring a migration-runner into `vitest` setup (Drizzle ships a programmatic migrator; other apps in this repo likely already solve "spin up a real schema for tests" — worth checking `packages/db`'s own test helpers before writing a new one) |
| 3. Point at a shared DB test-helper package | If `packages/db` (or another app) already has a "run all migrations against a temp file" helper, import it rather than admin re-solving this | Best of both if it exists — zero new code, matches Rule 3. If it doesn't exist yet, this **is** Option 2, just located in `packages/db` instead of admin's own test file, which is the correct home per Rule 1 (one canonical way to stand up a test DB, not one per app) |

**Score** (weights: Risk and Effort highest — a test-infra fix, not a
runtime capability)

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Hand-fix fixture now | 3 | 2 | 5 | 3 | 2 | 3.0 |
| 2. Generate from real migrations (in admin's own test file) | 5 | 5 | 3 | 4 | 5 | **4.4** |
| 3. Shared migration-runner test helper in `packages/db` | 5 | 5 | 3 | 5 | 5 | **4.6** |

**Recommendation.** **Primary: Option 3** — check whether `packages/db`
(or any other app's test suite) already runs real migrations against a
temp SQLite file for tests; if so, import that helper into
`crosswalk.test.ts` and delete the hand-written `CREATE TABLE` block
entirely. **Fallback: Option 2** if no shared helper exists yet — build it
directly in `crosswalk.test.ts` first, then promote it to `packages/db` the
moment a second app's test suite needs the same thing (mirrors D2-07's
"don't build the shared package until a second consumer exists" logic).
**Do not ship Option 1 alone** — it fixes today's 16 red tests and
guarantees the identical failure the next time a migration touches these
four tables, which is the same anti-pattern D2-08 already named for docs.
**Immediate unblock, regardless of which option:** the 16 failures are a
known, root-caused, single-cause issue (not 16 independent bugs) — safe to
treat as one ticket.

## 3. Cross-cutting obligations — D2 decisions that apply here

| D2 decision | What it covers platform-wide | admin's specific share |
|---|---|---|
| **D2-04** (data-in-code cleanup) | Class A/B/C/D rubric for hardcoded lookup tables | `TasksPage.tsx:1-191`'s 28-item hardcoded task array is D2-04's own headline example of Class A (entity data, edited constantly, zero GW content) — **move now**: new `tasks` table + admin router, replacing the array. D2-04 ranks this "Now (low effort, clear win)," first item in its own priority list. |
| **D2-05** (Worker chunking patterns) | Class 1 (interactive admin mutation) pattern menu | `runLlmEvaluator` (`crosswalk.ts:439-610`) is D2-05's own Class-1 worked example — already ~90% at pattern A (re-selects `pending LIMIT batchSize` every call, so a second invocation naturally resumes). Two concrete actions: (1) lower default `batchSize` from 50 (cap 200) to a value measured to fit ~10s wall time; (2) change the admin UI's "Run evaluator" trigger from single-shot to a client-side loop (call → read counts → call again while a full batch returned → stop on partial). No server-side resumability change needed — cap + loop only. |
| **D2-06** (silent-failure policy) | Three-tier fail-loud policy; admin is explicitly Tier 2 (operator-facing) | Two admin-specific fixes: (1) `stats.pipeline`'s blanket `.catch(() => [{n: 0}])` sweep (`stats.ts:294-340`, ~10 sites) must narrow to swallow only "table not found"-shaped errors and rethrow/log anything else — today "table renamed" and "table empty" are indistinguishable on the dashboard; (2) `triggerMetaPipeline`'s permanent stub (`stats.ts:407-409`) behind a live, undisabled "Rebuild Cube" button (`ScraperPage.tsx:112-123`) needs a disabled/greyed state *at minimum* while it stays a no-op — this is D2-06's own cited example of Tier 2 harm (a job silently "completing" with no signal it did nothing). |
| **D2-07** (shared-utility consolidation) | Rule 3 duplication cluster; admin is item 6 | admin reimplements `AppShell`-equivalent header chrome inline (`App.tsx:64-111`) because `packages/ui`'s `AppShell` (`AppShell.tsx:1-45`) has no nav slot for admin's 10-page tab strip. D2-07's verdict: **extend `AppShell`** with an optional `nav?`/`extra?: ReactNode` prop (additive, no existing consumer breaks), then migrate `App.tsx:64-111` to pass admin's `NAV` map through it instead of forking the header. D2-07 sequences this after items 1-3 (lower-risk backend extractions) since `AppShell` is shared and widely imported. |
| **D2-08** (doc drift strategy) | Four-class drift taxonomy + trim/generate/check strategy | admin's `CLAUDE.md` undercounts pages (5 documented vs. 10 real: `App.tsx:16-26` confirms 10 `Page` variants), omits an entire router (`crosswalk`, 9 procedures — confirmed via `routers/index.ts` importing both `stats` and `crosswalk`) and ~17 `stats` procedures, and never mentions the Workers AI binding or crosswalk feature despite both being built, tested, and deployed. Per D2-08's immediate-sweep + Option A (trim policy): rewrite the file-structure and router sections to either state accurate current counts as a one-time correction, or better, drop counts/rosters entirely and point at `routers/index.ts`/`App.tsx`'s `NAV` array as the source of truth — the same fix D2-08 prescribes platform-wide, applied to this app's copy. |
| **D2-09** (dead-subsystem disposition) | Wire/delete/park verdicts for 6 orphaned subsystems; admin owns item 6 | `triggerMetaPipeline` stub + "Rebuild Cube" button is D2-09's own item 6, verdict **"fix the lie now, wire later."** Two options costed by D2-09: (a) add an `isPending`/disabled guard and relabel the button "Cube rebuild not yet available" (cheapest, ship this week regardless of anything else); (b) wire `triggerMetaPipeline` to invoke `content-ingestor/src/meta/build-cube.ts`'s logic through the already-present `CONTENT_INGESTOR` service binding (`wrangler.toml:19-21`) — real fix, same shape as decision (b) above (§2b, Option 1: service binding is the right boundary, not an import). D2-09 explicitly ranks this its highest-priority item across all six subsystems ("smallest, highest user-facing harm... ship regardless of what happens with the rest"). |

## 4. Ordered work plan

Priority order blends D2-09's "smallest, highest user-facing harm first"
logic with this doc's own findings. Each item tagged by origin.

1. **[D2-09 / D2-06]** Disable or relabel the "Rebuild Cube" button
   (`ScraperPage.tsx:112-123`) so it stops presenting a no-op as a running
   job — one-line UI fix, ship immediately, independent of everything else.
2. **[App-local §2c]** Root-cause the 16 red crosswalk tests is already
   known (stale fixture predating migration 0012) — fix by generating the
   test fixture from real migrations (check for a shared `packages/db` test
   helper first; build one in `crosswalk.test.ts` if none exists) rather
   than hand-patching the missing column. Small, high-value, unblocks CI
   confidence on the crosswalk feature.
3. **[D2-04]** Move `TasksPage.tsx`'s 28-item hardcoded array to a real
   `tasks` table + admin router. D2-04's own "low effort, clear win" — do
   before it grows to a 29th, 30th item hand-edited in source.
4. **[D2-06]** Narrow `stats.pipeline`'s blanket `.catch(() => [{n: 0}])`
   (10 sites, `stats.ts:294-340`) to distinguish "table missing" from
   "table empty"; log or surface the distinction on the dashboard.
5. **[D2-09]** Wire `triggerMetaPipeline` for real, via the existing
   `CONTENT_INGESTOR` service binding, to `build-cube.ts`'s logic — replaces
   the disabled-button stopgap from item 1 with the actual feature.
6. **[D2-05]** Lower `runLlmEvaluator`'s default `batchSize` to a
   measured-safe value and change the admin UI trigger to a resumable loop
   (call → inspect counts → repeat while full batch returned). No server
   change beyond the cap.
7. **[D2-07]** Add an optional nav slot to `packages/ui`'s `AppShell`;
   migrate `App.tsx:64-111`'s inline header chrome to consume it. Do after
   the backend items above per D2-07's own sequencing (shared, widely
   imported component — land lower-risk items first).
8. **[App-local §2a]** Add a `// SCHEMA-OWNER:` comment at `stats.ts:294`
   naming which app's migrations own each of the 9 raw-SQL-only tables;
   defer full Drizzle modeling of the meta/cube schema until new-meta's own
   Phase C cube-ownership verdict lands.
9. **[D2-08]** Rewrite admin's `CLAUDE.md` file-structure and router
   sections — correct the 5-vs-10-page and 1-vs-2-router drift, add the
   missing `crosswalk` router and Workers AI binding, and prefer pointing
   at `routers/index.ts`/`App.tsx`'s `NAV` array over restating counts that
   will drift again.
10. **[App-local §2b]** No code change — document (in the rewritten
    CLAUDE.md from item 9) that service bindings to bcp-scraper/
    content-ingestor are the correct Rule-4-compliant boundary for admin,
    closing out the candidate decision point so a future census doesn't
    re-flag it as an open question.
