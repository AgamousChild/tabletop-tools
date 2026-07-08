# D2-06 — Silent-failure policy

> **Decision.** Adopt a platform-wide fail-loud policy (three tiers, below)
> plus per-instance fixes for the silent-failure family the Phase A census
> found across six apps. Two of the eight instances are **active data loss in
> production today**, not latent risk.
>
> **Status:** drafted 2026-07-06. Grounded in the Phase A censuses
> (`../apps/{game-tracker,no-cheat,list-builder,data-import,bcp-scraper,
> admin,content-ingestor,brain}.md`) plus a direct re-read of the cited
> source files the same day (see file:line citations throughout).

## Forces

- **The failures are structurally the same shape, wearing different clothes.**
  Every instance below is "the code caught an error/absence and did nothing
  observable with it." That repetition means this is a policy gap, not eight
  unrelated bugs — root CLAUDE.md Rule 0 ("verify before asserting") and the
  W1 hardening precedent (D08 found `extractConcepts` silently dropping
  unparseable chunks) both point the same direction: fix the pattern, not
  just the instances.
- **Two instances are live user-facing data loss right now**, not theoretical:
  game-tracker's photo bucket has never been bound in `wrangler.toml`, so
  every `turn.add` photo upload in production today silently returns `null`
  and the user sees a normal success response. no-cheat has the same
  `NullR2Storage` shape and, separately, orphans evidence blobs on session
  delete regardless of binding state. These outrank every other item on
  the list by urgency.
- **Not all silence is a bug.** brain's retrieval pipeline is deliberately
  fail-open (Gemini grounding, combo lookups, faction-list lookups all
  swallow errors so a partial pipeline failure degrades an answer instead of
  killing a public read endpoint). The census flags this as "good for a
  public read surface" but notes `retrieveError`/`geminiError` are surfaced
  in the response schema and then **consumed by nothing** — no admin
  dashboard, no log aggregation, no alert. The policy needs to keep this
  pattern legal while closing that specific gap.
- **A blanket "no catch{} ever" rule would be wrong.** Some of the 41
  content-ingestor `catch {}` blocks and some of brain's swallows are
  legitimate best-effort behavior (fetch a thumbnail, skip if it 404s).
  The forcing function is distinguishing *user-facing data loss* from
  *operator-facing degradation* from *deliberate graceful degradation* —
  and making the first two impossible to ship silently again.

## Grounding — the eight instances, verified 2026-07-06

| # | App | What happens | Verified at |
|---|-----|---------------|-------------|
| 1 | game-tracker | `wrangler.toml` has no `[[r2_buckets]]` binding → Worker falls back to `createNullR2Storage()`, whose `upload()` returns `null` with **no warning at all**. `turn.add` accepts the upload, gets `null` back, stores `photo_url: null`, returns success. | `apps/game-tracker/server/src/lib/storage/r2.ts:44-50` (read directly: `upload` body is `return null` — not even a `console.warn`); `worker.ts:28-30` binding fallback; census confirms no `[[r2_buckets]]` in `wrangler.toml` |
| 2 | no-cheat | Same `NullR2Storage` shape, one step less silent — `upload()` does `console.warn` then returns a `null://discarded/...` sentinel URL, which still reads as "saved" to any caller that doesn't specifically check the scheme. Separately, `session.delete` deletes the DB row but never calls `bucket.delete()` — evidence photos orphan in R2 forever. | `apps/no-cheat/server/src/lib/storage/r2.ts:35-42` (read directly); `session.ts:256-274` (delete, no R2 cleanup) |
| 3 | list-builder | `migrateIndexedDbLists()` has bare `catch {}` around per-list migration (comment: "getLists() failure — treat as no local lists"), per-unit migration ("Individual unit failure is non-fatal"), and the outer per-list loop ("failed++" but continues) — then calls `markMigrationDone()` **unconditionally**, so a user whose migration partially or fully failed is marked done and the flag blocks all retry. `ListBuilderScreen.tsx` never reads `result.failed`. | `apps/list-builder/client/src/lib/migrateIndexedDbLists.ts:43-95` (read directly, full function) |
| 4 | data-import | Client `STORE_MAP` (19 entries) has no key for `bsdata-subfactions.json`, `mfm-unit-costing.json`, `mfm-detachments.json`, or `faction-pack-*.json`. `syncAllData` filters `manifest.files` to `STORE_MAP` keys before syncing — those four-plus files are silently skipped with no UI indication, even though the manifest lists them as available. | `apps/data-import/client/src/lib/sync.ts:87-160` (STORE_MAP, read directly — 19 keys, confirmed gap), `:167` filter |
| 5 | bcp-scraper | Per-event/per-round errors are pushed into a local `errors: string[]` array during the scrape (`scrape.ts:92,175-179,221-223`), but that array is only ever written to `bcp_scrape_jobs.errors` in the **top-level catch** (`:237-247`) on total failure. The success-path job update (`:227-236`) writes `status: 'completed'` with no `errors` field — a job with 3 failed events out of 50 reports as clean "completed." | `apps/bcp-scraper/server/src/lib/scrape.ts:225-251` (read directly: success branch has no errors write, catch branch does) |
| 6 | admin | `stats.pipeline` wraps ~10 raw SQL count queries each in `.catch(() => [{ n: 0 }])` (`stats.ts:294-340`) — a missing/renamed table and an empty table both render as "0" on the dashboard, indistinguishable. Separately, `triggerMetaPipeline` is a permanent stub (`return { status: 'not-configured', ... }`, `:407-409`) behind a live "Rebuild Cube" button in `ScraperPage.tsx:112-123` with no UI indication it's a no-op. | `apps/admin/server/src/routers/stats.ts:294-340,407-409` (read directly, confirmed all 10+ `.catch(() => [{n:0}])` sites) |
| 7 | content-ingestor | 41 silent `catch {}` blocks across the app (census count). `POST /ingest/callback` (Gladia transcription webhook) has **no auth check** — anyone with the URL can inject transcript content into matching rows. | census (`apps/content-ingestor.md`); API surface section confirms `/ingest/callback` unauthenticated |
| 8 | brain | Deliberate fail-open: Gemini grounding, combo lookup, faction-list lookup all swallow via `Promise.allSettled`/try-catch, and `retrieveError`/`geminiError` are placed on the `/ask` response schema — but nothing (no admin page, no log sink, no alert) ever reads those fields. This is the one case the census explicitly says may be **correct design**, not a bug — it protects a public read endpoint from total failure on a partial pipeline problem. | `apps/brain.md` Health signals section; `worker.ts` `/ask` handler chains retrieval + Gemini + LLM call, confirmed `Promise.allSettled` grounding pattern |

