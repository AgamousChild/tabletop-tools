# Brain Record-Level Search & Browse Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the brain app from returning raw graph nodes to returning complete, meaningful records — full datasheets, army rule cards, stratagems, detachment pages — with pagination, inline entity links, errata annotations, correct PDF overlays, and inter-record navigation.

**Architecture:** A server-side "record aggregation" layer groups child nodes into parent containers. Every record carries its applicable errata and inline entity links in its text content. The client renders records with collapsible errata sections and clickable inline links. PDF overlay positions are verified with a test harness.

**Tech Stack:** TypeScript, Hono (server), React (client), Vitest, Cloudflare R2/Vectorize

---

## Current State Analysis

### The Node Problem

The knowledge graph has **14,581 nodes**. The user never wants to see a node. They want to see **records** — complete, self-contained rule definitions.

| Category | Count | What user sees | Container |
|---|---|---|---|
| weapon | 5,888 | Part of a unit datasheet | datasheetId → datasheet |
| unit-ability | 2,513 | Part of a unit datasheet | datasheetId → datasheet |
| stratagem | 1,596 | Standalone stratagem card | Self |
| enhancement | 1,425 | Standalone enhancement card | Self |
| datasheet | 1,151 | Full unit card (with all weapons + abilities) | Self (top-level) |
| faction-ability | 997 | **Army Rule Card** (164 top-level) or detachment ability (833) | Self or detachmentId |
| detachment-rule | 325 | Detachment page (with stratagems + enhancements) | Self |
| commentary | 220 | Attached to the rule it clarifies | Self → targets via `clarifies` ref |
| faq | 169 | Attached to the rule it clarifies | Self → targets via `clarifies` ref |
| phase-sequence | 87 | Rule card + PDF page | Self |
| balance-change | 73 | Balance card | Self |
| core-mechanic | 59 | Rule card + PDF page | Self |
| terrain | 31 | Rule card + PDF page | Self |
| mission | 19 | Rule card | Self |
| army-construction | 16 | Rule card | Self |

### Record Types (what the user actually sees)

1. **Unit Record** — datasheet + ALL weapons + ALL unit-abilities. Full stat line, weapon tables, ability descriptions. Source: faction pack PDF page.
2. **Army Rule Card** — faction name, rule name, full rule text with sub-rules, tables, callout text. Source: faction pack PDF page (NOT wahapedia/bsdata). 164 of these exist across 26 factions. Examples: Oath of Moment, Acts of Faith, Strands of Fate.
3. **Detachment Record** — detachment rule + its stratagems + enhancements + detachment abilities.
4. **Stratagem Record** — CP cost, phase, WHEN/TARGET/EFFECT. Links to its detachment.
5. **Enhancement Record** — cost, restriction, description. Links to its detachment.
6. **Rule Record** — core-mechanic, phase-sequence, terrain, army-construction, mission. Full rule text + PDF page image with overlay. Must include ALL applicable errata/FAQ as a collapsible section.
7. **Errata Record** — faq/commentary. Attached to the rule it clarifies. Also standalone-browseable.
8. **Balance Record** — balance-change. Standalone.

#### Chapter Approved / Mission Cards (NEW — not yet in the graph)

These are the competitive play cards that define how games are scored and played. Updated each "season" (roughly yearly). Currently Chapter Approved 2025 / Pariah Nexus.

