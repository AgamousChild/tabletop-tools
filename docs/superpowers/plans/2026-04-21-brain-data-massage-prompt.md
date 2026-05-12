You are working on `apps/brain/` in the `tabletop-tools` monorepo at `C:\R\tabletop-tools`. The Brain app is deployed at `tabletop-tools.net/brain/`. The server Worker is `tabletop-tools-brain` on Cloudflare. You have full access to the codebase and all deployment credentials are in the root `.env`.

## How the Data Pipeline Works Today

`apps/brain/server/src/build-graph.ts` runs locally via `npx tsx src/build-graph.ts`. It:

1. Loads Wahapedia JSON files from `apps/data-import/client/public/wahapedia/` — `datasheets.json`, `datasheet_wargear.json`, `datasheet_models.json`, `unit_abilities.json`, `unit_keywords.json`, `unit_compositions.json`, `unit_costs.json`, `wargear_options.json`, `detachments.json`, `detachment_abilities.json`, `stratagems.json`, `enhancements.json`, `abilities.json`, `leader_attachments.json`
2. Loads GW PDF markdown from `C:/R/sync-data/tools/gw-sync/.local/gw/markdown/` — core rules, faction packs, balance dataslate, boarding actions
3. Loads Chapter Approved parsed markdown from `C:/R/sync-data/.local/chapter-approved/markdown/`
4. Calls parsers: `convertGameData()` (game-data.ts), `parseFactionPack()` (faction-pack.ts), `parseCoreRules()` (core-rules.ts), `parseChapterApproved()` (chapter-approved.ts), `parseTournamentCompanion()` (tournament-companion.ts)
5. Calls `mergeSources(allNodes, allRefs)` — normalizes factionIds to kebab slugs, assigns `factionName`, deduplicates by ID (first wins, keywords merged), tags summaries
6. Calls `mapNodesToPages(nodes, positionsDir)` — reads `.positions.json` sidecar files, fuzzy-matches node titles to PDF text blocks, calculates `topPct`/`heightPct`/`leftPct`/`widthPct` overlay coordinates (PDF Y=0 is bottom, CSS top=0 is top — the inversion is now handled correctly)
7. Partitions nodes into `nodes/core.json`, `nodes/faction-*.json`, `nodes/unit-*.json`, etc.
8. Builds forward/reverse ref indexes, entity index
9. Writes everything to `.local/brain/`, then manually uploaded to R2

The output is ~14,644 nodes across 36 node files and 29 ref/index files.

## How the Server Works

`apps/brain/server/src/worker.ts` is a Hono app. On first request per Worker isolate, it loads ALL nodes from R2 into a module-scope cache (`getAllNodes()`). Subsequent requests read from memory.

Key endpoints:
- `POST /search` — Vectorize semantic search → `retrieve()` → `buildRecords()` → attach errata + entity links → paginate → return records
- `POST /ask` — retrieve + assemble context → LLM (Llama 3.3 70B or Claude) → formatted answer with references
- `GET /browse/layers` — returns browse categories with counts (defined in `BROWSE_CATEGORIES` array)
- `GET /browse/nodes?layer=X&page=N` — paginated nodes for a browse category
- `GET /browse/unit/:id` — datasheet + weapons + abilities
- `GET /browse/detachment/:id` — detachment + stratagems + enhancements + abilities
- `GET /browse/node/:id` — single node lookup
- `GET /pages/:pdf/:page.png` — PDF page images from R2

## How the Client Renders Cards

`apps/brain/client/src/pages/BrainScreen.tsx` is 1340 lines. It has:

- `buildUnitData(node)` — parses stat line, keywords, points, composition, loadout, wargear options, core abilities from node content
- `fetchFullUnitData(nodeId, node)` — calls `/browse/unit/:id` to get weapons + abilities
- `buildStratagemData(node)` — parses WHEN/TARGET/EFFECT from content
- `buildEnhancementData(node)` — parses cost, restriction, description from content
- `buildRuleData(node)` — title, description, sources
- `buildCardFromNode(node)` — switch on `node.category` → returns `CardData`
- `handleOpenCard(node)` — **currently checks for PDF source first** — if found AND not a mission/twist/challenger/datasheet/detachment-rule, opens `PdfPageView` instead of a card. This is the problem.
- `handleOpenRecord(record)` — same PDF-first logic for search results
- `cardContext.onContentClick` — searches for a rule matching the clicked term, opens as a card