## Wargame — policy tiers

Three tiers, ordered by how much the user/operator is entitled to know:

**Tier 1 — user-facing data loss.** The user performed an action (upload a
photo, migrate a list, sync data) believing it succeeded, and some or all of
it silently didn't. **Must surface + block or warn** — the UI has to tell the
user *before* they walk away thinking the data is safe. Instances 1, 2, 3, 4
are Tier 1.

**Tier 2 — operator-facing pipeline degradation.** A batch/background process
(scrape job, ingest cron, cube rebuild) had partial or total failures that
only an operator (Micah, via admin) would ever check for. **Must persist to
a job/status row** — the failure has to be queryable after the fact, even if
no live human was watching. Instances 5, 6, 7 (the `catch{}` sweep and stub
button) are Tier 2. The unauthenticated webhook in #7 is a distinct
*security* defect riding along in the same file — flagged separately below,
not solved by the fail-loud policy itself.

**Tier 3 — deliberate graceful degradation.** A best-effort subsystem (RAG
grounding, optional enrichment) fails and the caller correctly prefers a
degraded response over a hard 500. **Allowed**, but only with an explicit
response-field (already true for brain) **and** a doc marker in the source
(a comment tag, e.g. `// DEGRADE-OK: <reason>`) so a future reader can tell
"this silence is a decision" from "this silence is an oversight." Instance 8
is Tier 3 — it's *correct* structurally, it's just missing the doc marker and
a consumer for the field it already emits.

### Options

**(A) Fix-the-list only.** Patch the eight instances (bind the buckets, throw
in the migration, add STORE_MAP keys, persist scraper errors, distinguish
admin's zero-vs-missing, add webhook auth) with no new shared code or
convention.

- *Plays out:* Fast — each fix is small and local. But it doesn't change the
  odds of instance #9 next quarter. The census pattern (bare `catch{}` as a
  reflex, `NullR2`-shaped fallbacks as a reflex) is clearly a repeated
  authoring habit, not a one-off; W1's D08 independently found the identical
  shape (`ollama.ts` continue-on-null). Fix-only leaves the habit in place.
- *Score:* Fit 5, Effort 5 (cheapest), Risk 2 (recurs), Stack 4.

**(B) Policy + lint/convention + fix-the-list.** Same fixes, plus a written
convention (this doc) and a lint rule: **no bare `catch {}` / `catch (e) {}`
without a `// DEGRADE-OK:` or `// TODO(tier2):` comment token**, enforced via
an oxlint/ESLint custom rule or a pre-commit grep gate.

