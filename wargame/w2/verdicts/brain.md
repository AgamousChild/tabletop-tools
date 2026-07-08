# brain — W2 Phase C design verdict

> Grounded against `wargame/w2/apps/brain.md` (census) and a direct re-read of
> `apps/brain/server/src/worker.ts`, `lib/retrieve.ts`, `lib/card-layout.ts`,
> `apps/brain/client/src/pages/BrainScreen.tsx`, `apps/brain/DEPLOY.md`, and
> `apps/brain/CLAUDE.md`, 2026-07-06. **LLM/RAG answer quality is out of
> scope** — owned by W1 and the separate `2026-06-29-ask-overhaul.md` plan.
> This verdict covers only the non-LLM design: storage topology, build
> pipeline, deploy, and card rendering.

## 1. Verdict

**Keep, with four targeted refactors — no redesign.** Brain is the
platform's largest app (worker.ts alone is 1,434 lines; 2,712 lines across
worker+retrieve+card-layout) and carries the best test coverage in the repo
(52 server + 43 client test files, zero TODO/FIXME in non-test source). The
core architecture — Worker + R2-as-document-store + Vectorize, no DB at
runtime — is the right shape for a public read-heavy knowledge graph and
isn't up for debate here. What's wrong is entirely operational: a fully
manual multi-step deploy dance with no CI, one unfinished migration (card
layout), one acknowledged-but-uncompleted perf win (edition metadata — see
below, this is *more* done than the census implies), and small doc-drift
items. None of these justify a rewrite; all are scoped, additive fixes to
an app that otherwise works and is well-tested.

## 2. App-local decision points wargamed

### (a) R2-as-database topology

**Decision:** how nodes get from R2 into a request-servable form — the
current `getAllNodes` full-scan-into-isolate-cache (~25k nodes / ~40 files /
~32MB), vs lazy per-category fetch, vs a light D1 index.

**Current state, verified:** `worker.ts:46-65`. `getAllNodes` fetches
`manifest.json`, hashes its content (`getManifestHash`, a rolling char-sum,
`worker.ts:34-40`), and if the isolate's `cachedAllNodes` was built from the
same hash, returns the cache — otherwise it fetches and parses every
`nodes/*.json` file into memory and re-caches. Nearly every endpoint routes
through it (`getErrataNodes` too). This is Class 4 in D2-05's chunking
taxonomy ("cold-start cache / read-path full-scan").

| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|---|
| 1. Full-scan-into-isolate-cache (current) | 3 | 5 | 2 | 5 | 5 | 4 | **4.0** |
| 2. Lazy per-category/faction fetch | 4 | 5 | 4 | 2 | 4 | 3 | 3.7 |
| 3. Light D1 index (id → file/offset) | 4 | 5 | 4 | 2 | 3 | 3 | 3.5 |

(Weights: Latency and Effort matter most here — this is a live public read
path on a hobby-scale operator budget, not a governance call.)

