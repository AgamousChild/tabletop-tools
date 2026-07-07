# D2-09 — Dead-subsystem disposition: wire or delete

> **Decision.** Six dead/orphaned subsystems surfaced across the Phase A
> census. For each: wire it up, delete it, or park it with a named unpark
> condition. Non-LLM scope (W2).
>
> **Status:** drafted 2026-07-06. Re-verified against code this pass — one
> census claim corrected (item 5: the workflow is doubly dead, not just
> pointing at a missing repo). One new fact not in the census: item 1's
> "wire it up" path runs through Playwright browser automation, not a REST
> endpoint the Worker can call — this changes the verdict.

## Forces

- Root Rule 4 ("no features that aren't needed yet") and Rule 0 ("verify
  before asserting") pull toward deleting anything unproven and unwired.
- Counter-force: list-level meta data (detachment/unit win rates from real
  tournament lists) is a **stated platform goal** — `docs/etl-data-pipelines.md`
  documents the list-parse stage as if it already flows, and unit ratings in
  list-builder are meant to be sourced from tournament results, not made up.
  Deleting the parser subsystem forecloses that goal unless someone rebuilds
  it from scratch later.
- Six items, three different failure shapes: (a) built-but-never-fed
  (item 1, 2), (b) built-but-superseded-by-a-different-implementation
  (item 3), (c) built-then-abandoned-in-place (item 4), (d) never-actually-
  wired-into-CI (item 5), (e) UI promises a capability the server never
  shipped (item 6). One verdict style doesn't fit all six — this doc scores
  per item, then rolls up to an overall posture.

## Grounding (re-verified 2026-07-06, this pass)

1. **bcp-scraper list-parsing subsystem** (`list-parser.ts`, `gw-parser.ts`,
   `bs-parser.ts`, `format-detector.ts`, `parse-lists.ts` + 5 test files,
   ≈615 source lines / ≈1290 with tests).
   - `bcp-api.ts:22,87,93` captures `player1.listId`/`player2.listId` on
     every pairing (`BcpPairing.player1.listId`) — confirmed present in the
     mapped type and populated from the raw BCP pairings response.
   - `scrape.ts` (full file read) **never reads `pairing.player1.listId` or
     `pairing.player2.listId` anywhere.** The field is mapped in
     `bcp-api.ts` and then dropped — `metaEventPlayers` insert
     (`scrape.ts:181-193`) has no `listText`/`listId` field at all.
   - `parsePendingLists()` (`parse-lists.ts:17-26`) queries
     `meta_event_players` for rows with `list_text IS NOT NULL` — that
     predicate is never true in production, confirmed by the write-side gap
     above. The entire parser chain it feeds is a no-op against real data.
   - **New fact this pass:** the only working precedent for fetching BCP
     list text lives in `apps/content-ingestor/src/bcp/scrape-lists.ts` and
     `army-list.ts` — both use **Playwright** (`chromium.launchPersistentContext`,
     headed browser, DOM text-extraction heuristics against
     `bestcoastpairings.com` web pages), not BCP's JSON REST API that
     `bcp-scraper`'s Worker calls (`newprod-api.bestcoastpairings.com`).
     `docs/superpowers/plans/2026-04-27-bcp-scraper.md:132-160,366` documents
     this explicitly: "Army lists require a paid BCP subscription... Micah
     must be logged into BCP in the Playwright browser." There is no known
     REST endpoint that returns list text by `listId`; the only proven path
     is a logged-in browser session driving the public site.
   - Implication: `listId` is not a fetch key into an API `bcp-scraper`'s
     Worker can call. A Cloudflare Worker cannot launch Playwright/Chromium.
     "Wire it up" for the Worker is not a small patch — it requires either
     (a) discovering/confirming an authenticated JSON endpoint BCP's own
     frontend uses for list detail (unverified, would need live network
     inspection of the BCP site), or (b) moving list-text fetching out of
     the Worker entirely into the existing local Playwright CLI path
     (content-ingestor's `scrape-lists.ts`) and importing/merging that
     output into `meta_event_players.list_text` as a separate, human-run
     step — which is a different architecture, not a fix to `runScrape`.

2. **bcp-scraper `detachment-map.ts` `extractDetachment`.**
   `detachment-map.ts:26` exports the function; `detachment-map.test.ts`
   is its only caller found in the app (10 test-only call sites, zero
   production call sites). `scrape.ts:188` hardcodes
   `detachmentId: null` at insert. Confirmed dead in the live flow.
   Unlike item 1, this one has **no external-API blocker** — detachment is
   parsed from list text the app already doesn't have (same root cause as
   item 1), so it inherits item 1's fate rather than being independently
   fixable.

3. **new-meta `lib/aggregate.ts`** (344 lines, re-counted this pass).
   Grepped `routers/` for any import of `./aggregate` or `aggregate.js` —
   zero matches; the only two hits for the string "aggregate" in
   `routers/meta.ts` are code comments, not imports. `aggregate.test.ts`
   is the only consumer. Confirmed unused by any live router; `meta.ts`
   reimplements the same win-rate/matchup math as raw SQL directly against
   the cube tables. Import graph confirms the census's "apparently unused"
   claim as fully dead, not just under-wired.

4. **content-ingestor `server/src/lib/ingest.ts` + `test-r2.ts`.**
   `ingest.ts` (196 lines) exports `startYoutubeIngest`/`saveTranscript`/
   `processJob`/`ingestWebArticle`; grep across the server package finds
   exactly one importer — its own `ingest.test.ts` (280 lines, confirmed
   the package's largest test file). `worker.ts` (the deployed entry point)
   does not import it; the live discovery/processing chain is
   `discover.ts`/`process.ts` against `ingest_content`/`ingest_sources`,
   a different schema generation. `test-r2.ts` (9 lines) is unmounted from
   `worker.ts`'s routes. Confirmed dead in the deployed Worker.

5. **data-import's `update-data.yml`.** Correction to the census's framing:
   not just "references scripts that don't exist" — it's **not discoverable
   by GitHub Actions at all**. It lives at
   `apps/data-import/server/.github/workflows/update-data.yml`; GH Actions
   only reads workflows from repo-root `.github/workflows/` (confirmed:
   that directory holds the four real active workflows —
   `deploy-data-import.yml`, `discover-content.yml`,
   `scrape-brain-cache.yml`, `sync-data.yml` — `update-data.yml` is not
   among them). Even moved to root, it clones `AgamousChild/sync-data` (a
   separate repo) for tools not in this repo, and calls
   `scripts/export-wahapedia.ts` — which **does exist** at the repo root
   (correcting the census's implication the script is fictional) but
   exports into a client-public path the real `sync-data.yml`/`sync.ts`
   pipeline superseded (sync now runs via `sync-cli.ts` → `runSync()` into
   R2). Doubly dead: wrong location, and describes a retired architecture.

6. **admin `triggerMetaPipeline` stub wired to a live "Rebuild Cube" button.**
   `stats.ts:407-409` confirmed: `adminProcedure.mutation` returning a
   hardcoded `{ status: 'not-configured', message: '...' }`, no branching,
   no TODO. `ScraperPage.tsx:10,122` confirmed: the button's mutation is
   wired to this exact procedure and its label reads "Rebuild Cube" /
   "Running..." with **no error or disabled state indicating the button
   does nothing** — a user (Micah) clicking it gets a silent no-op that
   looks like a success/loading cycle. The actual cube-build logic lives in
   `content-ingestor/src/meta/build-cube.ts` (per the new-meta census) as an
   orphaned standalone script no app calls — `triggerMetaPipeline` was
   scaffolded to eventually call it and never finished.

## Options

**(A) Delete sweep.** Remove all six items and their tests in one PR.
Simplest, smallest diff, removes every misleading surface immediately.
Forecloses list-level meta analytics unless someone rebuilds the parser
from scratch later (git history preserves it, but nobody rebuilds a
600-line parser from a git log — it becomes a fresh design task).

**(B) Wire the valuable one (list scraping) + delete the rest.** Treat
item 1 (and its dependent, item 2) as worth finishing because list-level
meta data is a named platform goal; delete items 3, 4, 5, 6 outright (or
stub 6 honestly). Risk: "wiring it up" is not a Worker-side fix per the
grounding above — it requires either an unverified BCP JSON endpoint or a
local Playwright job merged into the DB, which is a new pipeline design,
not a bugfix. Committing to (B) today would be committing to unscoped
discovery work under the guise of "wire it up."

**(C) Park all six with conditions.** Leave everything in place, add a
comment/doc note per item stating the unpark trigger, revisit later.
Keeps maximum optionality but keeps six misleading/dead surfaces live
(maintenance surface, test-suite noise, and in item 6's case, an actively
deceptive UI) — directly against Rule 4 and the "no features that aren't
needed yet" rule, which apply to *dead* code as much as unbuilt code.

## Scores

Weights for this decision: **Effort** and **Risk** (misleading-surface
cost) weighted highest — this is cleanup, not new capability; **Quality**
here means "does the verdict match what the code can actually deliver,"
not model output quality.

| Option | Fit | Quality | Effort | Risk | Weighted verdict |
|---|---|---|---|---|---|
| A — delete sweep | 5 | 3 | 5 | 4 | Good default; underweights the platform goal for item 1 |
| B — wire list-scrape, delete rest | 2 | 2 | 1 | 3 | Undersells the real cost — "wire it up" is actually "design a new pipeline" |
| C — park all | 2 | 2 | 2 | 1 | Keeps a deceptive UI (item 6) and 1290 dead lines live for no stated deadline |

## Recommendation

**Per-item verdicts, not one blanket option** — the six items don't share
a disposition:

| # | Item | Verdict |
|---|---|---|
| 1 | bcp-scraper list-parser subsystem | **Park, with a scoped unpark condition** (not a blanket "wire it up") |
| 2 | `detachment-map.ts` `extractDetachment` | **Delete** (inherits item 1's blocker; independently dead weight until item 1 unparks) |
| 3 | new-meta `lib/aggregate.ts` | **Delete** |
| 4 | content-ingestor `ingest.ts` + `test-r2.ts` | **Delete** |
| 5 | data-import `update-data.yml` | **Delete** |
| 6 | admin `triggerMetaPipeline` stub + "Rebuild Cube" button | **Fix the lie now, wire later** — disable the button and label it "Not yet available," or wire it directly to `content-ingestor/src/meta/build-cube.ts` (already exists) via a service-binding call, whichever is cheaper this week |

**Primary recommendation: closest to Option A, with item 1 as the named
exception** — delete items 2–5 outright, fix item 6's misleading UI
immediately (this is a one-line honesty fix, not a design question), and
park item 1 rather than delete or commit to wiring it, because:

- Deleting item 1 forecloses a named platform goal (list-level meta →
  unit/detachment win rates → list-builder ratings) that nothing else in
  the roadmap currently satisfies.
- Wiring it today is not scoped work — it requires confirming whether BCP
  exposes list text via any authenticated JSON endpoint (needs live network
  inspection of bestcoastpairings.com, not code-reading), which is a
  research spike, not an implementation task.
- The existing 615 lines of parsing logic (`list-parser`/`gw-parser`/
  `bs-parser`/`format-detector`) are format-detection/parsing utilities
  independent of *how* list text gets fetched — they're not wasted if the
  fetch mechanism changes from "Worker + REST" to "local Playwright job +
  DB write." Keeping them costs test-suite time only; deleting them means
  re-deriving GW-format and BattleScribe-format parsing logic from scratch
  later.

**Fallback:** if the research spike (see Implementation notes, item 1)
comes back negative — no authenticated list-text endpoint exists and
Micah doesn't want a recurring local-Playwright job — then item 1 drops
to **delete**, matching Option A cleanly across all six items.

## Flip triggers

- **Item 1 flips park → wire:** a live network trace of
  bestcoastpairings.com while logged in as a subscriber turns up a JSON
  endpoint returning list text by `listId` or player/list URL (would let
  the existing Worker fetch it inline, no architecture change).
- **Item 1 flips park → delete:** six months pass with no list-level meta
  feature shipped elsewhere and no endpoint found — the parked code is
  pure carrying cost with no lit path to activation.
- **Item 6 flips fix-now → wire-for-real:** if `build-cube.ts` is promoted
  out of content-ingestor into a shared/callable module (Rule 4) as part
  of resolving the new-meta cube-ownership question (see new-meta census,
  decision point 2) — at that point `triggerMetaPipeline` should call the
  real function rather than stay a labeled stub.

## Implementation notes (ordered)

1. **Item 6 first (smallest, highest user-facing harm):** either (a) add
   an `isPending`/disabled guard + relabel the button "Cube rebuild not
   yet available," or (b) wire `triggerMetaPipeline` to invoke
   `build-cube.ts`'s logic through the existing `CONTENT_INGESTOR` service
   binding (confirmed present in admin's `wrangler.toml`). Cheapest fix
   that removes the deception; ship regardless of what happens with the rest.
2. **Items 3, 4: delete.** Remove `new-meta/server/src/lib/aggregate.ts` +
   `aggregate.test.ts`; remove `content-ingestor/server/src/lib/ingest.ts` +
   `ingest.test.ts` + `test-r2.ts`. Drop the orphaned `ingest_jobs` schema
   table only after content-ingestor's own pipeline-consolidation decision
   (its census decision point 1) is settled — not in this PR if still open.
3. **Item 5: delete.** Remove
   `apps/data-import/server/.github/workflows/update-data.yml` — not live
   CI (wrong directory) and describes a retired architecture.
4. **Item 2: delete** `detachment-map.ts` + `detachment-map.test.ts` in the
   same pass as item 1's disposition — don't let it linger as an orphan
   once item 1 is parked. Unparking item 1 means re-adding detachment
   extraction as part of that work, re-validated against whatever
   list-text format the unparked fetch path actually returns, not
   resurrecting this exact file.
5. **Item 1: park, don't touch code.** Add a comment at `parse-lists.ts:1`
   and near `scrape.ts`'s `metaEventPlayers` insert pointing at this doc.
   Spin up the research spike as a separate, scoped task (not a code
   change): trace BCP's own frontend network calls while logged in as a
   subscriber viewing an army list page, looking for a JSON response
   containing list text. Found → the follow-on task is "fetch via that
   endpoint in `runScrape`, populate `list_text`, re-enable
   `parsePendingLists`" — small and mechanical. Not found → escalate to
   Micah: recurring local Playwright job (content-ingestor's existing
   `scrape-lists.ts` pattern) writing into the shared DB on a schedule via
   Task Scheduler (same operational pattern as wargame 1's D09), or drop
   to delete.