- *Plays out:* The lint rule is cheap to write (a regex-based custom rule or
  a pre-commit `grep -rn 'catch\s*\([^)]*\)\s*{\s*}'` with an allowlist
  comment check) and immediately visible in CI — "code that doesn't pass
  doesn't land" (root CLAUDE.md Code Quality section already commits to this
  enforcement style). It converts every *future* silent catch into a
  reviewable decision at PR time instead of a Phase-A-census discovery a
  year later. Doesn't by itself fix the two structural repeat-offenders
  (`NullR2`-shaped storage, unconditional "mark done" migrations) — those
  need a shared implementation, not just a comment requirement.
- *Score:* Fit 5, Effort 4, Risk 3, Stack 4.

**(C) Policy + shared helpers + fix-the-list.** (B) plus two small shared
primitives in a package (`packages/server-core` or a new `packages/result`):
(i) a `NullStorage`-shape helper that **throws in production** unless a call
site explicitly opts into silent-discard (`allowDiscard: true` with a
required reason string), so a missing binding is a loud 500 instead of a
quiet `null`; (ii) a lightweight Result-ish error channel
(`{ ok, value, errors[] }` — the shape bcp-scraper's `errors[]` array,
data-import's `runSync` per-stage errors, and `parseList`/`buildIdMapping`'s
"ok/partial/failed" pattern already converge on independently) that batch/
job functions return, so "persist errors on success" is the default return
shape, not a thing every router remembers to wire by hand.

- *Plays out:* Highest fixed cost (design + build two small shared pieces,
  migrate 3+ call sites), but it targets why this keeps happening: every
  affected app independently reinvented "storage that might not be
  configured" and "did some items fail" with no shared answer. The
  Result-ish shape isn't new here — it centralizes a convention the
  codebase already converged on three times (bcp-scraper, data-import, W1's
  D08 ingest ladder). Rule 3 makes this the natural next step, not a
  speculative abstraction.
- *Score:* Fit 5, Effort 3, Risk 5 (lowest recurrence), Stack 5.

### Scores

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted* |
|---|---|---|---|---|---|---|---|
| A — fix-the-list only | 5 | 3 | 5 | 5 | 4 | 2 | 3.9 |
| B — policy + lint + fixes | 5 | 4 | 5 | 4 | 4 | 3 | 4.2 |
| C — policy + shared helpers + fixes | 5 | 5 | 4 | 3 | 5 | 5 | 4.6 |

*Weighted for this decision: Risk and Quality (does it actually stop
recurrence) weighted higher than Effort — this is a cross-cutting policy
decision, not a single latency-sensitive endpoint, so upfront dev cost
matters less than whether the fix generalizes.

## Recommendation

**Primary: Option C** (policy + shared helpers + fix-the-list), built in two
tracks that don't block each other:

1. **Track 1 — ship the two active-data-loss fixes immediately, standalone,
   ahead of the shared helpers.** Instances #1 and #2 are live production
   bugs right now, not a design debate; don't gate them behind the
   `NullStorage` helper landing. Bind `PHOTOS_BUCKET` in game-tracker's
   `wrangler.toml` (or, if intentionally unbound during a soft-launch, make
   `turn.add` reject the upload with a clear error instead of accepting +
   discarding) and add `bucket.delete()` to no-cheat's `session.delete`.
2. **Track 2 — build the shared helpers, land the lint gate, then work the
   rest of the fix-list against them** (list-builder migration throws +
   surfaces `failed` in UI; data-import STORE_MAP either grows the 4 missing
   keys or the manifest stops implying they're syncable; bcp-scraper's
   success-path job update includes `errors`; admin's `pipeline` query
   distinguishes "table missing" from "table empty" via one error-shape
   check instead of a blanket catch; content-ingestor gets the webhook auth
   fix immediately (it's a security defect, doesn't wait for the lint
   sweep) and its 41 catches get the comment-token treatment over time).