Card components exist at `apps/brain/client/src/components/cards/`:
- `UnitCard.tsx` — full datasheet with stat line, weapon tables, abilities, keywords, wargear options
- `StratagemCard.tsx` — CP cost, WHEN/TARGET/EFFECT sections
- `EnhancementCard.tsx` — cost, restriction, description, detachment footer (recently redesigned)
- `RuleCard.tsx` — generic rule card with description and PDF source button
- `MissionCard.tsx` — primary/secondary mission card
- `TwistCard.tsx` — twist rule text
- `ChallengerCard.tsx` — mission + paired stratagem
- `PdfPageView.tsx` — full-screen PDF page image with overlay highlight
- `ErrataSection.tsx` — collapsible errata list (used inside other cards)
- `ComboView.tsx` — two-card layout
- `types.ts` — all card data interfaces

## The Node Schema

From `apps/brain/server/src/lib/model.ts`:

```typescript
export const NodeSchema = z.object({
  id: z.string().min(1),
  layer: NodeLayerSchema,           // 'core' | 'faction' | 'unit' | 'errata' | 'balance' | 'community'
  category: NodeCategorySchema,     // 'datasheet' | 'weapon' | 'unit-ability' | 'stratagem' | 'enhancement' | 'detachment-rule' | 'faction-ability' | 'phase-sequence' | 'core-mechanic' | 'terrain' | 'army-construction' | 'mission' | 'faq' | 'commentary' | 'balance-change' | 'primary-mission' | 'secondary-mission' | 'twist' | 'challenger' | 'deployment-zone' | 'terrain-layout'
  title: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().min(1),
  phase: GamePhaseSchema.optional(),
  factionId: z.string().optional(),
  factionName: z.string().optional(),
  detachmentId: z.string().optional(),
  datasheetId: z.string().optional(),
  sources: z.array(SourceSchema).min(1),
  refs: z.array(NodeRefSchema),
  effectiveDate: z.string().optional(),
  supersededBy: z.string().optional(),
  version: z.number().int().positive(),
  subfaction: z.string().optional(),
  keywords: z.array(z.string()),
})
```

## Verified Data Problems

Found by running `apps/brain/server/src/validate-all.ts` against all 14,644 nodes:

**Phantom nodes (266+ confirmed):** Stat-line text fragments (`"10\" 2+ 6+"`, `"-3+ 7+"`, `"+"`) from faction pack PDF markdown get parsed as `enhancement` or `faction-ability` nodes. Created by `faction-pack.ts` when `inEnhancementZone = true` picks up datasheet stat blocks that follow enhancement sections in the PDF. Currently filtered in browse display only — still in R2 data, still in search index, still returned by API.

**Over-split core rules (~30 nodes):** The wound roll table, hit roll table, and similar structured tables in core rules are parsed as individual nodes per row. Title is just `"+"` or a dice result. Each is meaningless alone. Source: `core-rules.ts` treating each markdown heading as a separate node.

**PDF overlay as sole content (~200 nodes):** Nodes in `core` and `faction` layers where `content` is "INVULNERABLE SAVE" or a single keyword, and all meaningful data is in the PDF overlay. When PDF image fails to load or overlay coordinates are wrong, user sees nothing.

**Wrong PDF references:** `pdf-positions.ts` uses fuzzy title matching. "Sustained Hits" matches correctly, but shorter or generic titles ("Restrictions", "Keywords") match wrong headings. ~30% of `faction-ability` nodes have no PDF source at all.

**No card for several categories:** `deployment-zone`, `terrain-layout`, `balance-change`, `faq`, `commentary` all fall through to generic `RuleCard`. `detachment-rule` opens a separate `DetachmentPage` component instead of a card. No `Community` card.

**PDF-first rendering:** `handleOpenCard` checks for PDF source before showing a card. If PDF exists → PdfPageView. If image fails → "Page image unavailable" with zero text content. No fallback to card. This makes ~40% of non-unit nodes unreadable when PDF fails.

## Card Design Reference

All cards use this design language (from the approved HTML reference):

