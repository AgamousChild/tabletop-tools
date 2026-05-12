# Brain Damage Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 28 issues found during testing of the brain unified retrieval feature. Every fix must be verified against the full dataset — no marking complete without evidence.

**Architecture:** Fixes span three layers: (1) faction display name mapping (server + client), (2) unit datasheet data accuracy (parsing, keywords, loadouts), (3) UI behavior consistency across all 4 tabs (Ask/Search/Browse/Graph). All clickable actions must work identically regardless of which tab the user is on.

**Tech Stack:** TypeScript, Hono (server), React (client), Vitest, Cloudflare R2/Vectorize

---

## Issue Summary

| # | Issue | Area | Severity |
|---|---|---|---|
| 1 | Weapon abilities (Sustained Hits, Devastating Wounds) not clickable on every datasheet | Client: UnitCard | High |
| 2 | Weapon names are incorrectly clickable; clicking closes card with no navigation | Client: UnitCard | High |
| 3 | Close button (circle X) too large, obscures content | Client: Overlay | Medium |
| 4 | Unit ability names clickable but do nothing in Browse/Graph/Ask | Client: UnitCard + BrainScreen | High |
| 5 | "Other" keyword showing in UI — internal classification, not a real keyword | Client: keyword filtering | Medium |
| 6 | Deadly Demise missing its value (D3, D6, etc.) | Client: keyword parsing | High |
| 7 | Multi-faction units show duplicated keywords; need separate datasheets per faction | Server: build pipeline + records | Critical |
| 8 | Faction-specific keywords (Deathwing, Ravenwing) showing on all faction variants | Server: build pipeline + records | Critical |
| 9 | Incorrect keyword associations (Power Armor on wrong units) | Server: keyword audit | High |
| 10 | Armor-type keywords are mechanical, not display keywords — hide from datasheet | Client: keyword filtering | Medium |
| 11 | Faction IDs showing raw slugs instead of English names (top-left of card) | Client: faction display mapping | High |
| 12 | Leader/specialist loadouts not differentiated (Shas'ui in Breachers) | Server: parsing | High |
| 13 | Alternate loadouts completely missing from datasheets | Server: parsing + Client: UnitCard | Critical |
| 14 | "Adeptus Astartes" should display as "SPACE MARINES" | Client + Server: faction naming | High |
| 15 | Faction IDs in result lists showing slugs, not English names | Client: ResultCard + FactionBanner | High |
| 16 | Exact name match not the first search result | Server: retrieve.ts scoring | High |
| 17 | "Heretic Astartes" should display as "CHAOS SPACE MARINES" | Client + Server: faction naming | High |
| 18 | Search results not paginating | Client: SearchTab | Critical |
| 19 | Search only returning units, no other record types | Server: retrieve.ts or worker.ts | Critical |
| 20 | Search result count not displayed (removed instead of fixed) | Client: SearchTab | High |
| 21 | Search and Browse result lists not consistent | Client: shared result component | High |
| 22 | Detachment cards missing or badly formatted | Client: buildCardFromNode + DetachmentPage | Critical |
| 23 | Keyword click behavior broken (was: add to search; plan: show rule) | Client: onContentClick across tabs | Critical |
| 24 | Ask tab giving incorrect cross-faction answers (regression) | Server: format.ts / LLM prompt | Critical |
| 25 | Ask keyword results showing rule snippets instead of proper cards | Client: AskTab card rendering | High |
| 26 | PDF overlays still incorrect | Server: pdf-positions + build pipeline | High |
| 27 | Process: need antagonistic reviewer checking every node/result/card | Process | — |
| 28 | Process: work must be iterative and autonomous with self-validation | Process | — |

---

## Success Criteria

Every item below must be verified with evidence (test output, screenshots, or data audit) before this plan is considered complete.

1. **Every weapon on every datasheet has clickable ability keywords** — Sustained Hits, Devastating Wounds, Lethal Hits, Hazardous, Blast, Torrent, etc. are all links. Weapon NAMES are NOT links.
2. **Clicking any link works identically on Ask, Search, Browse, and Graph tabs** — keyword click → navigate to the rule for that keyword on the CURRENT tab. If the user is on Browse, the rule opens on Browse. If on Search, it opens on Search. No closing cards with no navigation. No tab-specific dead ends.
3. **Close button is small and non-obstructive** — positioned so it doesn't overlap card content.
4. **"Other" never appears in the UI** — not in keywords, not in unit type badge.
5. **Deadly Demise shows its value** — "Deadly Demise D3", "Deadly Demise D6", etc.
6. **Multi-faction units are separate datasheets** — Rhino appears as "Chaos Space Marines Rhino", "World Eaters Rhino", etc. Each has its own keywords, abilities, and points.
7. **Faction-specific keywords only appear on that faction's variant** — Deathwing only on Dark Angels variant of Bladeguard Veterans.
8. **Mechanical keywords (armor type) hidden from display** — Power Armor, Gravis, Terminator armor etc. not shown on datasheet keyword bar.
9. **All faction displays use English names in ALL CAPS** — "SPACE MARINES" not "space-marines". "T'AU EMPIRE" not "t-au-empire". "CHAOS SPACE MARINES" not "heretic-astartes".
10. **Preferred faction names**: Space Marines (not Adeptus Astartes), Chaos Space Marines (not Heretic Astartes). Formal names kept as keywords, not display names. Abbreviations (SM, CSM, BA, etc.) work as search aliases.
11. **All alternate loadouts shown on datasheets** — every weapon option, equipment swap, sergeant/leader upgrade visible.
12. **Exact name match is result #1** — searching "Chaos Spawn" returns Chaos Spawn as the first result. Exact match only, no fuzzy.
13. **Search pagination works** — page forward/back, total count displayed.
14. **Search returns all record types** — units, stratagems, enhancements, rules, army rules, detachments, missions, twists, challengers.
15. **Search and Browse use the same result card layout** — minus score display in Browse.
16. **Detachment cards render properly** — with ability, stratagems, and enhancements formatted correctly.
17. **Keyword clicks show the RULE for that keyword** — not add to search filter. The rule card opens.
18. **Ask tab scopes answers to the queried faction only** — no cross-faction mixing.
19. **PDF overlays correctly positioned** — verified against all faction packs.
20. **Total result count always displayed** in search results.

---

## Task Groups

### Group A: Faction Display Name System (Issues #11, #14, #15, #17)

**Problem:** Faction IDs (slugs like `space-marines`, `heretic-astartes`, `t-au-empire`) are shown directly in the UI. Need a mapping layer that converts slugs to preferred English display names.

**Files:**
- Create: `apps/brain/client/src/lib/faction-names.ts`
- Create: `apps/brain/client/src/lib/faction-names.test.ts`
- Modify: `apps/brain/client/src/components/ResultCard.tsx`
- Modify: `apps/brain/client/src/components/FactionBanner.tsx`
- Modify: `apps/brain/client/src/components/cards/UnitCard.tsx`
- Modify: `apps/brain/server/src/lib/faction-detect.ts` (add abbreviation aliases)

- [ ] **Step 1: Write faction-names.ts with display name map**

```typescript
// Slug → preferred English display name (ALL CAPS)
const FACTION_DISPLAY_NAMES: Record<string, string> = {
  'space-marines': 'SPACE MARINES',
  'chaos-space-marines': 'CHAOS SPACE MARINES',
  't-au-empire': "T'AU EMPIRE",
  'astra-militarum': 'ASTRA MILITARUM',
  'adepta-sororitas': 'ADEPTA SORORITAS',
  'adeptus-custodes': 'ADEPTUS CUSTODES',
  'adeptus-mechanicus': 'ADEPTUS MECHANICUS',
  'grey-knights': 'GREY KNIGHTS',
  'imperial-agents': 'IMPERIAL AGENTS',
  'imperial-knights': 'IMPERIAL KNIGHTS',
  'chaos-knights': 'CHAOS KNIGHTS',
  'death-guard': 'DEATH GUARD',
  'thousand-sons': 'THOUSAND SONS',
  'world-eaters': 'WORLD EATERS',
  'chaos-daemons': 'CHAOS DAEMONS',
  'leagues-of-votann': 'LEAGUES OF VOTANN',
  'genestealer-cults': 'GENESTEALER CULTS',
  'aeldari': 'AELDARI',
  'drukhari': 'DRUKHARI',
  'tyranids': 'TYRANIDS',
  'necrons': 'NECRONS',
  'orks': 'ORKS',
}

// Subfaction display names
const SUBFACTION_DISPLAY_NAMES: Record<string, string> = {
  'blood angels': 'BLOOD ANGELS',
  'dark angels': 'DARK ANGELS',
  'space wolves': 'SPACE WOLVES',
  'black templars': 'BLACK TEMPLARS',
  'deathwatch': 'DEATHWATCH',
  'ultramarines': 'ULTRAMARINES',
  // ... all subfactions
}

export function factionDisplayName(slugOrName: string): string {
  // Check slug map first
  const fromSlug = FACTION_DISPLAY_NAMES[slugOrName]
  if (fromSlug) return fromSlug
  // Check subfaction map
  const fromSub = SUBFACTION_DISPLAY_NAMES[slugOrName.toLowerCase()]
  if (fromSub) return fromSub
  // Already a display name? Uppercase it
  if (slugOrName.includes(' ') || !slugOrName.includes('-')) return slugOrName.toUpperCase()
  // Unknown slug — best effort: replace hyphens, uppercase
  return slugOrName.replace(/-/g, ' ').toUpperCase()
}
```

- [ ] **Step 2: Write tests for faction-names.ts**
- [ ] **Step 3: Replace all raw factionId displays** in ResultCard, FactionBanner, UnitCard header, BrowseTab result items with `factionDisplayName(factionId)`
- [ ] **Step 4: Add abbreviation aliases to server faction-detect.ts** — SM, CSM, BA, DA, SW, BT, DW, DG, TS, WE, GK, etc.
- [ ] **Step 5: Run tests, verify**
- [ ] **Step 6: Commit**

---

### Group B: Keyword Accuracy & Filtering (Issues #5, #6, #8, #9, #10)

**Problem:** Keywords shown on datasheets include internal classifications ("Other"), mechanical tags ("Power Armor"), and missing values ("Deadly Demise" without D3/D6). Faction-specific keywords leak across variants.

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx` — `filterDisplayKeywords()` function
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx` — `buildUnitData()` for Deadly Demise
- Audit: `apps/brain/server/src/build-graph.ts` — keyword assignment during build

- [ ] **Step 1: Update filterDisplayKeywords to exclude "Other" and armor-type keywords**

Add to the `internal` regex pattern:
```
|^other$|^power armou?r$|^gravis$|^terminator$|^phobos$|^tacticus$|^mk x|^artificer armou?r$
```

- [ ] **Step 2: Fix Deadly Demise value extraction**

In `buildUnitData()`, the `coreAbilities` extraction currently just takes "deadly demise" as a string. Change to:
```typescript
// Extract parameterized abilities with their values
const deadlyDemise = allKeywords.find(k => /^deadly demise/i.test(k))
// If the keyword doesn't have the value, check content for "Deadly Demise D3" etc.
```

Also check if the build pipeline preserves the value (e.g., "Deadly Demise D3" vs just "deadly demise").

- [ ] **Step 3: Audit keyword sources in build-graph.ts** — trace where "Other", armor types, and parameterized abilities are assigned
- [ ] **Step 4: Write tests for keyword filtering**
- [ ] **Step 5: Run tests, verify**
- [ ] **Step 6: Commit**

---

### Group C: Multi-Faction Unit Separation (Issues #7, #8, #12, #13)

**Problem:** Units shared across factions (Rhino, Bladeguard Veterans) are merged into one datasheet. They should be separate per faction, each with faction-specific keywords, loadouts, and points. Alternate loadouts are completely missing.

This is the largest and most critical group. It requires changes to the build pipeline.

**Files:**
- Modify: `apps/brain/server/src/build-graph.ts` — per-faction unit splitting
- Modify: `apps/brain/server/src/lib/merge-sources.ts` — handle faction-specific dedup
- Audit: BSData source files for how loadout options are encoded
- Modify: weapon/ability node content to include alternate loadouts

- [ ] **Step 1: Understand current merge logic** — read merge-sources.ts to understand how multi-faction units are currently handled
- [ ] **Step 2: Understand BSData loadout encoding** — read parser to see if alternate loadouts are parsed and dropped, or never parsed
- [ ] **Step 3: Design the split** — when a unit appears in multiple factions, create separate datasheet nodes with `{factionId}:{unitId}` composite IDs. Each gets:
  - Its faction-specific keywords only
  - Its faction-specific points
  - Its faction-specific abilities (if any)
  - All alternate loadout options for that faction
- [ ] **Step 4: Implement the split in build-graph.ts**
- [ ] **Step 5: Implement alternate loadout parsing** — ensure weapon options, equipment swaps, and leader upgrades are included in weapon/ability nodes
- [ ] **Step 6: Write tests for the split logic**
- [ ] **Step 7: Rebuild the graph and verify** — count datasheets before/after, spot-check Rhino variants, Bladeguard Veterans per faction
- [ ] **Step 8: Update UnitCard to display alternate loadouts** — add a section below weapons showing "Options:" or "Wargear Options:"
- [ ] **Step 9: Verify leader/specialist differentiation** — Shas'ui in Breachers, sergeants in tactical squads, etc.
- [ ] **Step 10: Run full test suite**
- [ ] **Step 11: Commit**

---

### Group D: Click Behavior Consistency (Issues #2, #4, #17, #23)

**Problem:** `onContentClick` in UnitCard adds terms to `activeFilters` and closes the card. This only works on Search tab. On Browse, Graph, and Ask, nothing visible happens. Weapon names and ability names are clickable but shouldn't navigate — OR should navigate to the rule for that ability.

**New behavior spec:**
- **Weapon ability keywords** (Sustained Hits, Lethal Hits, etc.) → open the RULE CARD for that keyword
- **Weapon names** → NOT clickable (they're data, not navigation)
- **Unit ability names** → open the RULE CARD for that ability if one exists, otherwise do nothing
- **Keywords bar** → open the RULE CARD for that keyword if one exists
- **Faction keywords** → filter/search for that faction
- **Leader names** → open that leader's datasheet
- This must work the same on ALL FOUR TABS

**Files:**
- Modify: `apps/brain/client/src/components/cards/UnitCard.tsx`
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx` — `cardContext.onContentClick`
- Modify: `apps/brain/client/src/components/cards/types.ts` — CardContext type

- [ ] **Step 1: Remove Clickable wrapper from weapon names** in UnitCard WeaponTable
- [ ] **Step 2: Make weapon ability tags clickable** — replace the static `<span>` in WeaponAbilityTags with a Clickable that navigates to the rule
- [ ] **Step 3: Change onContentClick behavior** — instead of adding to filters, fetch the rule node for the clicked term and open it as a card. Sequence: (a) search for term as a core mechanic/rule, (b) if found, open the rule card, (c) if not found, fall back to adding as a search filter
- [ ] **Step 4: Make this work across all tabs** — the `handleOpenCard` function is already shared. The issue is that `onContentClick` currently does `setActiveCard(null)` then `setActiveFilters(...)`. Change it to fetch + open the rule card instead.
- [ ] **Step 5: Unit ability names** — keep clickable only if they map to a known rule. Otherwise, remove the Clickable wrapper.
- [ ] **Step 6: Write tests for click behavior**
- [ ] **Step 7: Run tests, verify on all tabs**
- [ ] **Step 8: Commit**

---

### Group E: Overlay & Close Button (Issue #3)

**Files:**
- Modify: `apps/brain/client/src/components/Overlay.tsx`

- [ ] **Step 1: Shrink close button and reposition**

Change the close button from `h-12 w-12` / `h-10 w-10` to a smaller size that doesn't obscure content:
```tsx
<button
  aria-label="Close"
  onClick={onDismiss}
  className="absolute top-2 right-2 z-10 h-6 w-6 flex items-center justify-center rounded-full bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-100 transition-colors text-sm"
>
  ✕
</button>
```

Remove the mobile-specific fixed positioning. The backdrop click already serves as dismiss on mobile.

- [ ] **Step 2: Update Overlay tests**
- [ ] **Step 3: Commit**

---

### Group F: Search Fixes (Issues #16, #18, #19, #20)

**Problem:** Search only returns units, doesn't paginate, doesn't show total count, and doesn't prioritize exact name matches.

**Files:**
- Modify: `apps/brain/server/src/lib/retrieve.ts` — exact name boost, return all types
- Modify: `apps/brain/server/src/worker.ts` — search endpoint response
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx` — SearchTab total count display

- [ ] **Step 1: Diagnose why only units are returned** — trace the retrieve() → records path. Check if `returnRecords: true` aggregation is collapsing non-unit types. Check if Vectorize query only returns datasheets.
- [ ] **Step 2: Fix record type diversity** — ensure stratagems, enhancements, rules, army rules, detachments, missions all come through in search results
- [ ] **Step 3: Add exact name match boost** — in retrieve.ts, after getting Vectorize results, check if any result's title exactly matches the query (case-insensitive). If so, move it to position 0 with score 1.0.
- [ ] **Step 4: Verify pagination is wired** — the server endpoint has pagination logic. Check if client is sending page/pageSize and rendering the Pagination component. The code appears to have this, so debug why it's not working.
- [ ] **Step 5: Add total count display** — in SearchTab, show total above results:
```tsx
{response?.total != null && (
  <p className="text-xs text-slate-500">{response.total} results</p>
)}
```
- [ ] **Step 6: Write tests**
- [ ] **Step 7: Run tests, verify**
- [ ] **Step 8: Commit**

---

### Group G: Result List Consistency (Issue #21)

**Problem:** Search and Browse result cards look different. They should use the same component with the same layout.

**Files:**
- Modify: `apps/brain/client/src/components/ResultCard.tsx` — make score optional
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx` — BrowseTab uses ResultCard

- [ ] **Step 1: Make score optional in ResultCard** — don't show percentage when score is undefined/0
- [ ] **Step 2: Replace BrowseTab's inline card markup** with ResultCard component
- [ ] **Step 3: Apply `factionDisplayName()` in ResultCard for factionId display**
- [ ] **Step 4: Write tests**
- [ ] **Step 5: Commit**

---

### Group H: Detachment Cards (Issue #22)

**Problem:** Detachment cards either don't render or render as raw nodes.

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx` — `buildCardFromNode` for detachment-rule
- Modify: `apps/brain/client/src/pages/DetachmentPage.tsx`
- Audit: server browse endpoint for detachment data completeness

- [ ] **Step 1: Trace detachment rendering path** — `buildCardFromNode` sends `detachment-rule` to the generic `rule` type. But `handleOpenCard` has special detachment handling via `openDetachmentPage`. Verify the detection logic works.
- [ ] **Step 2: Fix DetachmentPage data fetching** — the `openDetachmentPage` function fetches from `/browse/nodes?layer=detachment` which may not return all related nodes. Fix the query.
- [ ] **Step 3: Ensure detachment rules format correctly** — ability text, stratagems with WHEN/TARGET/EFFECT, enhancements with cost
- [ ] **Step 4: Test with "Berzerker Warband" search**
- [ ] **Step 5: Commit**

---

### Group I: Ask Tab Quality (Issues #24, #25)

**Problem:** Ask tab mixes abilities from all factions. Gemini integration not wired in. Rule cards from keyword clicks show raw snippets.

**Files:**
- Modify: `apps/brain/server/src/lib/format.ts` — LLM prompt scoping
- Modify: `apps/brain/server/src/worker.ts` — Ask endpoint context assembly
- Audit: Gemini integration status

- [ ] **Step 1: Scope LLM context to detected faction** — in the Ask endpoint, after retrieve() returns faction-filtered results, the context assembly (`assembleContext`) must ONLY include nodes from the detected faction. Currently it may include all retrieved nodes regardless of faction.
- [ ] **Step 2: Add explicit faction scoping instruction to LLM prompt** — e.g., "Only discuss abilities available to {faction}. Do not mention abilities from other factions or chapters."
- [ ] **Step 3: Audit Gemini integration** — check if `callGemini` is actually called and its results used, or if it's dead code
- [ ] **Step 4: Fix keyword result rendering in Ask** — when clicking a keyword in Ask results, the rule card should open with full formatting (not a raw snippet)
- [ ] **Step 5: Write tests for scoped answers**
- [ ] **Step 6: Commit**

---

### Group J: PDF Overlays (Issue #26)

**Problem:** Overlays are still mispositioned.

**Files:**
- Audit: `apps/brain/server/src/lib/pdf-positions.ts`
- Audit: R2 stored position data
- Modify: position data if needed

- [ ] **Step 1: Check if deployed data has the fixes** — the position bug fix from the plan may not have been deployed. Verify R2 data matches the fixed positions.
- [ ] **Step 2: Clear CDN cache** — Cloudflare may be serving stale page images or position data
- [ ] **Step 3: Spot-check 10 random overlays** across different factions
- [ ] **Step 4: If positions are wrong, run the position verification test harness against all nodes with PDF sources and fix systematically**
- [ ] **Step 5: Commit if changes needed**

---

## Execution Order

```
A (faction names) → can start immediately, unblocks G
B (keywords) → can start immediately
C (multi-faction split) → can start immediately, largest task
D (click behavior) → can start immediately
E (overlay size) → can start immediately, smallest task
F (search fixes) → can start immediately
G (result consistency) → depends on A
H (detachment cards) → can start after F
I (ask quality) → can start immediately
J (PDF overlays) → can start immediately
```

**Parallel tracks:**
- Track 1: A → G (faction display names, then result consistency)
- Track 2: C (multi-faction split — needs focused work)
- Track 3: D + E (click behavior + overlay — related UI fixes)
- Track 4: F → H (search fixes → detachment cards)
- Track 5: B + I + J (keywords, ask quality, PDF overlays)

---

## Validation Protocol (Issues #27, #28)

After each group is implemented:

1. Run full test suite (`vitest run`)
2. Build and deploy to staging
3. **Automated data audit**: Script that loads every node from R2 and verifies:
   - No "Other" in display keywords
   - No raw faction slugs in user-facing fields
   - Every Deadly Demise has a value
   - Multi-faction units have separate datasheets
   - Every datasheet has at least one weapon
   - Every detachment has at least one stratagem
4. **Manual spot-check**: 5 units from 5 different factions, opened from each of the 4 tabs
5. Only after 1-4 pass, mark the group complete

**No group is complete until validated. No plan is complete until all groups pass.**
