# Brain Linked Answers + Re-query Filter — Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every unit name, stratagem name, enhancement name, rule name, and core mechanic in brain answers clickable. Clicking opens the card overlay (from Plan 1). Clicking content ON a card closes the overlay and re-queries the brain with that term as a filter.

**Architecture:** A `<LinkedText>` component wraps answer text and detects entity names to make them clickable. A `useCardNavigation` hook manages the overlay lifecycle and re-query flow. The re-query adds the clicked term to the current query as a filter that impacts results and highlights matching content.

**Tech Stack:** React, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-14-brain-card-ui-design.md`
**Depends on:** Plan 1 (card components + overlay)

**Test commands:**
- Client: `cd apps/brain/client && pnpm test`

---

## File Map

### Create

| File | Responsibility |
|---|---|
| `apps/brain/client/src/lib/entity-linker.ts` | Detect entity names in text, return linked segments |
| `apps/brain/client/src/lib/entity-linker.test.ts` | Tests |
| `apps/brain/client/src/components/LinkedText.tsx` | Renders text with clickable entity links |
| `apps/brain/client/src/components/LinkedText.test.tsx` | Tests |
| `apps/brain/client/src/lib/card-data-builder.ts` | Builds CardData from brain API response nodes |
| `apps/brain/client/src/lib/card-data-builder.test.ts` | Tests |

### Modify

| File | Change |
|---|---|
| `apps/brain/client/src/pages/BrainScreen.tsx` | Use LinkedText in Ask/Search/Browse, add re-query filter state |
| `apps/brain/server/src/worker.ts` | Add `filter` query param support to `/search` and `/ask` endpoints |

---

## Task 1: Entity linker

**Files:**
- Create: `apps/brain/client/src/lib/entity-linker.ts`
- Create: `apps/brain/client/src/lib/entity-linker.test.ts`

- [ ] **Step 1: Write entity-linker tests**

Test: given raw answer text and a list of known entity names from the response (unit names, stratagem names, etc.), return segments of plain text and linked entities.

```typescript
// Tests should cover:
// - Plain text with no entities → single text segment
// - Text containing a unit name → splits into text + link + text
// - Multiple entities in one string
// - Entity names are case-insensitive
// - Overlapping matches take longest match
// - Weapon ability tags like [DEVASTATING WOUNDS] are linkable
// - Core mechanic names (Sustained Hits, Feel No Pain) are linkable
```

- [ ] **Step 2: Run tests — verify fail**
- [ ] **Step 3: Implement entity-linker**

The linker receives text + a map of `entityName → { type, nodeId }`. It scans the text for matches and returns an array of `{ text, link?: { name, type, nodeId } }` segments.

- [ ] **Step 4: Run tests — verify pass**
- [ ] **Step 5: Commit**

---

## Task 2: LinkedText component

**Files:**
- Create: `apps/brain/client/src/components/LinkedText.tsx`
- Create: `apps/brain/client/src/components/LinkedText.test.tsx`

- [ ] **Step 1: Write LinkedText tests**

```typescript
// Tests should cover:
// - Renders plain text normally when no entities
// - Renders entity names as clickable amber links
// - Calls onEntityClick(name, type, nodeId) when link clicked
// - Renders weapon ability tags [TORRENT] as clickable
```

- [ ] **Step 2: Run tests — verify fail**
- [ ] **Step 3: Implement LinkedText**

Uses `entity-linker` to split text into segments. Plain segments render as `<span>`. Linked segments render as `<button className="text-amber-400 hover:underline cursor-pointer">` that calls `onEntityClick`.

- [ ] **Step 4: Run tests — verify pass**
- [ ] **Step 5: Commit**

---

## Task 3: Card data builder

**Files:**
- Create: `apps/brain/client/src/lib/card-data-builder.ts`
- Create: `apps/brain/client/src/lib/card-data-builder.test.ts`

- [ ] **Step 1: Write card-data-builder tests**

```typescript
// Tests should cover:
// - Builds UnitCardData from a brain node with category 'datasheet'
// - Builds StratagemCardData from a brain node with category 'stratagem'
// - Builds EnhancementCardData from category 'enhancement'
// - Builds RuleCardData from category 'faction-ability' (army rule — no detachmentId)
// - Builds RuleCardData from category 'faction-ability' (detachment rule — with detachmentId)
// - Returns null for categories that don't have cards (weapon, core-mechanic, etc.)
// - Parses weapon profiles from node content
// - Extracts WHEN/TARGET/EFFECT from stratagem content
```

- [ ] **Step 2: Run tests — verify fail**
- [ ] **Step 3: Implement card-data-builder**

`buildCardData(node, connectedNodes?)` maps brain API response nodes to the `CardData` union type. For unit cards, it needs the datasheet node + its weapon nodes + ability nodes (fetched via `/browse/node/:id` or from the response's connected nodes). For stratagems, it parses the content text for WHEN/TARGET/EFFECT sections.

- [ ] **Step 4: Run tests — verify pass**
- [ ] **Step 5: Commit**

---

## Task 4: Wire LinkedText into Ask/Search/Browse

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`