Source PDFs: `C:\R\sync-data\tools\ChapterApproved\` (8 files). Parsed markdown: `C:\R\sync-data\.local\chapter-approved\markdown\` (flat text, needs structured re-parsing). Structured parser: `C:\R\sync-data\tools\chapter-approved-sync\`.

9. **Primary Mission Card** — Name, VP conditions (WHEN/scoring formula), actions (if any), special setup rules. ~14 cards. Example: "Take and Hold" (5VP per objective, max 15VP), "Scorched Earth" (burn objectives action).
10. **Secondary Mission Card** — Name, attacker/defender variant, fixed/tactical type, VP conditions, actions, WHEN DRAWN triggers. ~40 cards (20 attacker + 20 defender). Example: "Assassination" (4VP per character destroyed, fixed), "Behind Enemy Lines" (3VP for units in enemy deployment zone).
11. **Deployment Zone Card** — Name, battle size (Incursion/Strike Force/Asymmetric), zone dimensions, objective marker positions. ~11 layouts. Example: "Dawn of War", "Hammer and Anvil". These are primarily diagrams — render as PDF page images.
12. **Twist Card** — Name, rule text. Simple rule modifications to the game. ~9 cards. Example: "Night Fighting" (18" range limit), "Bloodlust" (18" charge range, 3d6 charge roll).
13. **Challenger Card** — Name, mission + paired stratagem (name, CP cost, WHEN/TARGET/EFFECT). Each card is a mission-stratagem pair. ~10 cards. Example: "Attrition" (3VP for destroying enemy units) + "Pivotal Moment" stratagem.
14. **Terrain Layout Card** — Layout number, terrain piece positions with measurements. ~8 layouts. Primarily visual — render as PDF page images.
15. **Tournament Companion Rules** — The mission sequence, reserves restrictions, secret missions, actions, VP scoring structure. From the Pariah Nexus and Chapter Approved Tournament Companion PDFs. These are rule records, not cards — they describe how the cards are used.

### The Five Problems

1. **Search returns nodes, not records** — "lascannon" returns 50 weapon nodes. Should return datasheets that have lascannons.
2. **No pagination** — no prev/next on any interface.
3. **PDF overlays mispositioned** — highlight rectangles wrong or broken from caching.
4. **No inter-record links** — results don't link to related rules/units. Clicking "Sustained Hits" in a weapon ability should navigate to the core rule.
5. **Browse lists 14,581 nodes** — should list ~2,000 top-level records.

### Additional Requirements (from Micah)

6. **Army Rule Cards** — fully formed: army name, rule names, full text, sub-rules, tables, callout data, original PDF page reference. Not partial definitions.
7. **Errata on every record** — every rule/unit/stratagem result must include all errata that reference it, as a collapsible expandable section.
8. **Inline entity links, not a footer section** — terms in card text that reference other nodes should be clickable inline. No separate "Related" section at the bottom. If a separate section is unavoidable, it must be collapsible (hidden by default, click to expand).
9. **Source attribution** — original document page references (PDF), not wahapedia or bsdata.
10. **Chapter Approved cards** — Parse 8 Chapter Approved 2025 PDFs into structured nodes. New card types for primary missions, secondary missions, deployment zones, twists, challengers, terrain layouts. Each card is a record in search/browse. Tournament companion rules are rule records. All with PDF page images.

### Broken Errata Refs

The errata parser (`rules-commentary.ts:101`) generates `clarifies` refs but uses `coreId(title)` where `title` is the *errata entry's* title (e.g., "REDEPLOYMENTS"). This rarely matches an actual core rule node ID. **Result: 389 errata nodes have zero working refs.** This must be fixed in the build pipeline before errata can be attached to records.

### Entity Linking Infrastructure (already exists)

- Server: `linkEntitiesInText()` in `worker.ts` — replaces entity names with `[Name](brain:nodeId)` links
- Client: `renderMarkdown()` in `BrainScreen.tsx` — renders `brain:nodeId` links as clickable buttons
- Entity index: `getEntityIndex()` builds a map of all datasheets, stratagems, enhancements, rules

**This means inline links are technically feasible.** The constraint: entity linking currently only runs on Ask answers, not on card content. Extending it to card content requires running `linkEntitiesInText` on node content before sending it to the client (or client-side with a local entity map).

---

## File Structure

### Server (apps/brain/server/src/)

| File | Action | Responsibility |
|---|---|---|
| `lib/model.ts` | MODIFY | Add Record, CrossRef, ErrataAnnotation types |
| `lib/records.ts` | CREATE | Record aggregation: classify nodes → containers, fetch children, attach errata |
| `lib/records.test.ts` | CREATE | Tests for aggregation, army rule grouping, errata attachment |
| `lib/errata-linker.ts` | CREATE | Match errata nodes to the rules they clarify (fuzzy title + content matching) |
| `lib/errata-linker.test.ts` | CREATE | Tests for errata-to-rule matching |
| `lib/browse.ts` | CREATE | Filter browse to top-level records only |
| `lib/browse.test.ts` | CREATE | Tests for browse filtering |
| `lib/pdf-positions.test.ts` | CREATE | Position verification harness |
| `worker.ts` | MODIFY | Wire records + pagination into search/browse/ask endpoints; entity-link card content |
| `lib/retrieve.ts` | MODIFY | Add `returnRecords` option, fetch parents + children |
| `lib/parsers/rules-commentary.ts` | MODIFY | Fix errata → core rule ref matching |
| `lib/parsers/chapter-approved.ts` | CREATE | Parse Chapter Approved 2025 card markdown into structured nodes |
| `lib/parsers/chapter-approved.test.ts` | CREATE | Tests for card parsing |
| `lib/parsers/tournament-companion.ts` | CREATE | Parse Tournament Companion markdown into rule nodes |
| `lib/parsers/tournament-companion.test.ts` | CREATE | Tests for tournament companion parsing |
| `build-graph.ts` | MODIFY | Add Chapter Approved + Tournament Companion to build pipeline |
| `generate-page-images.ts` | MODIFY | Add Chapter Approved PDFs to page image generation |

### Client (apps/brain/client/src/)

| File | Action | Responsibility |
|---|---|---|
| `components/Pagination.tsx` | CREATE | Reusable pagination (prev/next + page count) |
| `components/Pagination.test.tsx` | CREATE | Pagination component tests |
| `components/CollapsibleSection.tsx` | CREATE | Clickable expandable section for errata + detailed refs |
| `components/CollapsibleSection.test.tsx` | CREATE | Tests |
| `components/cards/types.ts` | MODIFY | Add errata, crossRefs, linkedContent to all card data types |
| `components/cards/RuleCard.tsx` | MODIFY | Army rule rendering, errata section, inline entity links |
| `components/cards/UnitCard.tsx` | MODIFY | Errata section, inline entity links in ability descriptions |
| `components/cards/StratagemCard.tsx` | MODIFY | Inline entity links, errata section |
| `components/cards/EnhancementCard.tsx` | MODIFY | Inline entity links, errata section |
| `components/cards/PdfPageView.tsx` | MODIFY | Errata section, related record links |
| `components/cards/MissionCard.tsx` | CREATE | Primary mission card renderer (VP conditions, actions, setup rules) |
| `components/cards/MissionCard.test.tsx` | CREATE | Tests |
| `components/cards/SecondaryMissionCard.tsx` | CREATE | Secondary mission card renderer (fixed/tactical, attacker/defender) |
| `components/cards/SecondaryMissionCard.test.tsx` | CREATE | Tests |
| `components/cards/TwistCard.tsx` | CREATE | Twist card renderer |
| `components/cards/TwistCard.test.tsx` | CREATE | Tests |
| `components/cards/ChallengerCard.tsx` | CREATE | Challenger card renderer (mission + stratagem pair) |
| `components/cards/ChallengerCard.test.tsx` | CREATE | Tests |
| `pages/BrainScreen.tsx` | MODIFY | Record-based search/browse results, pagination state, new card types |

---

## Task 1: Type Definitions (Record, CrossRef, ErrataAnnotation)

Define the types that all other tasks depend on.

**Files:**
- Modify: `apps/brain/server/src/lib/model.ts`
- Modify: `apps/brain/server/src/lib/model.test.ts`

- [ ] **Step 1: Write failing test for new types**

```typescript
import { RecordSchema, CrossRefSchema, ErrataAnnotationSchema } from './model'

