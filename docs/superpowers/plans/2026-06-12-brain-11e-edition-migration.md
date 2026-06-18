# Brain 11e Edition Migration Plan

**Status:** proposed
**Author:** Micah + Claude
**Date:** 2026-06-12

---

## 1. Goal

The brain currently holds only 10th-edition content. Warhammer 40,000 11th Edition has shipped: the GW community site has the official 11e core rules PDF (and friends), and there will be no more 10e updates.

**End state:**

1. 11th edition is the **primary, default** content for every consumer of the brain (search, browse, ask, graph, PDF source overlay).
2. 10th edition content is **preserved and tagged** as legacy — discoverable but visually distinct, not appearing in default search results.
3. **All parsing lives inside `apps/brain/server/src/lib/parsers/`.** No more ad-hoc `scripts/11th-ingest/*.mjs`, no more pre-built JSON drops in `C:/R/sync-data/tools/11th-official/`. One pipeline: `gw-sync → brain/build-graph → R2 → Vectorize`.
4. The brain Node schema, R2 manifest, Vectorize metadata, and client UI are all **edition-aware**.
5. Tests, CLAUDE.md project rules, and documentation are updated to reflect the new state.

---

## 2. Why the current state is broken

Three parallel pipelines exist:

| Pipeline | Source | Output | Status |
|---|---|---|---|
| **gw-sync → brain/build-graph** | `C:/R/sync-data/tools/gw-sync/.local/gw/pdfs/*.pdf` (all 10e) | R2 + Vectorize | Live, automated |
| **scripts/11th-ingest** | `C:/R/sync-data/tools/11th-leak/` (leaked 11e French scans + English overlays) | `C:/R/sync-data/tools/11th-leak/brain-nodes/` | Manual, frozen at 2026-05-31 |
| **11th-official builders** | `C:/R/sync-data/tools/11th-official/core-rules.pdf` (real 11e PDF) | `C:/R/sync-data/tools/11th-official/brain-nodes/` (554 prebuilt JSONs) | Manual, never uploaded to R2 |

User-visible symptoms:

* Searching the brain for any 11e rule returns 10e text. `GET /brain/api/data/nodes/11th-rule-battle-round.json` → 404.
* Hitting `GET /brain/api/pages/warhammer-40-000-11th-ed-core-rules-free/page-1.png` → 404 (no 11e page PNGs in R2).
* The `Node.edition` field exists in `apps/brain/server/src/lib/model.ts:206` but is `z.string().optional()`, never set by 10e parsers, and unused by retrieval and UI.

Project rule violations:

* **Rule #1** "One data source per entity" — three rule sources, two of them disconnected.
* **Rule #3** "DRY across app boundaries" — parsing logic duplicated in `scripts/11th-ingest/*.mjs` and `apps/brain/server/src/lib/parsers/*.ts`.
* **Rule #5** "11th edition is the target" — code says it, infrastructure doesn't.

---

## 3. Architecture decisions

### 3.1 Edition is a first-class typed field

* `Node.edition: '10th' | '11th'` becomes a **required** typed union (not the current `z.string().optional()`).
* `BrainManifest` (`apps/brain/server/src/types.ts:12`) gains an `editions: ('10th' | '11th')[]` index so consumers can find content per edition without downloading every node file.
* Vectorize per-vector metadata gains `edition` so search can pre-filter at the index layer (no full-fetch + JS filter).

### 3.2 One pipeline, two parser families

All parsing lives in `apps/brain/server/src/lib/parsers/`. For each existing 10e parser, an 11e sibling is added:

| 10e parser | 10e source | 11e parser | 11e source |
|---|---|---|---|
| `core-rules.ts` | `markdown/core-rules.md` | `core-rules-11e.ts` | `markdown/warhammer-40-000-11th-ed-core-rules-free.md` |
| `rules-commentary.ts` | `markdown/core-rules-updates-and-rules-commentary.md` | `rules-commentary-11e.ts` | (11e equivalent when it ships) |
| `balance-dataslate.ts` | `markdown/balance-dataslate.md` | `balance-dataslate-11e.ts` | `markdown/balance-dataslate-11e.md` |
| `tournament-companion.ts` | `markdown/chapter-approved-tournament-companion.md` | `tournament-companion-11e.ts` | `markdown/chapter-approved-tournament-companion-11e.md` |
| `faction-pack.ts` | `markdown/faction-pack-*.md` (10e errata) | `faction-pack-11e.ts` | `markdown/11e-<faction>-*.md` (armageddon datasheets as starting reference) |
| `chapter-approved.ts` | `C:/R/sync-data/.local/chapter-approved/markdown/` | — | (probably folds into 11e mission deck if structure differs) |

`game-data.ts` (Wahapedia/BSData ingest) is **edition-agnostic** today — those data sources sync to whatever GW publishes. Tag output with `'11th'` once Wahapedia tracks 11e.

### 3.3 gw-sync is unchanged

gw-sync scrapes the GW community downloads page (`apps/brain/server` does not). When GW publishes the 11e PDF, gw-sync's normal scrape pulls it. 10e PDFs that are removed from the GW site simply stop refreshing; their `metadata.json` entries get a `frozen: true` flag manually so future scrapes don't try to re-download them.