**Fallback: Option B** if the shared-helper design (Result-shape,
`NullStorage` throw-by-default) turns out to fight the grain of one of the
call sites during implementation — e.g., if a router genuinely needs a
different discard-vs-throw default per environment in a way the helper can't
express cleanly. In that case, keep the lint gate and the manual fix-list,
and revisit centralizing storage/error-channel logic once 2-3 more real
call sites exist to generalize from (avoids overfitting the shared helper to
today's two storage apps).

**Do not adopt Option A alone.** It fixes today's list and guarantees a
Phase-A-census-shaped rediscovery next quarter — the repeated shape across
six unrelated apps is itself the evidence that "fix it locally" doesn't hold.

## Flip triggers

- If the `NullStorage`-throws-by-default helper causes more than one
  legitimate dev/test breakage per week once adopted (i.e., too many call
  sites *actually want* silent discard in non-prod), soften the default to
  "throw only when `NODE_ENV === 'production'` and binding is absent," not
  "throw always" — don't let ergonomics regress dev velocity.
- If the lint rule produces high false-positive noise (legitimate
  best-effort catches getting flagged faster than they can be annotated),
  ship it as a warning for one sprint before promoting to a blocking
  pre-commit check — matches root CLAUDE.md's "fix the underlying issue,
  never bypass" without turning the rollout into a wall of new failures.
- If a ninth silent-failure instance surfaces in a future census that
  *doesn't* fit the three tiers cleanly, that's a signal the tier model
  itself needs a fourth category — revisit this doc rather than forcing a
  bad fit.

## Implementation notes (priority-ranked)

1. **[Tier 1, ship now]** game-tracker: bind `PHOTOS_BUCKET` in
   `wrangler.toml`, or make `turn.add` fail loud when storage is null
   instead of silently accepting the upload. File:
   `apps/game-tracker/server/wrangler.toml`,
   `apps/game-tracker/server/src/lib/storage/r2.ts:44-50`.
2. **[Tier 1, ship now]** no-cheat: add `bucket.delete(photoKey)` to
   `session.delete` alongside the DB row delete. File:
   `apps/no-cheat/server/src/session.ts:256-274`.
3. **[Tier 1]** list-builder: replace the bare `catch {}` blocks in
   `migrateIndexedDbLists.ts:77-79,83-85,87-89` with error collection into
   the existing `MigrationResult.failed` count (already tracked, not
   surfaced), gate `markMigrationDone()` on `failed === 0` (or add a
   "partial" flag so retry is possible), and render `result.failed > 0` as
   a visible warning with retry in `ListBuilderScreen.tsx:75-79`.
4. **[Tier 1]** data-import: add the four missing `STORE_MAP` entries
   (`bsdata-subfactions.json`, `mfm-unit-costing.json`,
   `mfm-detachments.json`, `faction-pack-*.json`) so the client syncs what
   the manifest implies, or strip those files from the manifest's
   client-visible list. File: `apps/data-import/client/src/lib/sync.ts:87-160`.
5. **[Tier 2]** bcp-scraper: thread the local `errors[]` array into the
   success-path job update at `scrape.ts:227-236`, not just the catch
   branch at `:237-247` — partial event failures should read
   `status: 'completed_with_errors'` or carry a non-empty `errors` field.
6. **[Tier 2]** admin: replace the blanket `.catch(() => [{n:0}])` sweep in
   `stats.ts:294-340` with a narrower catch that swallows only "table not
   found"-shaped errors and rethrows/logs anything else (or check
   `sqlite_master` once and skip/report "unavailable" instead of
   querying-and-catching per table). Add a disabled/greyed state to the
   "Rebuild Cube" button (`ScraperPage.tsx:112-123`) while
   `triggerMetaPipeline` remains a stub.
7. **[Tier 2, security]** content-ingestor: add auth to `POST
   /ingest/callback` (shared secret or signature check against the Gladia
   webhook) before the fail-loud sweep — a distinct vulnerability, not just
   missing logging.
8. **[Tier 2]** content-ingestor: sweep the 41 `catch {}` blocks under the
   new lint rule — annotate legitimate best-effort ones with
   `// DEGRADE-OK:` and convert the rest to persist into the nearest job/
   status row (`pipeline_run`/`ingest_content` status columns already exist
   per the census).
9. **[Tier 3, no code change required]** brain: add
   `// DEGRADE-OK: public read endpoint, partial RAG failure preferred
   over 500` at each fail-open site, and file a follow-up to log
   `retrieveError`/`geminiError` somewhere an operator can see (a log line
   is enough) so "nothing consumes it" stops being true.
10. **[Shared infra, Track 2]** Build the `NullStorage`-shape helper
    (throws by default when a bucket binding is absent in a deployed
    environment; explicit `allowDiscard` opt-in for dev/test no-ops) and a
    small Result-ish return shape for batch/job functions, in
    `packages/server-core` (already the shared home for
    `createWorkerHandler`/`createBaseServer`). Migrate game-tracker +
    no-cheat's storage modules first, then bcp-scraper's job-error
    persistence.
11. **[Shared infra, Track 2]** Add the "no bare `catch {}` without a
    DEGRADE-OK/TODO(tier2) comment" rule to the existing oxlint/ESLint
    pre-commit gate (root CLAUDE.md Code Quality: "code that doesn't pass
    doesn't land" — extend that enforcement, don't invent a parallel one).