**Wargame:** Option 1's real cost is paid once per cold isolate, not once
per request — the manifest-hash cache means a warm isolate never re-fetches
until the underlying data actually changes. ~32MB across ~40 R2 `get`s on a
cold start is real CPU/latency (nobody has measured the actual number; it's
an *(est.)* gap this doc doesn't close), but it's bounded and it correctly
serves `/graph-data`, which legitimately needs the whole graph. Option 2
(lazy per-category) is the right fix for the *majority* of endpoints
(`/browse/unit/:id`, filtered `/search`) that only ever need one faction
file, but D2-05 already scoped this precisely: "apply A to the artifact,
not the request" — partition the fetch so scoped endpoints pull only the
`nodes/faction-X.json` they need, and reserve the full scan for endpoints
that generically need it. Option 3 (D1 index) adds a second datastore and a
sync-on-every-build step for a lookup that R2's own `manifest.json` already
half-provides (file → hash); it isn't wrong, but it's more infrastructure
than the win justifies at 40 files.

**Recommendation:** Primary — **Option 2, scoped exactly as D2-05 already
specified**: refactor `getAllNodes`'s callers into two tiers — a
category/faction-scoped fetch (`getNodesForFile(file)`, cached per-file
under the same manifest-hash invalidation) for `/browse/unit/:id`,
`/browse/detachment/:id`, `/browse/node/:id`, and filtered browse; keep the
full `getAllNodes` scan only for `/graph-data` and cross-faction combo
lookups that structurally need it. Fallback — **Option 1 as-is, explicitly
documented** (per D2-05's Class-4 fallback): if the per-file refactor
doesn't ship soon, add the comment D2-05 already calls for on
`getAllNodes` stating this is an accepted cold-start cost, not an oversight.
**Flip trigger:** a measured cold-start latency number crosses a stated
threshold, or a support report ties a slow first-request to this path —
whichever comes first. No new datastore (Option 3) until Option 2 is tried
and found insufficient.

### (b) Edition metadata into Vectorize

**Decision, as framed by the census:** re-index now vs keep post-filtering
(wastes retrieval slots on wrong-edition candidates before the R2 fetch).

**Correction to the census — this is already shipped, not pending.**
Reading `worker.ts:1374-1391` and `retrieve.ts:214-226` directly: PR #57
(`7a587e1`, "push edition filter into Vectorize metadata (perf win)")
already landed this. `/index-vectors` writes `edition: node.edition ??
'unknown'` into every vector's metadata (`worker.ts:1383-1391`), and
`retrieve.ts` already pushes `filterObj.edition = editionPreFilter` into the
`BRAIN_INDEX.query` call (`retrieve.ts:219-226`) whenever a specific edition
is requested. The post-Vectorize `applyEditionFilter` (`retrieve.ts:470ff`)
is retained deliberately as defence-in-depth against mis-indexed nodes and
the `'unknown'` sentinel — not because the pre-filter doesn't exist. Both
`retrieve.ts:470-472`'s comment and `apps/brain/CLAUDE.md`'s "Switchable
edition filter" section still say "isn't yet in Vectorize metadata... would
require re-indexing" — **that's stale documentation, not an open design
question.** This item is not a live decision; it's a doc-drift fix (folds
into D2-08 below), plus one operational question:

**The operational question that remains:** has a *complete* re-index
actually run against production since PR #57 shipped? `/index-vectors` only
tags vectors with `edition` on write — any node embedded before #57, or any
node added/changed since without a follow-up `/index-vectors` sweep, still
carries stale-or-missing edition metadata in Vectorize (masked by the
`'unknown'` sentinel and the post-filter). `DEPLOY.md`'s step 5 sequence
(core/errata/balance/community + 29 per-faction curl calls) is the correct
procedure — the risk is purely "was it actually run to completion the last
time node content changed," which is unverifiable from code and belongs to
the manual-deploy problem in (c), not to this decision.

**Recommendation:** No design work needed here — mark this candidate
decision resolved-by-code. Action items: (1) fix the two stale comments
(`retrieve.ts:470-472`, `apps/brain/CLAUDE.md` edition section) to say
"pre-filter is live since PR #57; post-filter is defence-in-depth," (2) add
a lightweight verification step to the deploy pipeline (c) that confirms
`/index-vectors` ran for every node file after a content change, so "did
the re-index actually complete" stops being a question only answerable by
memory.

### (c) Build+deploy pipeline

**Decision:** the manual local-build → per-file `wrangler r2 object put`
loop → `wrangler deploy` → authenticated re-index POST → separate client
build dance (`DEPLOY.md`, confirmed verbatim: test → `build-graph.ts` →
per-file R2 puts for manifest/nodes/refs → `wrangler deploy` → curl
`/index-vectors` once for core files, then a 29-iteration faction loop →
client build → gateway rebuild+deploy) vs CI-driven, mirroring
data-import's precedent.

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Manual dance (current) | 2 | 3 | 2 | 3 | 2 | **2.4** |
| 2. GH Actions, mirrors `sync-data.yml` | 5 | 4 | 3 | 5 | 4 | **4.2** |
| 3. Partial: script the loop, keep manual trigger | 4 | 4 | 4 | 4 | 3 | 3.8 |

(Weights: Risk and Effort matter most — this is the same shape D2-05
already scored generically; brain's version is worse than data-import's
pre-fix state because it's a 6-step *sequence* across two apps — server,
R2, Worker, Vectorize, client, gateway — with no single command and no
audit trail of what ran.)

**Wargame:** Option 1's cost isn't CPU-budget risk (the per-endpoint
chunking is already fine, see D2-05) — it's operator risk: a 6-step manual
sequence where skipping step 5 (re-index) silently leaves stale Vectorize
data with no error, and the 29-iteration faction curl loop is exactly the
kind of thing a tired human forgets to finish. D2-05's own Class 2/3
recommendation and the platform's proven precedent (`sync-data.yml` for
data-import, `discover-content.yml` for content-ingestor) both point the
same direction: this is squarely a CI-offload candidate, not a chunking
problem (chunking is already solved — `?file=&offset=&limit=` on
`/index-vectors` is pattern A, done). Option 3 (script the loop locally,
keep it manual) is a real improvement over Option 1 with near-zero effort,
but doesn't fix the "did anyone actually run it" audit-trail gap that CI
naturally provides via run history.