### 3.4 Build-graph is the source of truth

`apps/brain/server/src/build-graph.ts` reads every markdown file in `gw-sync/.local/gw/markdown/`, dispatches to the right parser based on filename, and emits Nodes with proper `edition` tags. `SOURCE_DATES` (`build-graph.ts:45`) splits into per-edition maps:

```ts
const SOURCE_DATES_10E: Record<string, string> = { 'core-rules': '2024-06-01', ... }
const SOURCE_DATES_11E: Record<string, string> = { 'core-rules': '2026-06-01', ... }
```

### 3.5 R2 / Vectorize layout

Page PNGs use the source-title kebab as the directory, which already happens to encode edition (e.g., `pages/core-rules/` is 10e, `pages/warhammer-40-000-11th-ed-core-rules-free/` is 11e). No path changes needed.

Node files in `nodes/` are partitioned by layer + faction (see `apps/brain/server/src/lib/sync.ts:9` `partitionNodes`). The partition does **not** split by edition — both editions coexist in `core.json`, `faction-*.json`, etc. This is intentional: editions are queryable via the `edition` field, not via separate files.

### 3.6 Client surfaces edition

* New `EditionBadge` component renders `10E` (muted, slate-500) or `11E` (highlighted, amber-400) inline on every card header.
* Search default filter: `edition === '11th'`. Filter toggle `Include legacy 10e` in the search bar.
* Browse default sidebar filter: `edition === '11th'`.
* Vectorize search query passes `edition` metadata filter to the index (server-side).
* The `Ask` endpoint LLM context filters to 11e unless the user explicitly asks about 10e.

### 3.7 Ad-hoc scripts retire

After all parsers are ported, the following are deleted:

* All of `scripts/11th-ingest/` (15 files including `README.md`).
* `C:/R/sync-data/tools/11th-official/` (intermediate state).
* `C:/R/sync-data/tools/11th-leak/` (the original leak path).
* DB rows in `content_node_link_candidate` with `source LIKE '11th-ingest:%'`.
* `apps/brain/server/src/data/11th-edition-detachments.ts` (its content folds into `parseCoreRules11e` or `parseFactionPack11e`).

---

## 4. Pull request breakdown

Each PR ships independently. After each PR, the brain is in a working, deployed state. Branch naming: `feature/brain-11e/<short-name>`.

### PR-1 — Edition is typed and required

**Branch:** `feature/brain-11e/schema-edition-field`

**Goal:** lift `Node.edition` from optional untyped string to required `'10th' | '11th'` union. All existing nodes flow through as `'10th'`. Brain output unchanged.

**Files modified:**

* `apps/brain/server/src/lib/model.ts:205-206` — replace `edition: z.string().optional()` with `edition: z.enum(['10th', '11th'])`. Update the comment to describe the field as required.
* `apps/brain/server/src/lib/model.ts:206` — same change propagates to inferred `Node` type.
* `apps/brain/server/src/types.ts:12` (`BrainManifest`) — add `editions: ('10th' | '11th')[]` field.
* `apps/brain/server/src/build-graph.ts:60-66` — `stampPublishedAt()` helper grows a sibling `stampEdition(nodes, edition)`. Each parser call site stamps its edition.
* `apps/brain/server/src/build-graph.ts:88` `coreResult.nodes` → stamp `'10th'`.
* `apps/brain/server/src/build-graph.ts:100` `result.nodes` (rules commentary) → stamp `'10th'`.
* `apps/brain/server/src/build-graph.ts:115` (balance dataslate) → stamp `'10th'`.
* `apps/brain/server/src/build-graph.ts:136` (faction packs) → stamp `'10th'`.
* `apps/brain/server/src/build-graph.ts:172` (game-data) → stamp `'10th'` (temporary; flips to `'11th'` when Wahapedia ships 11e).
* `apps/brain/server/src/build-graph.ts:180-183` (community) → stamp `'10th'` (no edition for community knowledge today; defaults to current edition at time of ingestion — see Risk 6.3).
* `apps/brain/server/src/build-graph.ts:185-` (chapter approved) → stamp `'10th'`.
* `apps/brain/server/src/lib/sync.ts:80` `buildManifest()` — compute `editions` field by scanning node files for the union of `edition` values.
* `apps/brain/server/src/worker.ts:1101` `/index-vectors` handler — include `edition` in the Vectorize metadata payload at upsert time.
* `apps/brain/server/src/lib/retrieve.ts` — accept optional `edition: '10th' | '11th'` filter on `retrieve()`. Default behaviour: `undefined` = no filter (preserves current behaviour). Search endpoint adds the filter to the Vectorize query.

**Tests updated:**