- [ ] **Step 1: Build entity map from API response**

After each Ask/Search response, extract entity names from the results: node titles, weapon names from content, ability names. Build the entity map for LinkedText.

- [ ] **Step 2: Replace raw text rendering with LinkedText in AskTab**

The answer div currently uses `renderMarkdown()` with `dangerouslySetInnerHTML`. Replace plain text entity names with LinkedText components. For markdown-rendered HTML, post-process the HTML to wrap entity names in clickable elements.

- [ ] **Step 3: Replace raw text in SearchTab result summaries**

ResultCard summaries become LinkedText.

- [ ] **Step 4: Replace raw text in BrowseTab**

Node summaries and content become LinkedText.

- [ ] **Step 5: Wire onEntityClick → open card overlay**

When a linked entity is clicked:
1. Call `buildCardData` to construct the card data
2. Set the overlay state with the card data and highlight context
3. The overlay opens with the appropriate card component

- [ ] **Step 6: Run all client tests**
- [ ] **Step 7: Commit**

---

## Task 5: Re-query filter behavior

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`
- Modify: `apps/brain/server/src/worker.ts` (if filter param needed)

- [ ] **Step 1: Add filter state to each tab**

Each tab (Ask, Search, Browse) gets a `filters: string[]` state that accumulates clicked terms.

- [ ] **Step 2: onContentClick on cards adds filter and re-queries**

When `context.onContentClick(term)` is called from a card:
1. Close the overlay
2. Add `term` to the current tab's filter state
3. Re-run the query with the filter applied
4. The filter is shown as a chip/badge above results (removable)

- [ ] **Step 3: Show active filters as chips**

Above results, show each active filter as a removable chip. Clicking the X on a chip removes that filter and re-queries.

- [ ] **Step 4: Pass filters to API**

Add filters to the search/ask request body. The server uses them to prioritize/filter results. If the server doesn't support a `filters` param yet, add it.

- [ ] **Step 5: Highlight matching content in results**

When filters are active, highlight matching terms in result summaries and answer text using a subtle background color.

- [ ] **Step 6: Run all tests**
- [ ] **Step 7: Commit**

---

## Task 6: Integration test

- [ ] **Step 1: Run all client tests**
- [ ] **Step 2: Build client**
- [ ] **Step 3: Deploy and run E2E tests**
- [ ] **Step 4: Commit if any fixups**

---

## Task Summary

| Task | Description | Dependencies |
|---|---|---|
| 1 | Entity linker | None |
| 2 | LinkedText component | 1 |
| 3 | Card data builder | None |
| 4 | Wire LinkedText into all tabs | 1, 2, 3, Plan 1 |
| 5 | Re-query filter behavior | 4 |
| 6 | Integration test | All |

Tasks 1 and 3 can run in parallel.