- **Background**: slate-950 (#0f172a), card border: 2px solid slate-700
- **Headers**: Oswald font, uppercase, tracking-wide, white text
- **Body**: Source Sans 3, 10-11px, slate-300/slate-400
- **Accent colors by type**: Blue (stratagems, detachments), Purple (enhancements), Amber (army rules, core rules), Green (abilities, deployment), Orange (errata), Red (balance), Cyan (community)
- **Structure**: Accent-colored border-bottom on header, compact padding (8-14px), detachment/faction footer in 8px uppercase tracking-widest slate-500

Stratagem card has a blue sidebar with CP diamond. Enhancement card has purple top border with cost on the right. Army Rule card has amber border with sub-rules in bordered boxes. Detachment Rule card has blue border with chapter badge.

## What to Build

### 1. Massage Layer: `apps/brain/server/src/lib/massage.ts`

Runs in `build-graph.ts` after `mergeSources()`, before `mapNodesToPages()`. Input: `Node[]`. Output: cleaned `Node[]`.

**Drop phantom nodes:**
- Title matches `/^[\d\-\u2011+\".\s]+$/`
- `content` < 20 chars AND category not in `['datasheet', 'detachment-rule', 'deployment-zone', 'terrain-layout']`
- Duplicate `summary` within same `category` + `factionId` (keep first)

**Merge over-split table rows:**
- Find sequences of nodes on the same PDF page where titles are fragments (< 5 chars or all symbols)
- Merge their content into the preceding node that has a real title
- Preserve the parent's PDF position (expand `heightPct` to cover merged rows)

**Ensure content independence:**
- Every node's `content` must be > 30 chars and not just echo the title
- When insufficient: populate from `summary`, then from sibling nodes, then add `qualityFlags: ['content-inferred']`

**Validate:**
- PDF refs: page > 0, all percentages 0-100, non-zero area
- Hierarchy: weapons/abilities have valid `datasheetId`, stratagems/enhancements have valid `detachmentId`
- Add appropriate `qualityFlags` for issues

**Log summary** at end.

### 2. Schema: Add `qualityFlags: z.array(z.string()).optional()` to `NodeSchema` in `model.ts`

### 3. Card Components: `apps/brain/client/src/components/cards/`

Create these new cards matching the design language:

- **CoreRuleCard** (amber) — rule name, full text, phase badge, tables rendered as `<table>`. Replaces generic RuleCard for core-mechanic and phase-sequence categories.
- **DeploymentZoneCard** (green) — name, battle size, PDF image inline (primary view since these are diagrams), text fallback.
- **TerrainLayoutCard** (green) — layout number, PDF image inline, text fallback.
- **ErrataCard** (orange) — title, target rule (clickable), correction text, date.
- **BalanceCard** (red) — change title, affected units, old/new values, date.
- **CommunityCard** (cyan) — title, body, source.
- **DetachmentCard** (blue) — name, faction, ability, stratagems + enhancements inline (collapsible). Replaces DetachmentPage.

### 4. Display Resilience: `apps/brain/client/src/lib/card-display.ts`

```typescript
function resolveCardView(node, record?): { card: CardData; pdfSource?: PdfSource; qualityFlags: string[] }
```

- Always returns a card. Never PDF-only.
- `handleOpenCard` and `handleOpenRecord` in BrainScreen.tsx use this instead of inline PDF-first logic.
- Cards show a "View Source" button when PDF exists. Clicking opens PdfPageView as a secondary modal.
- When content is empty and no PDF, show "Data limited" state with summary.

### 5. Integration

- `build-graph.ts`: after `mergeSources()` → `nodes = massage(nodes)` → then `mapNodesToPages()`
- `BrainScreen.tsx`: replace `handleOpenCard`/`handleOpenRecord` with `resolveCardView()`, remove all PDF-first branching
- `worker.ts`: no changes
- `validate-all.ts`: add quality flag distribution to summary

### Requirements

- TypeScript, Vitest tests alongside implementation
- Massage layer tests use real bad-data examples (stat-line titles, phantom enhancements, over-split wound roll rows)
- Card tests verify rendering with mock data and missing fields
- Do not rewrite parsers — massage layer only
- Do not change Node schema beyond adding `qualityFlags`
- Match existing code style