* `apps/brain/server/src/lib/parsers/core-rules.test.ts` — fixtures get `edition: '10th'`.
* `apps/brain/server/src/lib/parsers/balance-dataslate.test.ts` — same.
* `apps/brain/server/src/lib/parsers/chapter-approved.test.ts` — same.
* `apps/brain/server/src/lib/parsers/faction-pack.test.ts` — same.
* `apps/brain/server/src/lib/parsers/game-data.test.ts` — same.
* `apps/brain/server/src/lib/parsers/rules-commentary.test.ts` — same.
* `apps/brain/server/src/lib/parsers/tournament-companion.test.ts` — same.
* `apps/brain/server/src/lib/build-graph.test.ts` (if exists, else add) — assert `stampEdition` is called for every parser result.
* `apps/brain/server/src/lib/sync.test.ts` — `buildManifest()` returns `editions` for mixed inputs.
* `apps/brain/server/src/lib/retrieve.test.ts` — search with `edition` filter passes through to Vectorize query.

**Deploy:** `cd apps/brain/server && npx tsx src/build-graph.ts && npx tsx src/upload-graph.ts && curl -X POST https://tabletop-tools.net/brain/api/index-vectors -H "Authorization: Bearer $SYNC_SECRET"`. After this, every node in R2 has `edition: '10th'` and every Vectorize row has `metadata.edition === '10th'`.

**Verify:** `curl -s 'https://tabletop-tools.net/brain/api/data/nodes/core.json' | jq '.[0].edition'` → `"10th"`.

---

### PR-2 — gw-sync ingests the 11e PDFs

**Branch:** `feature/brain-11e/gw-sync-11e-ingest`

**Goal:** the 11e core rules PDF (and any other 11e PDFs available on the GW downloads page) land in `gw-sync/.local/gw/pdfs/` and have `.md` + `.positions.json` siblings in `markdown/`. No brain-server changes.

**Files modified:**

* `C:/R/sync-data/tools/gw-sync/.local/gw/metadata.json` — manually add a `frozen: true` flag to 10e PDF entries whose URLs no longer appear on GW's downloads page. gw-sync's `metadata.ts:needsUpdate` (`C:/R/sync-data/tools/gw-sync/src/metadata.ts`) gets a fast-path that returns `false` for frozen entries.
* `C:/R/sync-data/tools/gw-sync/src/metadata.ts` — `needsUpdate(meta, url, sha)` checks `meta.pdfs[url]?.frozen === true` and short-circuits.

**Tests updated:**

* `C:/R/sync-data/tools/gw-sync/src/metadata.test.ts` — case: frozen entries are never re-downloaded even if SHA differs.

**Run:**

```sh
cd C:/R/sync-data/tools/gw-sync && pnpm start
```

Expected output: new `.md` + `.positions.json` files in `.local/gw/markdown/` for every 11e PDF the scraper found. The kebab-case filename comes from the PDF title. If no 11e PDFs appear on the GW downloads page, gw-sync's scraper (`C:/R/sync-data/tools/gw-sync/src/scraper.ts`) needs the selectors verified — fix the scraper in this same PR if needed.

**Verify:**

```sh
ls C:/R/sync-data/tools/gw-sync/.local/gw/markdown/ | grep -i 11
```

→ at least `warhammer-40-000-11th-ed-core-rules-free.md` + `.positions.json` exist (final filename depends on scraped title).

---

### PR-3 — parseCoreRules11e (no wire-in yet)

**Branch:** `feature/brain-11e/parser-core-rules`

**Goal:** new parser file. Reads 11e core rules markdown, emits Node[] with `edition: '11th'` and proper PDF source attribution. Not yet called by `build-graph.ts` — that's PR-4.

**Files added:**