**Recommendation:** Primary — **Option 2**, a `deploy-brain.yml` GitHub
Actions workflow, dispatched manually (`workflow_dispatch`) rather than on
every push (content updates are infrequent, driven by Chapter Approved
cadence, not commit cadence): run tests → `build-graph.ts` → R2 puts →
`wrangler deploy` → the full `/index-vectors` sweep (all core files +
all 29 faction files, looped in the workflow, not by hand) → verify a
non-zero `indexed` count per call before proceeding → client build → gateway
deploy. This is a straight port of `sync-data.yml`'s already-proven shape
(Rule 4: the underlying steps are already CLI scripts, so CI is a thin
wrapper, not new logic). Fallback — **Option 3**: if wiring the full
CI pipeline stalls, at minimum replace the hand-typed 29-line faction curl
loop in `DEPLOY.md` with a single checked-in script
(`scripts/reindex-brain.sh` or a Rule-4 CLI) that loops all files and
reports success/failure per file, so the failure mode becomes "script
printed an error" instead of "human silently skipped a line."
**Flip trigger:** if a stale-Vectorize-data bug is ever traced back to a
skipped manual step (the D2-06 silent-failure pattern), that's the signal
to stop deferring Option 2.

### (d) Server-driven card layout

**Decision:** finish migrating all card types to `LayoutRenderer` vs keep
dual rendering paths indefinitely.

**Current state, verified:** `card-layout.ts` (372 lines) exports exactly
one builder, `buildDatasheetLayout` — no `buildStratagemLayout`,
`buildEnhancementLayout`, etc. exist. `BrainScreen.tsx:1781-1799` confirms
the dispatch: for `activeCard.type === 'unit'`, it renders `LayoutRenderer`
**only if** a server `layout` was returned, **falling back to the old
732-line `UnitCard.tsx`** otherwise (`activeLayout ? <LayoutRenderer.../> :
<UnitCard.../>`); every other card type (`stratagem`, `enhancement`, `rule`,
`mission`, `twist`, `challenger`, plus `TerrainLayoutCard`,
`DeploymentZoneCard`, `ForceDispositionCard`, `DetachmentCard`,
`BalanceCard`, `CommunityCard`, `CoreRuleCard`, `ErrataCard`) always uses
its own bespoke TSX component. Total per-category card TSX: ~5,042 lines
across 15 components (`UnitCard.tsx` at 732 lines is the largest single
one). `apps/brain/CLAUDE.md` correctly documents this as an intentional
"opt-in migration," not an oversight.