describe('Record schema', () => {
  it('validates a unit record', () => {
    const record = {
      type: 'unit',
      primaryNode: { /* valid node */ },
      childNodes: [],
      crossRefs: [],
      errata: [],
      matchedChildIds: [],
    }
    expect(() => RecordSchema.parse(record)).not.toThrow()
  })

  it('validates an army-rule record', () => {
    const record = {
      type: 'army-rule',
      primaryNode: { /* faction-ability node with content, sources, sub-rules */ },
      childNodes: [],    // sub-rule nodes grouped under this army rule
      crossRefs: [],
      errata: [],
      matchedChildIds: [],
    }
    expect(() => RecordSchema.parse(record)).not.toThrow()
  })

  it('validates an errata annotation', () => {
    const errata = {
      nodeId: 'errata:core-commentary:p6:1',
      title: 'REDEPLOYMENTS',
      content: 'Rules that allow players to redeploy...',
      source: { type: 'faq', title: 'Core Rules Updates', page: 6 },
    }
    expect(() => ErrataAnnotationSchema.parse(errata)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/brain/server && npx vitest run src/lib/model.test.ts
```

- [ ] **Step 3: Add types to model.ts**

```typescript
export const RecordTypeSchema = z.enum([
  'unit', 'detachment', 'stratagem', 'enhancement',
  'rule', 'army-rule', 'errata', 'balance',
])
export type RecordType = z.infer<typeof RecordTypeSchema>

export const ErrataAnnotationSchema = z.object({
  nodeId: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  source: z.object({
    type: z.string(),
    title: z.string(),
    page: z.number().optional(),
  }),
})
export type ErrataAnnotation = z.infer<typeof ErrataAnnotationSchema>

export const CrossRefSchema = z.object({
  targetRecordId: z.string().min(1),
  targetTitle: z.string().min(1),
  targetType: RecordTypeSchema,
  rel: z.string().min(1),
  context: z.string(),
  refCount: z.number().int().min(1),
})
export type CrossRef = z.infer<typeof CrossRefSchema>

export const RecordSchema = z.object({
  type: RecordTypeSchema,
  primaryNode: NodeSchema,
  childNodes: z.array(NodeSchema),
  crossRefs: z.array(CrossRefSchema),
  errata: z.array(ErrataAnnotationSchema),
  matchedChildIds: z.array(z.string()),
})
export type Record = z.infer<typeof RecordSchema>
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 2: Fix Errata → Rule Ref Matching

The errata parser generates `clarifies` refs but they don't match actual core rule IDs. Fix the matching so errata can be attached to rules at query time.

**Files:**
- Create: `apps/brain/server/src/lib/errata-linker.ts`
- Create: `apps/brain/server/src/lib/errata-linker.test.ts`
- Modify: `apps/brain/server/src/lib/parsers/rules-commentary.ts` (optional — fix build-time refs too)

- [ ] **Step 1: Write failing tests for errata matching**

```typescript
// errata-linker.test.ts
import { describe, it, expect } from 'vitest'
import { matchErrataToTargets, findErrataForNode } from './errata-linker'
import type { Node } from './model'

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'test', layer: 'core', category: 'core-mechanic',
  title: 'Test', content: 'test', summary: 'test',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-19' }],
  refs: [], version: 1, keywords: [],
  ...overrides,
})

describe('matchErrataToTargets', () => {
  it('matches errata titled "REDEPLOYMENTS" to core rule about redeployment', () => {
    const errataNode = makeNode({
      id: 'errata:core-commentary:p6:1',
      category: 'commentary',
      title: 'REDEPLOYMENTS',
      content: 'Rules that allow players to redeploy certain units after both armies are deployed...',
    })
    const coreNodes = [
      makeNode({ id: 'core:deployment', category: 'phase-sequence', title: 'Deployment', content: '...redeploy...' }),
      makeNode({ id: 'core:wound-roll', category: 'core-mechanic', title: 'Wound Roll' }),
    ]

    const matches = matchErrataToTargets(errataNode, coreNodes)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]!.targetId).toBe('core:deployment')
  })

  it('matches errata about "TRANSPORTS" to the transports rule', () => {
    const errataNode = makeNode({
      id: 'errata:transport',
      category: 'faq',
      title: 'TRANSPORTS',
      content: 'If a Transport model is destroyed...',
    })
    const coreNodes = [
      makeNode({ id: 'core:transports', category: 'core-mechanic', title: 'Transports' }),
    ]

    const matches = matchErrataToTargets(errataNode, coreNodes)
    expect(matches.length).toBe(1)
    expect(matches[0]!.targetId).toBe('core:transports')
  })
})

describe('findErrataForNode', () => {
  it('returns errata that clarify a given rule node', () => {
    const ruleNode = makeNode({
      id: 'core:transports',
      category: 'core-mechanic',
      title: 'Transports',
    })
    const errataNodes = [
      makeNode({
        id: 'errata:1',
        category: 'faq',
        title: 'TRANSPORTS',
        content: 'If a Transport model is destroyed...',
      }),
      makeNode({
        id: 'errata:2',
        category: 'commentary',
        title: 'WOUND ALLOCATION',
        content: 'When allocating wounds...',
      }),
    ]

    const errata = findErrataForNode(ruleNode, errataNodes)
    expect(errata).toHaveLength(1)
    expect(errata[0]!.nodeId).toBe('errata:1')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement errata-linker.ts**

The matching strategy:
1. **Title normalization match** — normalize both titles (lowercase, strip punctuation, collapse whitespace) and check for exact match or substring containment
2. **Keyword overlap** — compare errata keywords against rule keywords
3. **Content reference** — check if errata content mentions the rule title
4. **Page proximity** — if errata references a specific page and the rule is on that page in the same PDF

```typescript
// errata-linker.ts
import type { Node, ErrataAnnotation } from './model'

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

interface ErrataMatch {
  targetId: string
  score: number  // 0-1 confidence
}

/** Match a single errata node against a list of potential target nodes. */
export function matchErrataToTargets(errataNode: Node, targetNodes: Node[]): ErrataMatch[] {
  const errTitle = normalize(errataNode.title)
  const errContent = normalize(errataNode.content)

  const matches: ErrataMatch[] = []

  for (const target of targetNodes) {
    const tgtTitle = normalize(target.title)
    let score = 0

    // Exact title match (after normalization)
    if (errTitle === tgtTitle) {
      score = 1.0
    }
    // Errata title is a substring of target title or vice versa
    else if (errTitle.length >= 4 && (tgtTitle.includes(errTitle) || errTitle.includes(tgtTitle))) {
      score = 0.8
    }
    // Errata content mentions the target title
    else if (tgtTitle.length >= 4 && errContent.includes(tgtTitle)) {
      score = 0.5
    }
    // Keyword overlap
    else {
      const overlap = errataNode.keywords.filter(k => target.keywords.includes(k))
      if (overlap.length >= 2) score = 0.3
    }

    if (score > 0) {
      matches.push({ targetId: target.id, score })
    }
  }

  return matches.sort((a, b) => b.score - a.score)
}

/** Find all errata nodes that apply to a given rule/unit node. */
export function findErrataForNode(
  node: Node,
  allErrataNodes: Node[],
): ErrataAnnotation[] {
  const nodeTitle = normalize(node.title)
  const results: ErrataAnnotation[] = []

  for (const errata of allErrataNodes) {
    const errTitle = normalize(errata.title)
    const errContent = normalize(errata.content)

    let matches = false

    // Title match
    if (errTitle === nodeTitle || errTitle.includes(nodeTitle) || nodeTitle.includes(errTitle)) {
      matches = true
    }
    // Content mentions node title
    else if (nodeTitle.length >= 4 && errContent.includes(nodeTitle)) {
      matches = true
    }
    // Check refs (if they exist and point to this node)
    else if (errata.refs.some(r => r.targetId === node.id && r.rel === 'clarifies')) {
      matches = true
    }

    if (matches) {
      results.push({
        nodeId: errata.id,
        title: errata.title,
        content: errata.content,
        source: {
          type: errata.sources[0]?.type ?? 'faq',
          title: errata.sources[0]?.title ?? 'Unknown',
          page: errata.sources[0]?.page,
        },
      })
    }
  }

  return results
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 3: Record Aggregation Logic

The core server-side engine: classify nodes into containers, group children under parents, attach errata.

**Files:**
- Create: `apps/brain/server/src/lib/records.ts`
- Create: `apps/brain/server/src/lib/records.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// records.test.ts
describe('classifyNode', () => {
  it('classifies a weapon → unit record under its datasheetId', () => { ... })
  it('classifies a unit-ability → unit record under its datasheetId', () => { ... })
  it('classifies a datasheet → unit record (self-contained)', () => { ... })
  it('classifies a faction-ability WITHOUT detachmentId → army-rule record', () => { ... })
  it('classifies a faction-ability WITH detachmentId → detachment child (not a record)', () => { ... })
  it('classifies a detachment-rule → detachment record', () => { ... })
  it('classifies a stratagem → stratagem record (standalone)', () => { ... })
  it('classifies a core-mechanic → rule record', () => { ... })
  it('classifies faq → errata record', () => { ... })
})

describe('aggregateToRecords', () => {
  it('groups weapons + abilities under parent datasheet', () => { ... })
  it('produces army-rule records for faction-abilities without detachmentId', () => { ... })
  it('groups army rule sub-rules under the parent army rule', () => {
    // e.g., "Acts of Faith" parent + "GAINING MIRACLE DICE (Acts of Faith)" child
    const parent = makeNode({
      id: 'faction:adepta-sororitas:acts-of-faith',
      category: 'faction-ability',
      title: 'Acts of Faith',
      factionId: 'adepta-sororitas',
    })
    const subRule = makeNode({
      id: 'faction:adepta-sororitas:acts-of-faith:gaining-miracle-dice',
      category: 'faction-ability',
      title: 'GAINING MIRACLE DICE (Acts of Faith)',
      factionId: 'adepta-sororitas',
    })
    const records = aggregateToRecords([parent, subRule], new Map())
    // Should produce ONE army-rule record with the sub-rule as a child
    expect(records).toHaveLength(1)
    expect(records[0]!.type).toBe('army-rule')
    expect(records[0]!.childNodes).toHaveLength(1)
  })

  it('deduplicates — two weapons from same datasheet → one unit record', () => { ... })
  it('preserves result order by first-seen container', () => { ... })
  it('fetches missing parent from allNodes map', () => { ... })
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement records.ts**

Key design decisions:
- `classifyNode` returns `{ recordType, containerId }` — determines which record a node belongs to
- Army rules: faction-ability without detachmentId → `army-rule` record. Sub-rules (ID is prefix of parent ID + parenthetical title) group under parent.
- `fetchAllChildren(bucket, containerIds)` — scans R2 for ALL children of given containers (so unit records get complete weapon lists, not just matched ones)
- `aggregateToRecords` groups by container, resolves missing parents, returns ordered records

```typescript
export function classifyNode(node: Node): Classification {
  // Child nodes of a datasheet
  if (node.datasheetId && ['weapon', 'unit-ability', 'wargear-option',
      'leader-attachment', 'unit-composition'].includes(node.category)) {
    return { recordType: 'unit', containerId: node.datasheetId }
  }
  if (node.category === 'datasheet') {
    return { recordType: 'unit', containerId: node.id }
  }

  // Army rules — faction-ability without detachmentId
  // Sub-rules: ID starts with parent ID (e.g., faction:sororitas:acts-of-faith:gaining...)
  if (node.category === 'faction-ability' && !node.detachmentId) {
    // Check if this is a sub-rule of another army rule
    // Convention: sub-rule ID is parent-id + ':' + slug
    // Also: title contains " (ParentTitle)" suffix
    const parentMatch = node.title.match(/\(([^)]+)\)\s*$/)
    if (parentMatch) {
      // This is a sub-rule — find parent by stripping the last segment from ID
      const segments = node.id.split(':')
      if (segments.length >= 4) {
        const parentId = segments.slice(0, -1).join(':')
        return { recordType: 'army-rule', containerId: parentId }
      }
    }
    return { recordType: 'army-rule', containerId: node.id }
  }

  // Detachment abilities (faction-ability WITH detachmentId) — child of detachment
  // But for search results, we show them as standalone since detachment pages are separate
  if (node.category === 'faction-ability' && node.detachmentId) {
    return { recordType: 'rule', containerId: node.id }
  }

  if (node.category === 'detachment-rule') {
    return { recordType: 'detachment', containerId: node.id }
  }
  if (node.category === 'stratagem') {
    return { recordType: 'stratagem', containerId: node.id }
  }
  if (node.category === 'enhancement') {
    return { recordType: 'enhancement', containerId: node.id }
  }
  if (node.category === 'faq' || node.category === 'commentary') {
    return { recordType: 'errata', containerId: node.id }
  }
  if (node.category === 'balance-change') {
    return { recordType: 'balance', containerId: node.id }
  }
  // core-mechanic, phase-sequence, terrain, army-construction, mission, keyword
  return { recordType: 'rule', containerId: node.id }
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 4: Entity Linking for Card Content

Extend the existing entity linking to run on record content before it reaches the client, so card text has inline clickable links.

**Files:**
- Modify: `apps/brain/server/src/worker.ts` (refactor `linkEntitiesInText` to a shared module)
- Create: `apps/brain/server/src/lib/entity-linker.ts`
- Create: `apps/brain/server/src/lib/entity-linker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// entity-linker.test.ts
import { describe, it, expect } from 'vitest'
import { linkEntitiesInContent } from './entity-linker'

describe('linkEntitiesInContent', () => {
  it('links known entity names in rule text', () => {
    const text = 'This model has the Sustained Hits ability and Lethal Hits.'
    const entityMap = new Map([
      ['sustained hits', { nodeId: 'core:sustained-hits', title: 'Sustained Hits' }],
      ['lethal hits', { nodeId: 'core:lethal-hits', title: 'Lethal Hits' }],
    ])
    const result = linkEntitiesInContent(text, entityMap)
    expect(result).toContain('[Sustained Hits](brain:core:sustained-hits)')
    expect(result).toContain('[Lethal Hits](brain:core:lethal-hits)')
  })

  it('only links first occurrence of each entity', () => {
    const text = 'Sustained Hits applies to attacks with Sustained Hits.'
    const entityMap = new Map([
      ['sustained hits', { nodeId: 'core:sustained-hits', title: 'Sustained Hits' }],
    ])
    const result = linkEntitiesInContent(text, entityMap)
    // First occurrence linked, second not
    const matches = result.match(/\[Sustained Hits\]/g)
    expect(matches).toHaveLength(1)
  })

  it('does not link inside existing brain: links', () => {
    const text = 'Already linked: [Sustained Hits](brain:core:sustained-hits). Not linked again.'
    const entityMap = new Map([
      ['sustained hits', { nodeId: 'core:sustained-hits', title: 'Sustained Hits' }],
    ])
    const result = linkEntitiesInContent(text, entityMap)
    // Should not double-link
    const matches = result.match(/brain:core:sustained-hits/g)
    expect(matches).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Extract `linkEntitiesInText` from worker.ts into `lib/entity-linker.ts`**

Move the existing function and `getEntityIndex` into the new module. Add a `linkRecordContent` function that applies entity linking to all text fields in a record (primaryNode.content, childNode descriptions, etc.).

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 5: Wire Records into Search Endpoint

Integrate record aggregation, errata, and entity linking into `/search`.

**Files:**
- Modify: `apps/brain/server/src/lib/retrieve.ts`
- Modify: `apps/brain/server/src/worker.ts`

- [ ] **Step 1: Add `returnRecords` to RetrieveOptions**

- [ ] **Step 2: After node enrichment, aggregate into records**

```typescript
if (options.returnRecords) {
  const allNodesMap = new Map<string, Node>(nodes.map(n => [n.id, n]))

  // Fetch missing parent nodes (datasheets for matched weapons)
  const missingParentIds = new Set<string>()
  for (const node of nodes) {
    if (node.datasheetId && !allNodesMap.has(node.datasheetId))
      missingParentIds.add(node.datasheetId)
  }
  if (missingParentIds.size > 0) {
    const parents = await fetchNodesFromR2(env.bucket, [...missingParentIds])
    for (const p of parents) allNodesMap.set(p.id, p)
  }

  // Aggregate
  let records = aggregateToRecords(nodes, allNodesMap)

  // Fetch ALL children for unit records (complete weapon/ability lists)
  const datasheetIds = records.filter(r => r.type === 'unit').map(r => r.primaryNode.id)
  if (datasheetIds.length > 0) {
    const allChildren = await fetchAllChildren(env.bucket, datasheetIds)
    // Merge into records...
  }

  // Fetch ALL children for army-rule records (sub-rules)
  const armyRuleIds = records.filter(r => r.type === 'army-rule').map(r => r.primaryNode.id)
  if (armyRuleIds.length > 0) {
    const subRules = await fetchArmyRuleChildren(env.bucket, armyRuleIds)
    // Merge into records...
  }

  // Attach errata to each record
  const errataNodes = await fetchErrataNodes(env.bucket)
  for (const record of records) {
    record.errata = findErrataForNode(record.primaryNode, errataNodes)
  }

  // Entity-link all content
  const entityIndex = await getEntityIndex(env.bucket)
  for (const record of records) {
    record.primaryNode = {
      ...record.primaryNode,
      content: linkEntitiesInContent(record.primaryNode.content, entityIndex),
    }
  }

  // Build cross-refs from indexes
  const [fwdObj, revObj] = await Promise.all([
    env.bucket.get('refs/forward-index.json'),
    env.bucket.get('refs/reverse-index.json'),
  ])
  const fwd = fwdObj ? await fwdObj.json() : {}
  const rev = revObj ? await revObj.json() : {}
  records = buildCrossRefs(records, fwd, rev)
}
```

- [ ] **Step 3: Add pagination to search endpoint**

Request: `{ query, page?, pageSize?, filter? }`
Response: `{ detected, records, total, page, pageSize, totalPages }`

**Important:** Vectorize caps at 50 results per query, but the existing code runs multiple parallel queries (stripped, original, keyword, datasheet-only) and merges. After aggregation, 50+ raw nodes typically collapse to 10-20 records. For pagination, increase the Vectorize fetch pool and paginate the aggregated records.

- [ ] **Step 4: Write test for record search**

```typescript
// In retrieve.test.ts
it('weapon search returns unit record with parent datasheet', async () => { ... })
it('army rule search returns army-rule record with sub-rules', async () => { ... })
it('rule search includes errata annotations', async () => { ... })
it('record content has inline entity links', async () => { ... })
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

---

## Task 6: Record-Based Browse Endpoint

Browse lists only top-level records, not individual nodes.

**Files:**
- Create: `apps/brain/server/src/lib/browse.ts`
- Create: `apps/brain/server/src/lib/browse.test.ts`
- Modify: `apps/brain/server/src/worker.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('filterBrowseNodes', () => {
  it('excludes weapon, unit-ability, wargear-option, leader-attachment, unit-composition', () => { ... })
  it('excludes army-rule sub-rules (title contains parenthetical parent name)', () => { ... })
  it('keeps datasheets, stratagems, enhancements, detachment-rules, faction-abilities, core rules', () => { ... })
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement browse.ts**

```typescript
const CHILD_CATEGORIES = new Set([
  'weapon', 'unit-ability', 'wargear-option', 'leader-attachment', 'unit-composition',
])

export function filterBrowseNodes(nodes: Node[]): Node[] {
  return nodes.filter(n => {
    if (CHILD_CATEGORIES.has(n.category)) return false
    // Exclude army-rule sub-rules (title has "(ParentName)" suffix)
    if (n.category === 'faction-ability' && !n.detachmentId && n.title.match(/\([^)]+\)\s*$/)) return false
    return true
  })
}
```

- [ ] **Step 4: Update browse endpoint with pagination**

```typescript
// GET /browse/nodes?layer=X&page=1&pageSize=20
const page = parseInt(c.req.query('page') || '1')
const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100)
const filtered = filterBrowseNodes(allNodes)
const total = filtered.length
const totalPages = Math.ceil(total / pageSize)
const paged = filtered.slice((page - 1) * pageSize, page * pageSize)
return c.json({ nodes: paged, total, page, pageSize, totalPages })
```

- [ ] **Step 5: Run test — expect PASS**

- [ ] **Step 6: Commit**

---

## Task 7: PDF Overlay Position Verification

Test harness that validates every PDF position is within bounds and catches broken overlays.

**Files:**
- Create: `apps/brain/server/src/lib/pdf-positions.test.ts`

- [ ] **Step 1: Write position verification tests**

Tests check:
- All topPct, heightPct, leftPct, widthPct are in [0, 100]
- top + height does not exceed ~105% (5% tolerance for padding)
- left + width does not exceed ~105%
- Page numbers are valid (1 to max page in sidecar)
- No two sections on the same page have >50% overlap (warns, doesn't fail)

- [ ] **Step 2: Run tests and fix any position bugs found**

```bash
cd apps/brain/server && npx vitest run src/lib/pdf-positions.test.ts
```

- [ ] **Step 3: If positions are broken, investigate and fix findRegion in pdf-positions.ts**

Common issues: Y-axis origin (PDF bottom-left vs sidecar top-left), column margins, heading level matching.

- [ ] **Step 4: Commit**

---

## Task 8: Client Pagination Component

**Files:**
- Create: `apps/brain/client/src/components/Pagination.tsx`
- Create: `apps/brain/client/src/components/Pagination.test.tsx`

- [ ] **Step 1: Write failing tests**

Test: renders page info, disables prev on page 1, disables next on last page, calls onPageChange, hides when totalPages <= 1.

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement Pagination**

```tsx
export function Pagination({ page, totalPages, total, pageSize, onPageChange }: Props) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-xs text-slate-500">{total} results — page {page} of {totalPages}</span>
      <div className="flex gap-1">
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} ...>Prev</button>
        <button aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} ...>Next</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 9: Client CollapsibleSection Component

For errata lists and detailed cross-refs — hidden by default, click to expand.

**Files:**
- Create: `apps/brain/client/src/components/CollapsibleSection.tsx`
- Create: `apps/brain/client/src/components/CollapsibleSection.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
it('renders collapsed by default — content not visible', () => { ... })
it('expands on click — content becomes visible', () => { ... })
it('shows count badge in header', () => { ... })
it('renders nothing when children are empty', () => { ... })
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement CollapsibleSection**

```tsx
export function CollapsibleSection({ title, count, children }: Props) {
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <div className="border-t border-slate-800 mt-2">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-2 ...">
        <span className="text-xs text-slate-500 uppercase">{title}</span>
        <span className="text-xs bg-slate-700 rounded-full px-1.5">{count}</span>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 10: Update Card Types and Components

Add errata sections, inline entity links, and source attribution to all card components.

**Files:**
- Modify: `apps/brain/client/src/components/cards/types.ts`
- Modify: `apps/brain/client/src/components/cards/RuleCard.tsx`
- Modify: `apps/brain/client/src/components/cards/UnitCard.tsx`
- Modify: `apps/brain/client/src/components/cards/StratagemCard.tsx`
- Modify: `apps/brain/client/src/components/cards/EnhancementCard.tsx`
- Modify: `apps/brain/client/src/components/cards/PdfPageView.tsx`

- [ ] **Step 1: Add errata and crossRefs to card data types**

```typescript
// In types.ts — add to ALL card data interfaces:
export interface ErrataEntry {
  nodeId: string
  title: string
  content: string
  source: { type: string; title: string; page?: number }
}

// Add to RuleCardData, UnitCardData, StratagemCardData, EnhancementCardData:
errata?: ErrataEntry[]
crossRefs?: CrossRefEntry[]

// Add to CardContext:
onNodeNavigate?: (nodeId: string) => void  // for inline brain:nodeId link clicks
```

- [ ] **Step 2: Update RuleCard for army rules**

Army Rule Card rendering requirements:
- Header: faction name (prominent), rule name in Oswald uppercase
- Badge: "Army Rule" label (amber)
- Body: full rule text with inline entity links (brain:nodeId rendered as clickable amber text)
- Sub-rules: each sub-rule in its own bordered section (this already works via `subRules` prop)
- Source: "View source (p.X)" button linking to original PDF page — **only show PDF sources, not wahapedia/bsdata**
- Errata: `<CollapsibleSection title="Errata & FAQ" count={errata.length}>` — each entry shows title, content, source page

```typescript
// Filter sources to PDF only for display
const pdfSources = data.sources?.filter(s => s.type === 'pdf') || []
```

- [ ] **Step 3: Update UnitCard with errata section**

Add `<CollapsibleSection>` at the bottom for errata. Unit cards already render weapons and abilities in tables.

- [ ] **Step 4: Update StratagemCard and EnhancementCard with errata + inline links**

Stratagem WHEN/TARGET/EFFECT text should have inline entity links. Add errata collapsible section.

- [ ] **Step 5: Update PdfPageView with errata section**

Below the PDF image, add a collapsible errata section if any errata reference the displayed rule.

- [ ] **Step 6: Handle brain:nodeId clicks in all cards**

The existing `renderMarkdown` in BrainScreen.tsx already handles `data-brain-node` click events. Ensure card content rendered with entity links uses the same click handler via `CardContext.onNodeNavigate`.

- [ ] **Step 7: Commit**

---

## Task 11: Integrate Records + Pagination into Search and Browse Tabs

Wire the new record-based API responses into the client UI.

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`

- [ ] **Step 1: Update SearchTab**

- Replace `SearchResponse` type with record-based response
- Add `page` state, reset to 1 on new query
- Pass `page` and `pageSize` in fetch body
- Render records: for each record, build the appropriate card data from `record.primaryNode` + `record.childNodes` + `record.errata`
- Show `<Pagination>` below results
- Show `matchedChildIds` as highlights (e.g., "Matched: Lascannon, Multi-melta" on a unit record)

- [ ] **Step 2: Update BrowseTab**

- Add `page` state, reset to 1 on layer change
- Fetch with `page` and `pageSize` params
- Node list now shows only top-level records (server filters out children)
- Show `<Pagination>` below list

- [ ] **Step 3: Update handleOpenCard to work with records**

When opening a record from search results:
- Unit records: already have full weapon/ability data from `record.childNodes` — no need for separate `/browse/unit/:id` fetch
- Army rule records: primary node + sub-rule child nodes
- All records: errata pre-attached, entity links pre-applied

- [ ] **Step 4: Commit**

---

## Task 12: Chapter Approved Card Parser

Parse the 8 Chapter Approved 2025 markdown files into structured nodes. The parsed markdown already exists at `C:\R\sync-data\.local\chapter-approved\markdown\` — the parser reads it and produces nodes.

**Files:**
- Create: `apps/brain/server/src/lib/parsers/chapter-approved.ts`
- Create: `apps/brain/server/src/lib/parsers/chapter-approved.test.ts`
- Modify: `apps/brain/server/src/lib/model.ts` (add new node categories)

- [ ] **Step 1: Add new node categories to model.ts**

Add to `NodeCategorySchema`:
```typescript
// Chapter Approved / Mission cards
'primary-mission', 'secondary-mission', 'deployment-zone',
'twist', 'challenger', 'terrain-layout',
```

Add to `RecordTypeSchema`:
```typescript
'primary-mission', 'secondary-mission', 'deployment-zone',
'twist', 'challenger', 'terrain-layout',
```

- [ ] **Step 2: Write failing tests for card parsing**

```typescript
// chapter-approved.test.ts
describe('parsePrimaryMissions', () => {
  it('splits flat text into individual mission cards', () => {
    const md = fs.readFileSync('C:/R/sync-data/.local/chapter-approved/markdown/primary-missions.md', 'utf8')
    const nodes = parsePrimaryMissions(md, '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(10)
    // Each node should have a title, content, and VP conditions
    for (const node of nodes) {
      expect(node.title).toBeTruthy()
      expect(node.content).toBeTruthy()
      expect(node.category).toBe('primary-mission')
      expect(node.layer).toBe('core')
    }
  })

  it('parses Take and Hold correctly', () => {
    const md = fs.readFileSync('C:/R/sync-data/.local/chapter-approved/markdown/primary-missions.md', 'utf8')
    const nodes = parsePrimaryMissions(md, '2026-04-20')
    const takeAndHold = nodes.find(n => n.title === 'TAKE AND HOLD')
    expect(takeAndHold).toBeDefined()
    expect(takeAndHold!.content).toContain('5 VP')
    expect(takeAndHold!.content).toContain('MAX 15VP')
  })
})

describe('parseSecondaryMissions', () => {
  it('splits attacker secondary missions into individual cards', () => {
    const md = fs.readFileSync('C:/R/sync-data/.local/chapter-approved/markdown/secondary-missions-attacker.md', 'utf8')
    const nodes = parseSecondaryMissions(md, 'attacker', '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(15)
    for (const node of nodes) {
      expect(node.category).toBe('secondary-mission')
    }
  })

  it('identifies fixed vs tactical missions', () => {
    const md = fs.readFileSync('C:/R/sync-data/.local/chapter-approved/markdown/secondary-missions-attacker.md', 'utf8')
    const nodes = parseSecondaryMissions(md, 'attacker', '2026-04-20')
    const assassination = nodes.find(n => n.title === 'ASSASSINATION')
    expect(assassination).toBeDefined()
    expect(assassination!.keywords).toContain('fixed')
  })
})

describe('parseTwistCards', () => {
  it('parses all twist cards', () => {
    const md = fs.readFileSync('C:/R/sync-data/.local/chapter-approved/markdown/twist-cards.md', 'utf8')
    const nodes = parseTwistCards(md, '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(8)
    const nightFighting = nodes.find(n => n.title === 'NIGHT FIGHTING')
    expect(nightFighting).toBeDefined()
    expect(nightFighting!.content).toContain('18"')
  })
})

describe('parseChallengerCards', () => {
  it('parses challenger cards as mission-stratagem pairs', () => {
    const md = fs.readFileSync('C:/R/sync-data/.local/chapter-approved/markdown/challenger-cards.md', 'utf8')
    const nodes = parseChallengerCards(md, '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(8)
    const attrition = nodes.find(n => n.title.includes('ATTRITION'))
    expect(attrition).toBeDefined()
    // Should include both the mission VP and the paired stratagem
    expect(attrition!.content).toContain('PIVOTAL MOMENT')
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

- [ ] **Step 4: Implement chapter-approved.ts**

The parser needs to split flat text back into individual cards. Key heuristics:
- Primary missions: card boundaries at capitalized names followed by "PRIMARY MISSION"
- Secondary missions: boundaries at names followed by "SECONDARY MISSION" or "FIXED - SECONDARY MISSION"
- Twist cards: boundaries at all-caps names followed by "TWIST"
- Challenger cards: boundaries at all-caps names followed by "CHALLENGER MISSION"
- Each card gets a structured node with: title, full content, VP conditions, action descriptions, keywords

```typescript
export function parsePrimaryMissions(markdown: string, retrievedAt: string): Node[] { ... }
export function parseSecondaryMissions(markdown: string, side: 'attacker' | 'defender', retrievedAt: string): Node[] { ... }
export function parseTwistCards(markdown: string, retrievedAt: string): Node[] { ... }
export function parseChallengerCards(markdown: string, retrievedAt: string): Node[] { ... }
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

---

## Task 13: Tournament Companion Parser

Parse the Pariah Nexus and Chapter Approved Tournament Companion markdown into rule nodes covering the tournament mission sequence, reserves restrictions, secret missions, actions, and VP structure.

**Files:**
- Create: `apps/brain/server/src/lib/parsers/tournament-companion.ts`
- Create: `apps/brain/server/src/lib/parsers/tournament-companion.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('parseTournamentCompanion', () => {
  it('parses Pariah Nexus tournament companion into rule nodes', () => {
    const md = fs.readFileSync(
      'C:/R/sync-data/tools/gw-sync/.local/gw/markdown/pariah-nexus-tournament-companion.md', 'utf8')
    const { nodes, refs } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')
    expect(nodes.length).toBeGreaterThanOrEqual(10)

    const muster = nodes.find(n => n.title.includes('MUSTER'))
    expect(muster).toBeDefined()

    const secretMissions = nodes.find(n => n.title.includes('SECRET MISSIONS'))
    expect(secretMissions).toBeDefined()
    expect(secretMissions!.content).toContain('third battle round')

    const actions = nodes.find(n => n.title.includes('ACTIONS'))
    expect(actions).toBeDefined()
  })

  it('parses errata cards from tournament companion', () => {
    const md = fs.readFileSync(
      'C:/R/sync-data/tools/gw-sync/.local/gw/markdown/pariah-nexus-tournament-companion.md', 'utf8')
    const { nodes } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')

    // Updated secondary mission cards in the companion are errata for the card deck
    const recoverAssets = nodes.find(n => n.title.includes('RECOVER ASSETS'))
    expect(recoverAssets).toBeDefined()
  })

  it('generates refs from companion errata to mission cards', () => {
    const md = fs.readFileSync(
      'C:/R/sync-data/tools/gw-sync/.local/gw/markdown/pariah-nexus-tournament-companion.md', 'utf8')
    const { refs } = parseTournamentCompanion(md, 'pariah-nexus', '2026-04-20')

    // Should have clarifies/supersedes refs from companion errata to mission cards
    const clarifyRefs = refs.filter(r => r.rel === 'clarifies' || r.rel === 'supersedes')
    expect(clarifyRefs.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement tournament-companion.ts**

Split the markdown at `#####` headings. Each heading becomes a rule node. The tournament mission pool section with pre-set rounds becomes a set of mission-combo nodes. Errata section cards become errata nodes with `supersedes` refs to the original card nodes.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

---

## Task 14: Page Image Generation for Chapter Approved PDFs

Generate PNG page images from the 8 Chapter Approved PDFs and add them to the brain's R2 storage.

**Files:**
- Modify: `apps/brain/server/src/generate-page-images.ts`

- [ ] **Step 1: Add Chapter Approved PDFs to the page image generator**

The source PDFs are at `C:\R\sync-data\tools\ChapterApproved\`:
- `2025_Primary Missions.pdf`
- `2025_SecondaryMissions_Attacker.pdf`
- `2025_SecondaryMissions_Defender.pdf`
- `2025_DeploymentZones.pdf`
- `2025_TwistCards.pdf`
- `2025_ChallengerCards.pdf`
- `2025_TerrainLayouts.pdf`

Output to `.local/brain/pages/chapter-approved-primary-missions/`, etc.

- [ ] **Step 2: Run the generator**

```bash
cd apps/brain/server && npx tsx src/generate-page-images.ts
```

- [ ] **Step 3: Verify page images exist**

- [ ] **Step 4: Commit**

---

## Task 15: Integrate Chapter Approved into Build Pipeline

Wire the new parsers into `build-graph.ts` so Chapter Approved card nodes are included in the knowledge graph.

**Files:**
- Modify: `apps/brain/server/src/build-graph.ts`

- [ ] **Step 1: Add Chapter Approved parsing step to build-graph.ts**

After existing faction pack parsing, add:
```typescript
// 7. Chapter Approved 2025 cards
const chapterApprovedDir = 'C:/R/sync-data/.local/chapter-approved/markdown'
const primaryNodes = parsePrimaryMissions(readFileSync(join(chapterApprovedDir, 'primary-missions.md'), 'utf8'), retrievedAt)
const secAttacker = parseSecondaryMissions(readFileSync(join(chapterApprovedDir, 'secondary-missions-attacker.md'), 'utf8'), 'attacker', retrievedAt)
const secDefender = parseSecondaryMissions(readFileSync(join(chapterApprovedDir, 'secondary-missions-defender.md'), 'utf8'), 'defender', retrievedAt)
const twists = parseTwistCards(readFileSync(join(chapterApprovedDir, 'twist-cards.md'), 'utf8'), retrievedAt)
const challengers = parseChallengerCards(readFileSync(join(chapterApprovedDir, 'challenger-cards.md'), 'utf8'), retrievedAt)
allNodes.push(...primaryNodes, ...secAttacker, ...secDefender, ...twists, ...challengers)

// 8. Tournament Companion rules
const pnTc = parseTournamentCompanion(
  readFileSync('C:/R/sync-data/tools/gw-sync/.local/gw/markdown/pariah-nexus-tournament-companion.md', 'utf8'),
  'pariah-nexus', retrievedAt)
const caTc = parseTournamentCompanion(
  readFileSync('C:/R/sync-data/tools/gw-sync/.local/gw/markdown/chapter-approved-tournament-companion.md', 'utf8'),
  'chapter-approved', retrievedAt)
allNodes.push(...pnTc.nodes, ...caTc.nodes)
allRefs.push(...pnTc.refs, ...caTc.refs)
```

- [ ] **Step 2: Add deployment zones and terrain layouts as image-only nodes**

These are primarily visual (diagrams). Create nodes with the card name and a source pointing to the PDF page image, but minimal text content.

- [ ] **Step 3: Run build-graph.ts and verify node counts**

```bash
cd apps/brain/server && npx tsx src/build-graph.ts
# Should see ~100+ new nodes (14 primary + 40 secondary + 9 twist + 10 challenger + 20+ tournament companion rules + 19 deployment/terrain)
```

- [ ] **Step 4: Commit**

---

## Task 16: Mission Card Client Components

New React components for rendering Chapter Approved cards.

**Files:**
- Create: `apps/brain/client/src/components/cards/MissionCard.tsx` + test
- Create: `apps/brain/client/src/components/cards/SecondaryMissionCard.tsx` + test
- Create: `apps/brain/client/src/components/cards/TwistCard.tsx` + test
- Create: `apps/brain/client/src/components/cards/ChallengerCard.tsx` + test
- Modify: `apps/brain/client/src/components/cards/types.ts`
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`

- [ ] **Step 1: Add card data types**

```typescript
// types.ts
export interface MissionCardData {
  id: string
  name: string
  type: 'primary' | 'secondary'
  side?: 'attacker' | 'defender'
  missionType?: 'fixed' | 'tactical'
  vpConditions: string       // Full VP scoring text
  action?: string            // Action text if mission has one
  setupRules?: string        // Special setup modifications
  maxVp?: string             // e.g., "MAX 15VP"
  sources?: SourceRef[]
  errata?: ErrataEntry[]
}

export interface TwistCardData {
  id: string
  name: string
  description: string
  sources?: SourceRef[]
}

export interface ChallengerCardData {
  id: string
  name: string
  missionText: string        // VP condition
  stratagemName: string
  stratagemCp: string
  stratagemWhen: string
  stratagemTarget: string
  stratagemEffect: string
  sources?: SourceRef[]
}

// Update CardData union:
export type CardData =
  | { type: 'unit'; data: UnitCardData }
  | { type: 'stratagem'; data: StratagemCardData }
  | { type: 'enhancement'; data: EnhancementCardData }
  | { type: 'rule'; data: RuleCardData }
  | { type: 'mission'; data: MissionCardData }
  | { type: 'twist'; data: TwistCardData }
  | { type: 'challenger'; data: ChallengerCardData }
```

- [ ] **Step 2: Implement MissionCard component**

Rendering: card header with mission name + type badge (PRIMARY/SECONDARY, FIXED/TACTICAL), VP conditions in structured format, action section if present, errata collapsible section, source PDF link.

- [ ] **Step 3: Implement SecondaryMissionCard, TwistCard, ChallengerCard components**

- [ ] **Step 4: Wire new card types into BrainScreen.tsx handleOpenCard**

Add cases for the new node categories in `buildCardFromNode`:
```typescript
case 'primary-mission':
case 'secondary-mission':
  return { type: 'mission', data: buildMissionData(node) }
case 'twist':
  return { type: 'twist', data: buildTwistData(node) }
case 'challenger':
  return { type: 'challenger', data: buildChallengerData(node) }
case 'deployment-zone':
case 'terrain-layout':
  // Show as PDF page image (same as rules)
  // fall through to PDF view
```

- [ ] **Step 5: Update records.ts classifyNode for new categories**

```typescript
if (['primary-mission', 'secondary-mission', 'deployment-zone',
     'twist', 'challenger', 'terrain-layout'].includes(node.category)) {
  return { recordType: node.category as RecordType, containerId: node.id }
}
```

- [ ] **Step 6: Write tests for each component**

- [ ] **Step 7: Commit**

---

## Task 17: End-to-End Validation Tests

Validate the full pipeline against real data — all record types, pagination, errata, entity links, and Chapter Approved cards.

**Files:**
- Modify: `apps/brain/server/src/search-validation.test.ts`

- [ ] **Step 1: Add record-based search validation**

```typescript
describe('record-based search', () => {
  it('weapon name → unit record (not weapon node)', async () => {
    const data = await apiPost('/search', { query: 'lascannon', pageSize: 5 })
    for (const record of data.records) {
      expect(record.primaryNode.category).not.toBe('weapon')
      expect(record.primaryNode.category).not.toBe('unit-ability')
    }
    const units = data.records.filter(r => r.type === 'unit')
    expect(units.length).toBeGreaterThan(0)
  })

  it('army rule search → army-rule record with sub-rules and PDF source', async () => {
    const data = await apiPost('/search', { query: 'Oath of Moment' })
    const armyRules = data.records.filter(r => r.type === 'army-rule')
    expect(armyRules.length).toBeGreaterThan(0)
    const oath = armyRules[0]
    expect(oath.primaryNode.content.length).toBeGreaterThan(50) // full text, not partial
    // Must have PDF source (not wahapedia)
    const pdfSource = oath.primaryNode.sources.find(s => s.type === 'pdf')
    expect(pdfSource).toBeDefined()
    expect(pdfSource.page).toBeGreaterThan(0)
  })

  it('core rule search includes errata annotations', async () => {
    const data = await apiPost('/search', { query: 'transports' })
    const rules = data.records.filter(r => r.type === 'rule')
    const withErrata = rules.filter(r => r.errata.length > 0)
    console.log(`Rules with errata: ${withErrata.length}/${rules.length}`)
  })

  it('record content has inline entity links (brain:nodeId)', async () => {
    const data = await apiPost('/search', { query: 'Oath of Moment' })
    const record = data.records[0]
    expect(record.primaryNode.content).toMatch(/\[.*?\]\(brain:.*?\)/)
  })

  it('pagination returns different results per page', async () => {
    const p1 = await apiPost('/search', { query: 'space marines', page: 1, pageSize: 5 })
    const p2 = await apiPost('/search', { query: 'space marines', page: 2, pageSize: 5 })
    expect(p1.page).toBe(1)
    expect(p2.page).toBe(2)
    if (p2.records.length > 0) {
      expect(p1.records[0].primaryNode.id).not.toBe(p2.records[0].primaryNode.id)
    }
  })

  it('browse excludes child nodes (weapons, unit-abilities)', async () => {
    const data = await fetch(`${API_BASE}/browse/nodes?layer=faction&page=1&pageSize=50`)
    const json = await data.json()
    for (const node of json.nodes) {
      expect(node.category).not.toBe('weapon')
      expect(node.category).not.toBe('unit-ability')
    }
  })

  it('no raw weapon/unit-ability nodes escape in any search', async () => {
    for (const query of ['bolt rifle', 'lascannon', 'power sword', 'melta']) {
      const data = await apiPost('/search', { query })
      for (const record of data.records) {
        expect(record.primaryNode.category).not.toBe('weapon')
        expect(record.primaryNode.category).not.toBe('unit-ability')
        expect(record.primaryNode.category).not.toBe('wargear-option')
      }
    }
  })
})

describe('chapter approved cards', () => {
  it('primary mission search returns mission records', async () => {
    const data = await apiPost('/search', { query: 'Take and Hold' })
    const missions = data.records.filter(r => r.type === 'primary-mission')
    expect(missions.length).toBeGreaterThan(0)
    expect(missions[0].primaryNode.content).toContain('VP')
  })

  it('secondary mission search returns secondary mission records', async () => {
    const data = await apiPost('/search', { query: 'Assassination' })
    const missions = data.records.filter(r => r.type === 'secondary-mission')
    expect(missions.length).toBeGreaterThan(0)
  })

  it('twist card search returns twist records', async () => {
    const data = await apiPost('/search', { query: 'Night Fighting' })
    const twists = data.records.filter(r => r.type === 'twist')
    expect(twists.length).toBeGreaterThan(0)
    expect(twists[0].primaryNode.content).toContain('18"')
  })

  it('tournament companion rules are searchable', async () => {
    const data = await apiPost('/search', { query: 'secret missions' })
    const rules = data.records.filter(r =>
      r.type === 'rule' && r.primaryNode.title.toLowerCase().includes('secret'))
    expect(rules.length).toBeGreaterThan(0)
  })

  it('browse includes Chapter Approved layer', async () => {
    const data = await fetch(`${API_BASE}/browse/layers`)
    const json = await data.json()
    // Core layer should now include CA cards, or there's a dedicated layer
    const totalNodes = json.layers.reduce((sum, l) => sum + l.count, 0)
    expect(totalNodes).toBeGreaterThan(14581) // should be more than before
  })
})
```

- [ ] **Step 2: Run tests against API**

```bash
cd apps/brain/server && API_BASE=http://localhost:3008 npx vitest run src/search-validation.test.ts
```

- [ ] **Step 3: Fix any failures**

- [ ] **Step 4: Commit**

---

## Success Criteria

1. **Search returns records, not nodes** — "lascannon" → datasheets with lascannons. "Oath of Moment" → full army rule card with sub-rules and PDF source.

2. **Army Rule Cards are complete** — faction name, rule name, full text, sub-rules, tables, original PDF page reference. Not partial. Not wahapedia.

3. **Every record has its errata** — rules, units, stratagems all show applicable FAQ/commentary in a collapsible "Errata & FAQ" section.

4. **Inline entity links in card text** — "Sustained Hits" in a weapon ability is clickable and navigates to the core rule. No separate "Related" footer section. Entity names in content are `brain:nodeId` links rendered as amber clickable text.

5. **Cross-reference links** — if a collapsible section is needed for refs that don't appear naturally in the text, it's hidden by default and opened by the user.

6. **Pagination everywhere** — Search, Browse all have working prev/next. Tests verify different pages return different results.

7. **PDF overlays verified** — test harness validates positions are within bounds and page numbers are valid.

8. **Browse lists top-level records only** — ~2,000+ items, not 14,581. No weapons, no unit-abilities, no army-rule sub-rules.

9. **No raw nodes escape** — tests verify weapons, unit-abilities, and other child nodes never appear as standalone search results.

10. **Chapter Approved cards are searchable** — "Take and Hold" returns the primary mission card. "Night Fighting" returns the twist card. "Assassination" returns the secondary mission. All with correct VP conditions and full rule text.

11. **All card types have proper rendering** — Primary missions, secondary missions, twists, challengers each have dedicated card components. Deployment zones and terrain layouts render as PDF page images.

12. **Tournament companion rules are searchable** — Secret missions, reserves restrictions, actions, VP structure all return as rule records from the tournament companion documents.