* `apps/brain/server/src/lib/parsers/core-rules-11e.ts` — exports `parseCoreRules11e(markdown: string, retrievedAt: string): { nodes: Node[]; refs: NodeRef[] }`. Same signature shape as the 10e parser (`apps/brain/server/src/lib/parsers/core-rules.ts`).
* `apps/brain/server/src/lib/parsers/core-rules-11e.test.ts` — unit tests for every rule section the parser produces.
* `apps/brain/server/src/lib/parsers/core-rules-11e-outline.json` — port of `scripts/11th-ingest/core-rules-outline.json` (renamed and moved into the brain server's lib).
* `apps/brain/server/src/lib/parsers/core-rules-11e-overrides.json` — port of `scripts/11th-ingest/core-rules-content-overrides.json`.

**Source material to port:**

* `scripts/11th-ingest/build-core-rules-nodes.mjs` — full parsing logic (rule outline traversal, ref number assignment, parent/child linking).
* `scripts/11th-ingest/core-rules-outline.json` — structured outline of every rule with parent refs.
* `scripts/11th-ingest/core-rules-content-overrides.json` — manual content edits per rule.
* The 554 pre-built JSONs at `C:/R/sync-data/tools/11th-official/brain-nodes/` serve as the **golden fixture** — `parseCoreRules11e` on the 11e core rules markdown should produce a superset of (or exact match to) these. Use them in the test suite as the expected-output assertion.

**Tests:** target 100% line coverage on the new parser. The fixture-based test catches regressions.

**Deploy:** nothing. PR doesn't change runtime behaviour.

**Verify:** `cd apps/brain/server && pnpm test parsers/core-rules-11e` → green.

---

### PR-4 — Wire parseCoreRules11e into build-graph

**Branch:** `feature/brain-11e/wire-core-rules`

**Goal:** when build-graph runs, it parses BOTH 10e and 11e core rules. 11e nodes land in R2 + Vectorize. End-to-end search returns 11e content with edition tag.

**Files modified:**

* `apps/brain/server/src/build-graph.ts:30` — import `parseCoreRules11e`.
* `apps/brain/server/src/build-graph.ts:45-53` (`SOURCE_DATES`) — split into `SOURCE_DATES_10E` and `SOURCE_DATES_11E` maps. 11e core rules date: `'2026-06-01'`.
* `apps/brain/server/src/build-graph.ts:83-91` (existing core rules block) — wrap in `try`, tag output `'10th'`.
* `apps/brain/server/src/build-graph.ts:92` — add a sibling block for 11e:
  ```ts
  // ── 1b. Core Rules (11th edition) ───────────────────────────────────────
  console.log('1b. Core Rules (11th edition)')
  const coreRules11eRaw = readFileSync(
    join(MD_DIR, 'warhammer-40-000-11th-ed-core-rules-free.md'),
    'utf-8',
  )
  const coreRules11eNorm = normalizeMarkdown(coreRules11eRaw)
  const coreResult11e = parseCoreRules11e(coreRules11eNorm, RETRIEVED_AT)
  stampPublishedAt(coreResult11e.nodes, SOURCE_DATES_11E['core-rules']!)
  stampEdition(coreResult11e.nodes, '11th')
  allNodes.push(...coreResult11e.nodes)
  allRefs.push(...coreResult11e.refs)
  console.log(`   ${coreResult11e.nodes.length} nodes, ${coreResult11e.refs.length} refs`)
  ```

**Tests added:**

* `apps/brain/server/src/build-graph.test.ts` (or expand existing) — assert mixed-edition output contains both 10e and 11e nodes with correct edition tags.

**Deploy:**

```sh
cd apps/brain/server
npx tsx src/build-graph.ts
npx tsx src/upload-graph.ts
curl -X POST https://tabletop-tools.net/brain/api/index-vectors \
  -H "Authorization: Bearer $SYNC_SECRET"
```

**Verify:** `curl -s 'https://tabletop-tools.net/brain/api/data/nodes/core.json' | jq '[.[] | select(.edition == "11th")] | length'` → > 0 (probably ~150+). Search for "battle round" via `POST /search` returns both editions.

---

### PR-5 — 11e page PNGs uploaded to R2

**Branch:** `feature/brain-11e/page-images`

**Goal:** `PdfPageView` works end-to-end for 11e core rules — clicking a search result's PDF source opens the right page image with highlight rectangle.

**Source material:**

* gw-sync's `.local/gw/page-images/` directory (or whatever path gw-sync writes page images to — verify by inspecting after PR-2 runs).
* If gw-sync doesn't produce page images, use `apps/brain/server/src/generate-page-images.ts` (an existing script).

**Files added/modified:**

* `apps/brain/server/src/upload-page-images.ts` (new) — walks `gw-sync/.local/gw/page-images/<pdfName>/page-N.png` and uploads to R2 at `pages/<pdfName>/page-N.png`. Strips zero padding from filenames. Skips files already in R2 with matching SHA.
* `apps/brain/server/CLAUDE.md` — document the new script under Deploy section.

**Tests added:**

* `apps/brain/server/src/upload-page-images.test.ts` — mock R2, verify rename logic + skip-if-exists.

**Deploy:** `cd apps/brain/server && npx tsx src/upload-page-images.ts warhammer-40-000-11th-ed-core-rules-free`.

**Verify:** `curl -sI 'https://tabletop-tools.net/brain/api/pages/warhammer-40-000-11th-ed-core-rules-free/page-1.png'` → `200 OK`. Open the brain in browser, search "battle round", click source link → PDF page renders with highlight.

---

### PR-6 — parseBalanceDataslate11e + wire-in

**Branch:** `feature/brain-11e/parser-balance-dataslate`

**Goal:** 11e balance dataslate flows through brain. Search hits return 11e changes by default; 10e changes are tagged legacy.

**Files added:**

* `apps/brain/server/src/lib/parsers/balance-dataslate-11e.ts`.
* `apps/brain/server/src/lib/parsers/balance-dataslate-11e.test.ts`.

**Files modified:**

* `apps/brain/server/src/build-graph.ts:108-121` — split into 10e + 11e blocks, same pattern as PR-4.
* `apps/brain/server/src/build-graph.ts:49` (`SOURCE_DATES_11E`) — add `'balance-dataslate': '<11e dataslate date>'`.

**Source reference:**

* `C:/R/sync-data/tools/11th-official/balance-dataslate.pdf` — actual 11e PDF for sanity check.
* 10e parser `apps/brain/server/src/lib/parsers/balance-dataslate.ts` for shape baseline.

**Deploy + verify:** same pattern as PR-4.

---

### PR-7 — parseRulesCommentary11e + wire-in

**Branch:** `feature/brain-11e/parser-rules-commentary`

**Note:** depends on GW releasing an 11e rules commentary PDF. If absent at time of work, this PR is a stub parser (no-op return) + a wire-in that doesn't crash on missing file. Reframe as content-ready when the PDF lands.

**Files added:**

* `apps/brain/server/src/lib/parsers/rules-commentary-11e.ts`.
* `apps/brain/server/src/lib/parsers/rules-commentary-11e.test.ts`.

**Files modified:**

* `apps/brain/server/src/build-graph.ts:94-106` — split, same pattern.

---

### PR-8 — parseTournamentCompanion11e + wire-in

**Branch:** `feature/brain-11e/parser-tournament-companion`

**Goal:** 11e Chapter Approved tournament companion (currently at `C:/R/sync-data/tools/11th-official/chapter-approved-tournament-companion.pdf`) flows through.

**Files added:**

* `apps/brain/server/src/lib/parsers/tournament-companion-11e.ts`.
* `apps/brain/server/src/lib/parsers/tournament-companion-11e.test.ts`.

**Files modified:**

* `apps/brain/server/src/build-graph.ts` — add 11e tournament companion step, split SOURCE_DATES.

**Note on chapter approved missions:** the `apps/brain/server/src/build-graph.ts:185-` Chapter Approved 2025 missions block (which currently uses hand-transcribed `data/primary-missions.ts`) gets replaced or extended in this PR. The 11e Chapter Approved 2026-27 mission deck has structured cards — see `scripts/11th-ingest/build-brain-nodes.mjs` line 51-60 for the existing ingest logic to port.

---

### PR-9 — parseFactionPack11e + wire-in

**Branch:** `feature/brain-11e/parser-faction-pack`

**Goal:** 11e faction packs (or whatever GW calls the per-faction PDFs in 11e) flow through with full datasheet structure.

This PR is the biggest unknown until 11e faction packs ship. Current 11e per-faction content lives at `C:/R/sync-data/tools/11th-official/11e-orks-armageddon/` and `11e-space-marines-armageddon/` — these are pre-built JSONs from a custom builder.

**Files added:**

* `apps/brain/server/src/lib/parsers/faction-pack-11e.ts`.
* `apps/brain/server/src/lib/parsers/faction-pack-11e.test.ts`.

**Files modified:**

* `apps/brain/server/src/build-graph.ts:123-148` (faction pack loop) — extend to recognize 11e filenames (e.g., `markdown/11e-<faction>-*.md`) and dispatch accordingly.
* `apps/brain/server/src/lib/parsers/game-data.ts` — when Wahapedia ships 11e datasheets, flip its emit edition to `'11th'`. May be a separate PR if Wahapedia migrates on its own schedule.

**Sub-tickets:** one per faction, dependent on faction pack availability.

---

### PR-10 — EditionBadge UI + default-to-11e filter

**Branch:** `feature/brain-11e/client-edition-ux`

**Goal:** user-visible surfacing of edition. Search and browse default to 11e. Cards display badge. Toggle reveals 10e.

**Files added:**

* `apps/brain/client/src/components/EditionBadge.tsx` — `<EditionBadge edition="10th" />` or `"11th"`. Small inline badge, slate-500 muted for 10e, amber-400 highlight for 11e.
* `apps/brain/client/src/components/EditionBadge.test.tsx`.

**Files modified:**

* `apps/brain/client/src/lib/store.ts` — add `editionFilter: '10th' | '11th' | 'all'` to Zustand state, default `'11th'`. Add `setEditionFilter` action. Persist in localStorage for stickiness.
* `apps/brain/client/src/lib/hooks.ts` — `useSearch` and `useBrowse` pass `editionFilter` to the API call.
* `apps/brain/client/src/pages/BrainScreen.tsx` — add edition toggle in search bar and browse sidebar.
* `apps/brain/client/src/components/ResultCard.tsx` — render `<EditionBadge edition={node.edition} />` in header.
* `apps/brain/client/src/components/cards/CoreRuleCard.tsx` — same.
* `apps/brain/client/src/components/cards/DetachmentCard.tsx` — same.
* `apps/brain/client/src/components/cards/EnhancementCard.tsx` — same.
* `apps/brain/client/src/components/cards/StratagemCard.tsx` — same.
* `apps/brain/client/src/components/cards/UnitCard.tsx` — same.
* `apps/brain/client/src/components/cards/BalanceCard.tsx` — same.
* `apps/brain/client/src/components/cards/MissionCard.tsx` — same.
* `apps/brain/client/src/components/cards/CommunityCard.tsx` — same.
* `apps/brain/client/src/components/cards/DeploymentZoneCard.tsx` — same.
* `apps/brain/client/src/components/cards/ChallengerCard.tsx` — same.
* `apps/brain/client/src/components/cards/ErrataCard.tsx` — same.
* `apps/brain/client/src/components/Overlay.tsx` — same (overlay header).
* `apps/brain/client/src/components/FactionBanner.tsx` — same.
* `apps/brain/server/src/worker.ts` — `/search` and `/browse/nodes` accept optional `edition` query param, passes to retrieve.
* `apps/brain/server/src/lib/retrieve.ts` — `retrieve({ ..., edition })` filters Vectorize query.
* `apps/brain/server/src/lib/browse.ts` — `browseNodes({ ..., edition })` filters.

**Tests added/updated:**

* `apps/brain/client/src/components/EditionBadge.test.tsx`.
* `apps/brain/client/src/components/ResultCard.test.tsx` — assert badge renders.
* `apps/brain/client/src/lib/store.test.ts` — editionFilter persistence + toggle behaviour.
* `apps/brain/client/src/pages/BrainScreen.test.tsx` — default 11e, toggle shows 10e.
* `apps/brain/server/src/lib/retrieve.test.ts` — edition param honored.
* `apps/brain/server/src/lib/browse.test.ts` — edition param honored.

**Deploy:** build + deploy both client and worker (`scripts/deploy-all.sh` covers both).

**Verify:** open brain in browser. Search "battle round" — only 11e results visible. Toggle "Include legacy 10e" — both editions visible, each tagged.

---

### PR-11 — Retire ad-hoc 11th-ingest pipeline

**Branch:** `feature/brain-11e/retire-ingest-scripts`

**Goal:** delete all the ad-hoc bridging. Brain pipeline is the only source of truth for both editions.

**Pre-flight verification (in this PR's checklist before deletion):**

* Confirm no other app imports from `scripts/11th-ingest/*` (`pnpm rg "11th-ingest" --type ts --type tsx --type js` returns nothing in `apps/` or `packages/`).
* Confirm DB queries against `content_node_link` for the `brain_node_id` keys in `scripts/11th-ingest/build-brain-nodes.mjs:69` produce equivalent canonical mappings now that 11e nodes come from brain build-graph. If not, write a fix-up SQL block first.
* `npx tsx scripts/11th-ingest/build-brain-nodes.mjs --dry` output diff against new in-brain parser output → should be empty (or expected delta).

**Files deleted (all of `scripts/11th-ingest/`):**

* `scripts/11th-ingest/README.md`
* `scripts/11th-ingest/build-brain-nodes.mjs`
* `scripts/11th-ingest/build-core-rules-nodes.mjs`
* `scripts/11th-ingest/build-datasheet-nodes.mjs`
* `scripts/11th-ingest/build-gallery.mjs`
* `scripts/11th-ingest/build-markdown.mjs`
* `scripts/11th-ingest/core-rules-content-overrides.json`
* `scripts/11th-ingest/core-rules-outline.json`
* `scripts/11th-ingest/crop.mjs`
* `scripts/11th-ingest/ingest-game-tracker.mjs`
* `scripts/11th-ingest/ingest-versus.mjs`
* `scripts/11th-ingest/overlay-cards.mjs`
* `scripts/11th-ingest/overlay-rules.mjs`
* `scripts/11th-ingest/overlay.mjs`
* `scripts/11th-ingest/populate-can-lead.mjs`

**Files deleted (sync-data):**

* `C:/R/sync-data/tools/11th-official/` — entire tree (PDFs are duplicates of what gw-sync now manages; brain-nodes/ output is now produced in-app).
* `C:/R/sync-data/tools/11th-leak/` — entire tree (leak path is fully obsolete now that the official PDF is in pipeline).

**DB cleanup (run as one-shot SQL in this PR):**

```sql
DELETE FROM content_node_link_candidate
WHERE source LIKE '11th-ingest:%';

DELETE FROM content_node_link
WHERE brain_node_id IN (
  SELECT brain_node_id FROM content_node_link
  WHERE brain_node_id LIKE '11th-%'
  -- and reinsert from the new in-brain pipeline's content_node_link rows
);
```

Exact SQL depends on what `apps/brain/server/src/lib/parsers/*-11e.ts` emit for canonical id mapping. Final SQL is drafted in PR-11 description, run via `.local/db-migrations/2026-06-XX-retire-11th-ingest.sql`.

**Files modified:**

* `apps/brain/server/src/data/11th-edition-detachments.ts` — content folds into `parseCoreRules11e` or `parseFactionPack11e`. File deleted after.
* `apps/brain/server/src/build-graph.ts:14` — remove the `import { build11thEditionNodes }` line (and its call site, currently in the same file).

**Tests:**

* No regressions in any existing brain test suite.
* `pnpm -r build` clean.

---

### PR-12 — Docs + CLAUDE.md updates

**Branch:** `feature/brain-11e/docs`

**Files modified:**

* `CLAUDE.md:39` (project rule #5) — rewrite to:
  > "11th edition is the active edition. 10th edition content is preserved in the brain and tagged as legacy but is not updated. New features, parsers, rules logic, and data sync target 11th edition exclusively."
* `apps/brain/CLAUDE.md` — update Architecture section (3.1) to mention edition-aware schema. Update Endpoint table to show `edition` query param on `/search` and `/browse/nodes`. Add a new section "Edition-aware pipeline" with the diagram from §3 of this plan. Note that page PNG paths use kebab of source title (which encodes edition).
* `apps/brain/client/CLAUDE.md` — document `EditionBadge` component and the default-to-11e store behaviour.
* `docs/schema-indexeddb-brain.md` — update Node schema doc to reflect edition union typing.
* `docs/etl-data-pipelines.md` — update ETL diagram to show per-edition parser dispatch.

---

### PR-13 — E2E verification + production deploy

**Branch:** `feature/brain-11e/e2e-verification`

**Files added:**

* `e2e/brain/11e-core-rules.spec.ts` — open brain, search "battle round", assert 11e result shows first with edition badge. Click source → PDF page modal opens. Toggle "Include legacy 10e" → both editions visible.
* `e2e/brain/edition-filter.spec.ts` — browse view, filter toggle changes results.

**Files modified:**

* `e2e/playwright.config.ts` — add the new brain specs to the `public` project (no auth needed for brain).
* `apps/brain/server/CLAUDE.md` Deploy section — note `/index-vectors` re-run after schema changes.

**Run:**

```sh
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test brain/
```

**Deploy via `scripts/deploy-all.sh`** (covers Worker + client + auth + gateway).

---

## 5. Code reference index

Every file touched by this plan, grouped by concern. Cross-reference for review.

### Schema + types

* `apps/brain/server/src/lib/model.ts:205-206` — `Node.edition` field tightening
* `apps/brain/server/src/types.ts:12` — `BrainManifest.editions`

### Brain server — pipeline core

* `apps/brain/server/src/build-graph.ts` — multiple line ranges, see PR-1 / PR-4 / PR-6 / PR-7 / PR-8 / PR-9
* `apps/brain/server/src/upload-graph.ts` — no changes (works for any node files in `.local/brain/nodes/`)
* `apps/brain/server/src/lib/sync.ts:80` — `buildManifest()` edition aggregation
* `apps/brain/server/src/lib/pdf-positions.ts:163` — `mapNodesToPages()` already iterates by source title; no edition-specific change

### Brain server — parsers (new 11e siblings)

* `apps/brain/server/src/lib/parsers/core-rules-11e.ts` (new)
* `apps/brain/server/src/lib/parsers/core-rules-11e.test.ts` (new)
* `apps/brain/server/src/lib/parsers/core-rules-11e-outline.json` (new, ported)
* `apps/brain/server/src/lib/parsers/core-rules-11e-overrides.json` (new, ported)
* `apps/brain/server/src/lib/parsers/balance-dataslate-11e.ts` (new)
* `apps/brain/server/src/lib/parsers/balance-dataslate-11e.test.ts` (new)
* `apps/brain/server/src/lib/parsers/rules-commentary-11e.ts` (new)
* `apps/brain/server/src/lib/parsers/rules-commentary-11e.test.ts` (new)
* `apps/brain/server/src/lib/parsers/tournament-companion-11e.ts` (new)
* `apps/brain/server/src/lib/parsers/tournament-companion-11e.test.ts` (new)
* `apps/brain/server/src/lib/parsers/faction-pack-11e.ts` (new)
* `apps/brain/server/src/lib/parsers/faction-pack-11e.test.ts` (new)

### Brain server — runtime

* `apps/brain/server/src/worker.ts:1101` — `/index-vectors` adds edition metadata
* `apps/brain/server/src/worker.ts` (search + browse handlers) — accept `edition` query param
* `apps/brain/server/src/lib/retrieve.ts` — `edition` filter
* `apps/brain/server/src/lib/browse.ts` — `edition` filter

### Brain server — new tooling

* `apps/brain/server/src/upload-page-images.ts` (new) — page PNG uploader
* `apps/brain/server/src/upload-page-images.test.ts` (new)

### Brain server — to be removed

* `apps/brain/server/src/data/11th-edition-detachments.ts` — folds into faction-pack-11e parser

### Brain client — new UI

* `apps/brain/client/src/components/EditionBadge.tsx` (new)
* `apps/brain/client/src/components/EditionBadge.test.tsx` (new)

### Brain client — modified

* `apps/brain/client/src/lib/store.ts` — `editionFilter` state
* `apps/brain/client/src/lib/hooks.ts` — pass `editionFilter` to API
* `apps/brain/client/src/pages/BrainScreen.tsx` — toggle UI
* All `apps/brain/client/src/components/cards/*.tsx` — render badge in header
* `apps/brain/client/src/components/ResultCard.tsx` — render badge
* `apps/brain/client/src/components/Overlay.tsx` — render badge
* `apps/brain/client/src/components/FactionBanner.tsx` — render badge

### gw-sync

* `C:/R/sync-data/tools/gw-sync/src/metadata.ts` — `frozen` flag handling
* `C:/R/sync-data/tools/gw-sync/src/metadata.test.ts` — test for frozen entries
* `C:/R/sync-data/tools/gw-sync/.local/gw/metadata.json` — manual `frozen: true` flags on 10e entries

### Ad-hoc pipeline (to be deleted)

* `scripts/11th-ingest/` — all 15 files
* `C:/R/sync-data/tools/11th-official/` — entire directory
* `C:/R/sync-data/tools/11th-leak/` — entire directory

### Database

* `content_node_link_candidate` rows with `source LIKE '11th-ingest:%'` — DELETE
* `content_node_link` rows whose `brain_node_id LIKE '11th-%'` — UPDATE to point to new brain pipeline canonical ids

### Documentation

* `CLAUDE.md:39` — project rule #5 rewrite
* `apps/brain/CLAUDE.md` — architecture + endpoint table + pipeline section
* `apps/brain/client/CLAUDE.md` — EditionBadge + store behaviour
* `docs/schema-indexeddb-brain.md` — Node schema doc
* `docs/etl-data-pipelines.md` — ETL diagram

### E2E

* `e2e/brain/11e-core-rules.spec.ts` (new)
* `e2e/brain/edition-filter.spec.ts` (new)
* `e2e/playwright.config.ts` — register new specs

### Deploy / verify

* `scripts/deploy-all.sh` — unchanged
* `scripts/deploy-workers.sh` — unchanged
* `scripts/verify-deployment.sh` — could add a curl check for 11e page PNG availability

---

## 6. Risks

### 6.1 GW publishes a different 11e PDF later

The 11e core rules PDF URL on the GW community site may rev (errata, layout updates) and gw-sync will pull the new one. `parseCoreRules11e` needs to be tolerant of minor structural shifts. Mitigation: the outline-based parser in PR-3 is data-driven (outline JSON), so most changes are content edits, not parser edits.

### 6.2 11e faction packs aren't released as discrete PDFs

10e faction packs were per-codex documents. 11e may consolidate into the core rules + Munitorum + Chapter Approved cycle. If that's the case, PR-9 reframes: the per-faction data comes from Wahapedia/BSData (already in game-data parser) and `parseFactionPack11e` becomes a no-op or is removed entirely.

### 6.3 Community knowledge has no edition

`apps/brain/server/src/lib/combat-knowledge.ts` produces community nodes from content-ingestor output. These have a `publishedAt` from the video/article date but no inherent edition. PR-1 stamps `'10th'` as a placeholder. Real fix: stamp based on `publishedAt` (< 2026-06-01 → 10th, otherwise → 11th). Park this as part of PR-1 polish, not a separate PR.

### 6.4 Vectorize re-index is slow

`/index-vectors` chunks via `?offset=&limit=` (see `apps/brain/server/index-changed.mjs`). For 10e + 11e combined, the index will be roughly 2x larger. PR-1 deploy may take 30+ min. Document expected runtime in PR-1 and PR-4 deploy notes.

### 6.5 PR-9 may need to split per faction

If 11e faction parsing requires per-faction tuning, ship a base `parseFactionPack11e` framework in PR-9, then one PR per faction. Don't try to land all 20+ factions in one PR.

### 6.6 Cross-edition refs

`Node.refs` cross-link nodes by `sourceId` and `targetId`. A 10e node may reference another 10e node. After migration, 11e nodes will reference 11e nodes. **Cross-edition refs should NOT exist** — if `parseCoreRules11e` somehow emits a `targetId` pointing to a 10e node id, that's a bug. Add an assertion in `apps/brain/server/src/lib/sync.ts:buildManifest()` that flags cross-edition refs.

---

## 7. Out of scope (explicitly)

Nothing. Per Micah's instruction: no debt parked, no out-of-scope. If something looks like it should be in scope but isn't here, that's an oversight to call out — not a deferral.

---

## 8. Verification at each PR

Every PR gates on:

1. `pnpm -r typecheck` clean
2. `pnpm -r test` green
3. `pnpm -r build` clean
4. For server changes: deploy to prod via `scripts/deploy-*.sh`, then `curl` checks per PR description
5. For client changes: open browser at https://tabletop-tools.net/brain, smoke check the change

Final PR (PR-13) gates on:

* Full e2e suite green against prod
* CLAUDE.md project rule #5 reads correctly
* `scripts/11th-ingest/` no longer exists in the repo
* `nodes/core.json` in R2 has ~150+ entries with `edition: '11th'`
* `pages/warhammer-40-000-11th-ed-core-rules-free/page-1.png` in R2 returns `200 OK`
* Search for "battle round" in default mode returns 11e content first

---

## 9. PR dependency graph

```
PR-1 (schema)
 ├─→ PR-3 (parseCoreRules11e)
 │    └─→ PR-4 (wire core rules) ──→ PR-5 (page images)
 ├─→ PR-6 (balance dataslate)
 ├─→ PR-7 (rules commentary)
 ├─→ PR-8 (tournament companion)
 ├─→ PR-9 (faction pack)
 └─→ PR-10 (UI)

PR-2 (gw-sync) ──→ PR-3, PR-6, PR-7, PR-8, PR-9 (provides markdown inputs)

PR-4, PR-6, PR-7, PR-8, PR-9, PR-10 done → PR-11 (retire) → PR-12 (docs) → PR-13 (e2e + deploy)
```

PR-1 and PR-2 can ship in parallel. PRs 6-9 can ship in any order after PR-1 + PR-2. PR-10 can ship in parallel with PRs 6-9. PR-11 / PR-12 / PR-13 are strictly sequential.

---
