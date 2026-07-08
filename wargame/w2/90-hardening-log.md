# 90 — W2 Hardening log

> Dated verification passes over W2's claims, per the loop protocol in
> [`../00-methodology.md`](../00-methodology.md) and the W1 pattern
> (`../90-hardening-log.md`). Each entry: what was probed, what was found,
> which doc was corrected.

## 2026-07-07 — Pass 1: full second pass, 11 parallel read-only verification agents

Scope: every load-bearing claim in the Phase B decision register (D2-01…D2-09)
and the Phase C verdicts, re-verified against live code at `main` HEAD
`d642a62` (the same commit the docs were grounded on — the two power outages
meant no code drift window existed, so this pass tests the *claims*, not
staleness). Six agents covered the priority-bug clusters, five covered the
decision registers.

**Headline: zero load-bearing refutations.** All five execution-priority bugs
confirmed; three found to be *worse* than documented; one significant new
design finding (unscoped cube builder); one claim corrected as stale; a
handful of counts tightened.

### Priority-bug clusters (execution list items 1–5)

| Claim (doc) | Probe | Result | Action |
|---|---|---|---|
| game-tracker photo loss: no `PHOTOS_BUCKET` binding, NullR2 fallback, silent null persist (verdict §d) | wrangler.toml, `worker.ts:27-29`, `r2.ts:44-49`, `turn.ts:66-127` | **CONFIRMED, all 6 sub-claims — and worse**: `turn.add` never reads `requirePhotos` at all, though `match.start` stores it (`match.ts:37,69`) — the data to enforce exists and is never checked | Verdict strengthened: the fix can enforce `requirePhotos` server-side with zero schema change |
| list-builder migration data loss (D2-06 Tier 1) | `migrateIndexedDbLists.ts:84-94` | **CONFIRMED**: `failed++` in catch, then `markMigrationDone()` unconditionally (line 92, with a comment acknowledging it); localStorage flag makes it permanent — failed lists never retried, look migrated | No correction |
| list-builder has no server-side validation | `list-v2.ts`, grep server tree | **CONFIRMED**: server has zod shape checks + attachment-integrity only (`list-v2.ts:207-279`); `validateArmy` (points/duplicates/warlord) exists only in `client/src/lib/armyRules.ts` — raw tRPC call persists invalid lists | No correction |
| content-ingestor unauthenticated Gladia webhook | `worker.ts:223-250` | **CONFIRMED**: `/ingest/callback` is the only non-`/health` route without `checkAuth`; `parseGladiaCallback` validates only that `id` is a string — fake transcripts injectable into the extraction pipeline | No correction |
| content-ingestor `community.json` RMW race | `nodes.ts:74-97` | **CONFIRMED**: plain `bucket.put`, no `onlyIf`/etag; **`manifest.json` (line 107) has the same unconditional-put race** — the fix must cover both | Verdict corrected: race is ×2 objects, not ×1 |
| auth-server no working rate limit | `packages/auth/src/index.ts:118-141`, wrangler.toml, Better Auth internals | **CONFIRMED, all 4 sub-claims**: `rateLimit` is implicitly *enabled* by Better Auth's production default but resolves to `storage: "memory"` (per-isolate `Map`) absent `secondaryStorage`; no KV namespace anywhere in repo; no zone rule documented | Verdict sharpened: it's not "rate limiting off," it's "rate limiting on and ineffective" — a false sense of protection |
| bcp-scraper idempotency gap | `scrape.ts:80-224` | **CONFIRMED, mechanism traced**: `metaEvents` row inserted (`:101-112`) *before* pairings fetched (`:116-119`); per-event catch only pushes to in-memory `errors[]`; no transaction, no rollback — next run's `existingSourceIds` filter (`:88`) excludes the event forever | No correction |

### New finding beyond the census (from the D2-01 verification)

| Finding | Evidence | Consequence |
|---|---|---|
| **The cube builder is NOT scoped to BCP data** — D2-01 said "scoped to BCP data only"; refuted | `pipeline.ts:210-213`: `SELECT … FROM meta_events WHERE imported_at > ${lastCompleted}` — **no `source = 'bcp'` filter** | bcp-scraper's scheduled cube build ingests tournament `exportToMeta` rows and new-meta CSV rows too. Three writers with three different idempotency strategies (delete-then-reinsert / no-dedup / skip-if-seen) feed **one shared, unscoped cube** — a re-export or duplicate CSV import silently perturbs the cube between builds. This *raises* D2-01's priority: `upsertMetaEvent()` isn't just hygiene, it guards the cube's correctness. **D2-01 corrected.** |

### Decision-register second pass