| Option | Fit | Quality | Effort | Stack | Risk | Weighted |
|---|---|---|---|---|---|---|
| 1. Finish migrating all 15 card types | 4 | 4 | 2 | 5 | 4 | **3.6** |
| 2. Keep dual paths indefinitely (status quo) | 3 | 3 | 5 | 3 | 2 | 3.2 |
| 3. Migrate 2-3 highest-value types, defer rest | 4 | 4 | 4 | 4 | 4 | **4.0** |

(Weights: Effort and Risk weighted highest — this is a UI consistency
investment with no functional bug behind it today, not an incident.)

**Wargame:** Option 1 (finish everything) is the "right" end state per
Rule 2 (shared UI components) and Rule 8 (skinnable UI) — one generic
renderer beats 15 bespoke components for long-term maintenance, and
`apps/brain/CLAUDE.md` already documents the extension recipe ("implement
`buildXLayout()`... no new client components needed"), meaning the pattern
is proven, just not finished. But committing to migrate all 15 in one pass
is a large diff against zero reported bugs — this isn't paying down active
breakage, it's consistency debt. Option 2 (status quo) is defensible
short-term (nothing is broken; `UnitCard.tsx`'s fallback path means even
the migrated type degrades gracefully if `layout` is ever absent) but the
dual-path itself is the long-term risk D2-05/D2-08's own logic warns
about: two implementations of "how a datasheet card renders" will drift the
same way `battle-size` drifted into 3 copies (D2-04 #4-6) — a change to
stat-bar rendering has to be made twice, once in `card-layout.ts` +
`Renderer.tsx`, once in the fallback `UnitCard.tsx`, and nothing forces
parity.

**Recommendation:** Primary — **Option 3**: migrate `stratagem` and
`enhancement` next (the two next-most-frequently-viewed card types after
datasheet, per the search/browse UI's own category weighting), proving the
generic renderer handles a second and third shape (tables + pill-lists
already exist as primitives; stratagems/enhancements are structurally
closer to datasheets than, say, `ForceDispositionCard`'s bespoke layout).
Defer the remaining ~12 types until a concrete trigger. Fallback —
**Option 2, made explicit**: if UI capacity doesn't materialize, document
in `apps/brain/CLAUDE.md` that the dual-path is a permanent two-tier
design (server-driven for high-traffic types, bespoke for the long tail),
not a stalled migration — remove the word "prototype" from the section
header once that's the real decision. **Flip trigger:** a UI bug is traced
to divergence between `LayoutRenderer` output and a bespoke component for
the *same underlying node* (the drift failure mode), or a new card type is
added and the dev reaches for `buildXLayout()` unprompted because it's
genuinely less work than a new TSX file — that's the signal Option 1 has
organically become cheaper than Option 3 assumed.

## 3. Cross-cutting obligations

- **D2-04 (hand-transcribed content, `primary-missions.ts` /
  `challenger-cards.ts`, ~709 lines combined)** — verdict already made:
  **accept-in-code with an expiry trigger**, not a DB move today (Class C:
  no CA2025 PDF parser exists yet; a DB table would relocate the
  hand-transcription step, not remove it). This verdict does not reopen
  that call. Flip trigger per D2-04: the moment a PDF/markdown parser for
  Chapter Approved mission cards ships, **or** the next CA revision forces
  a second hand-edit of the same content (two manual edits = maintenance
  pattern, not one-time transcription). Also per D2-04 #15: finish deleting
  `11th-edition-detachments.ts` — extract its one surviving live node (Army
  Construction rules) into `core-rules.ts` or a DB row, then delete the
  file; this is resolved, not a live judgment call, and should land
  independently of the four decisions above.

- **D2-05 (chunking pattern class)** — `getAllNodes` is Class 4 (cold-start
  cache) and `/index-vectors` is already Class-A-compliant (cursor/offset,
  `?file=&offset=&limit=`, `BATCH_SIZE=50`). This verdict's (a) and (c)
  above implement D2-05's own hotspot-6 recommendation directly: (a) is
  D2-05's "apply A to the artifact" partition-the-fetch instruction; (c)'s
  CI wrapper is D2-05's "add a small CLI that loops nodeFiles × offset...
  wired into the existing rebuild/upload/deploy dance." No new chunking
  model is being invented here — this verdict operationalizes what D2-05
  already decided.

- **D2-08 (doc-drift fixes specific to brain)** — two concrete corrections,
  both verified stale against current code:
  1. **`MAX_LLM_CONTEXT`**: `apps/brain/CLAUDE.md`'s `/ask routing` table
     says the LLM/deterministic-fallback boundary is 40,000 chars; code
     (`worker.ts:1072`) sets `MAX_LLM_CONTEXT = 150000`, with an in-code
     comment stating the 40k figure is stale. Fix the doc table, not the
     code — this is LLM-context-shaped but the *fix* (correct a number in a
     CLAUDE.md) is non-LLM housekeeping in scope for W2.
  2. **Pinned model ID**: the doc's `/ask routing` table says `?model=claude`
     invokes "Anthropic Claude Sonnet" generically; code
     (`worker.ts:1046`) hardcodes the dated snapshot
     `claude-sonnet-4-20250514`. Either document the pin explicitly (with a
     note on who updates it and when) or parameterize it as an env var —
     the doc's vagueness currently hides a maintenance liability (a
     deprecated snapshot ID with no visible owner).
  3. **New finding from this verdict's own grounding** (fold into the same
     D2-08 pass): the edition-metadata comments at `retrieve.ts:470-472`
     and `apps/brain/CLAUDE.md`'s "Switchable edition filter" section both
     assert edition isn't in Vectorize metadata yet — false since PR #57
     (2b above). Same fix category as #1/#2: correct the prose, no code
     change.

## 4. Ordered work plan

1. **Doc-drift pass (D2-08, brain-specific)** — lowest effort, zero risk,
   do first: fix `MAX_LLM_CONTEXT` (40k → 150k) in `CLAUDE.md`, document
   the pinned Claude model ID and its owner, and correct the two
   edition-metadata comments (`retrieve.ts:470-472`,
   `CLAUDE.md`'s edition section) to reflect PR #57's shipped pre-filter.
2. **Finish D2-04 #15** — extract the one live node from
   `11th-edition-detachments.ts`, delete the file. Independent, small,
   already-decided.
3. **Script the re-index loop (fallback for 2c)** — even before CI lands,
   replace `DEPLOY.md`'s hand-typed 29-faction curl loop with one checked-in
   script that reports per-file success/failure. Immediate risk reduction,
   ships in under an hour, doesn't block the CI work.
4. **Build `deploy-brain.yml`** (2c primary) — port `sync-data.yml`'s shape:
   test → build-graph → R2 upload → wrangler deploy → full index-vectors
   sweep (using the script from step 3) → client+gateway build. Add a
   post-reindex verification step (non-zero `indexed` count per file) so a
   silent partial re-index becomes a loud CI failure (ties to D2-06).
5. **Partition `getAllNodes` callers (2a)** — add a per-file-scoped fetch
   path for `/browse/unit/:id`, `/browse/detachment/:id`, `/browse/node/:id`,
   and filtered `/search`/`/browse/nodes`; keep the full scan only for
   `/graph-data` and any genuinely cross-faction combo lookup. Test against
   existing test suite (52 server test files already cover these
   endpoints — extend, don't rewrite).
6. **Migrate `stratagem` + `enhancement` to `LayoutRenderer` (2d)** — lowest
   priority of the four decision points (no active bug), scheduled last;
   revisit scope after step 5 frees up capacity, or defer indefinitely per
   the Option-3 fallback if no capacity materializes — document the
   decision either way so "prototype" stops being the permanent word for a
   two-tier design that's actually intentional.