| Doc | Result | Corrections applied |
|---|---|---|
| D2-01 | 3-writer claim confirmed exactly (3 source-level `insert(metaEvents)` sites, 3 distinct idempotency strategies); `build-cube.ts` orphan confirmed; `metaCubeStatus` untouched by new-meta outside `server.test.ts:38` confirmed | "Scoped to BCP only" corrected to "unscoped — reads all sources" (see new finding above) |
| D2-02 | All file:line claims exact; cache-purge soft-fail, dual routing topology, git-drift narrative all hold | **Undercount ×2 fixed**: (1) `apps/tournament/PLAN.md:76` is a **6th** phantom-deploy `[x]` claim — it was missing from the doc's own cleanup list (note 9), which would have left one artifact behind; (2) `scripts/deploy-workers.sh:14` is a **7th** hardcoded roster copy with its own distinct wrong subset (7 apps) — added to the manifest's consumer list |
| D2-03 | 33/36 sub-claims exact; the three-way v1/v2 split (list-builder v1 dead / game-tracker v1 alive / versus v1 nearly dead) verified precisely, incl. admin `stats.ts` blocking dependency | Count nits (log-only): `list.test.ts` has 20 `caller.list.*` call sites, not 10 |
| D2-04 | 15/17 items byte-exact incl. entry counts and quoted comments | (1) **Stale claim fixed**: the "Strike Force maxDuplicates inconsistency" *within* list-builder does not reproduce — the three copies have matched since 2026-06-01 (`git blame`); the DRY problem stands, the live-bug justification doesn't. (2) Paths for items #11/#12 missing the `sources/` segment — fixed. (3) `TASKS` is 27 rows, not 28 (log-only). (4) Item #15 is >90% done already (795→82 lines; one node left). (5) **Census gap**: three more class-C hand-transcribed files in `apps/brain/server/src/lib/parsers/` — `mission-card-urls.ts` (165 ln), `twists.ts` (411 ln), `secondary-mission-bodies.ts` (266 ln) — same late-June ingestion push, same disposition as #13/#14; the class-C cluster is **5 items, not 2**. Added. |
| D2-05 | All 6 Rule-9 hotspots confirmed with exact line matches; no file drift since review; `/index-vectors` confirmed as the in-repo pattern-A exemplar | Nuance recorded: content-ingestor's "discovery already split to CI" is an *available* path — the Worker's live cron still runs the full unchunked discover+process chain daily |
| D2-06 | All instances confirmed: STORE_MAP filter drops 5 server-manifest files client-side (`client/lib/sync.ts:167`), bcp errors dropped on success path (`scrape.ts:227-236`), admin's 10 `.catch(() => [{n:0}])` sites, "Rebuild Cube" no-op button renders a normal success cycle | No correction |
| D2-07 | All 5 duplicate clusters confirmed; gateway = exactly 9 identical 18-line proxies; versus dice math client/server regex divergence confirmed (`+`/`-` vs `+`-only) | (1) data-import slugify is **2 byte-identical + 1 divergent** (faction-pack: no truncation, different quote set), not "3 genuinely different". (2) content-ingestor slugify is **×4 byte-identical** (+ a 5th two-arg variant in `meta/extract-detachments.ts`), not ×3. (3) Battle-size table is forked **×4** (4th: `useListsV2.ts:271-276`), and bcp-scraper's copy uses a *semantically different* name→points mapping ("Strike Force" ≤2000 vs =1000/2000 tiers) — a real correctness divergence, upgraded from style issue |
| D2-08 | All drift exhibits confirmed (5-file phantom sweep line-exact; tournament ELO fiction; gateway 8-vs-11 drift; widget-lab clean) | Escalation recorded: `packages/db/src/schema.ts` now has **67 tables** — CLAUDE.md still says 22, and D2-08's own "~49" was already stale at drafting. The doc's thesis demonstrating itself inside the doc. |
| D2-09 | All 6 dispositions verified, incl. the Playwright-vs-REST architectural incompatibility that parks item 1, and the test-investment inversion (dead `ingest.ts` has the package's largest test file at 280 lines; live `discover.ts`/`process.ts` have zero) | Count nits (log-only): `extractDetachment` has 7 test call sites, not ~10; list-parser test lines ≈558, not ~675 |

### Verifier-error caught (kept for method honesty)

The content-ingestor agent reported the "two colliding daily crons" claim
REFUTED after checking only `wrangler.toml` cron triggers. That was a scope
misread: the collision is the Worker cron (`0 6 * * *`,
`server/wrangler.toml:22`) vs the **GitHub Actions** cron in
`.github/workflows/discover-content.yml:18` — verified directly this pass:
`- cron: '0 6 * * *'`, the same minute daily. **The claim stands.** Lesson
(same as W1 pass 3's Playwright/WebGPU entry): a verification agent's
"refuted" needs the same skepticism as the original claim.

**Net effect:** W2's evidence base survives its second pass intact — the
execution priority list is unchanged and two items got *stronger* (photo
loss is enforceable server-side today; the unscoped cube builder makes
D2-01's shared writer a correctness fix, not hygiene). The corrections that
would have caused wrong execution (tournament's phantom-deploy file missing
from D2-02's cleanup list; D2-04's stale battle-size bug claim) are applied
to the docs directly; count-level nits live only in this log.
