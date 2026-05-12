# Brain Data Massage & Complete Card System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean the brain node graph of phantom/malformed/over-split nodes via a build-time massage layer, create dedicated card components for every record type, and invert PDF-first rendering so cards are always primary and PDF overlays are supplementary.

**Architecture:** A `massage()` function runs after `mergeSources()` in `build-graph.ts` to drop bad nodes, merge fragments, and validate data. New card components cover all 20+ node categories. A `resolveCardView()` utility replaces inline PDF-first branching in BrainScreen.tsx so every record renders as a card first.

**Tech Stack:** TypeScript, Vitest, React, Tailwind CSS, Hono (Cloudflare Worker)

---

## Spec Reference

Full spec: `docs/superpowers/plans/2026-04-21-brain-data-massage-prompt.md`

## File Structure

### Server — Data Massage (build-time only)

| File | Action | Responsibility |
|---|---|---|
| `apps/brain/server/src/lib/model.ts` | MODIFY | Add optional `qualityFlags: string[]` to NodeSchema |
| `apps/brain/server/src/lib/massage.ts` | CREATE | Drop phantoms, merge fragments, validate content/PDF/hierarchy |
| `apps/brain/server/src/lib/massage.test.ts` | CREATE | Tests with real bad-data examples |
| `apps/brain/server/src/build-graph.ts:236-244` | MODIFY | Insert `massage()` call between mergeSources and mapNodesToPages |
| `apps/brain/server/src/validate-all.ts` | MODIFY | Add quality flag distribution to summary |

### Client — Card Components

| File | Action | Responsibility |
|---|---|---|
| `apps/brain/client/src/components/cards/types.ts` | MODIFY | Add new card data interfaces, extend CardData union |
| `apps/brain/client/src/components/cards/CoreRuleCard.tsx` | CREATE | Amber accent, table rendering for wound/hit roll |
| `apps/brain/client/src/components/cards/CoreRuleCard.test.tsx` | CREATE | Tests |
| `apps/brain/client/src/components/cards/DeploymentZoneCard.tsx` | CREATE | Green accent, inline PDF image + text fallback |
| `apps/brain/client/src/components/cards/DeploymentZoneCard.test.tsx` | CREATE | Tests |
| `apps/brain/client/src/components/cards/TerrainLayoutCard.tsx` | CREATE | Green accent, inline PDF image + text fallback |
| `apps/brain/client/src/components/cards/TerrainLayoutCard.test.tsx` | CREATE | Tests |
| `apps/brain/client/src/components/cards/ErrataCard.tsx` | CREATE | Orange accent, target rule link, correction text |
| `apps/brain/client/src/components/cards/ErrataCard.test.tsx` | CREATE | Tests |
| `apps/brain/client/src/components/cards/BalanceCard.tsx` | CREATE | Red accent, affected units, old/new values |
| `apps/brain/client/src/components/cards/BalanceCard.test.tsx` | CREATE | Tests |
| `apps/brain/client/src/components/cards/CommunityCard.tsx` | CREATE | Cyan accent, body + source |
| `apps/brain/client/src/components/cards/CommunityCard.test.tsx` | CREATE | Tests |
| `apps/brain/client/src/components/cards/DetachmentCard.tsx` | CREATE | Blue accent, ability + inline strats/enhancements |
| `apps/brain/client/src/components/cards/DetachmentCard.test.tsx` | CREATE | Tests |

### Client — Display Resilience

| File | Action | Responsibility |
|---|---|---|
| `apps/brain/client/src/lib/card-display.ts` | CREATE | `resolveCardView()` — always returns card, PDF optional |
| `apps/brain/client/src/lib/card-display.test.ts` | CREATE | Tests for every category + edge cases |
| `apps/brain/client/src/pages/BrainScreen.tsx` | MODIFY | Use `resolveCardView()`, remove PDF-first branching, add "View Source" button |

---

## Task 1: Add `qualityFlags` to Node Schema

**Files:**
- Modify: `apps/brain/server/src/lib/model.ts`
- Test: `apps/brain/server/src/lib/model.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// In model.test.ts, add:
it('accepts optional qualityFlags array', () => {
  const node = makeValidNode({ qualityFlags: ['content-inferred', 'pdf-ref-invalid'] })
  expect(() => NodeSchema.parse(node)).not.toThrow()
})

it('accepts node without qualityFlags', () => {
  const node = makeValidNode({})
  delete (node as any).qualityFlags
  expect(() => NodeSchema.parse(node)).not.toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/brain/server && npx vitest run src/lib/model.test.ts`
Expected: FAIL — qualityFlags not in schema

- [ ] **Step 3: Add qualityFlags to NodeSchema**

In `apps/brain/server/src/lib/model.ts`, add before the closing `})`:
```typescript
  // Data quality (set by massage layer, surfaced to UI)
  qualityFlags: z.array(z.string()).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/brain/server && npx vitest run src/lib/model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/model.ts apps/brain/server/src/lib/model.test.ts
git commit -m "feat(brain): add qualityFlags to Node schema"
```

---

## Task 2: Massage Layer — Drop Phantom Nodes

**Files:**
- Create: `apps/brain/server/src/lib/massage.ts`
- Create: `apps/brain/server/src/lib/massage.test.ts`

- [ ] **Step 1: Write failing tests for phantom node detection**

```typescript
// massage.test.ts
import { describe, it, expect } from 'vitest'
import { massage } from './massage'
import type { Node } from './model'

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: 'test:node',
    layer: 'core',
    category: 'phase-sequence',
    title: 'Test Node',
    content: 'This is a valid test node with enough content to pass.',
    summary: 'Test summary.',
    sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01T00:00:00Z' }],
    refs: [],
    version: 1,
    keywords: [],
    ...overrides,
  }
}

describe('massage — drop phantom nodes', () => {
  it('drops nodes with stat-line titles', () => {
    const nodes = [
      makeNode({ id: 'good', title: 'SUSTAINED HITS' }),
      makeNode({ id: 'bad1', title: '+' }),
      makeNode({ id: 'bad2', title: '10" 2+ 6+' }),
      makeNode({ id: 'bad3', title: '-3+ 7+' }),
    ]
    const result = massage(nodes)
    expect(result.nodes.map(n => n.id)).toEqual(['good'])
  })

  it('drops nodes with content < 20 chars (non-structural)', () => {
    const nodes = [
      makeNode({ id: 'good', title: 'Real Rule', content: 'This rule has real content.' }),
      makeNode({ id: 'bad', title: 'Tiny', content: 'Short.', category: 'enhancement' }),
      makeNode({ id: 'kept', title: 'Deploy', content: 'Short.', category: 'deployment-zone' }),
    ]
    const result = massage(nodes)
    expect(result.nodes.map(n => n.id)).toEqual(['good', 'kept'])
  })

  it('drops duplicate summaries within same category+faction', () => {
    const nodes = [
      makeNode({ id: 'first', title: 'Rule A', summary: 'Same summary', factionId: 'orks', category: 'faction-ability' }),
      makeNode({ id: 'dupe', title: 'Rule B', summary: 'Same summary', factionId: 'orks', category: 'faction-ability' }),
      makeNode({ id: 'diff-faction', title: 'Rule C', summary: 'Same summary', factionId: 'necrons', category: 'faction-ability' }),
    ]
    const result = massage(nodes)
    expect(result.nodes.map(n => n.id)).toEqual(['first', 'diff-faction'])
  })

  it('logs a summary of dropped nodes', () => {
    const nodes = [
      makeNode({ id: 'bad', title: '+' }),
    ]
    const result = massage(nodes)
    expect(result.stats.droppedPhantom).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/brain/server && npx vitest run src/lib/massage.test.ts`
Expected: FAIL — massage not found

- [ ] **Step 3: Implement phantom node dropping**

```typescript
// massage.ts
import type { Node } from './model'

/** Regex matching stat-line fragment titles that are not real headings */
const STAT_LINE_TITLE = /^[\d\-\u2011+\".\s]+$/

/** Categories where short content is acceptable (structural/visual nodes) */
const STRUCTURAL_CATEGORIES = new Set([
  'datasheet', 'detachment-rule', 'deployment-zone', 'terrain-layout',
])

export interface MassageStats {
  inputCount: number
  outputCount: number
  droppedPhantom: number
  droppedShortContent: number
  droppedDuplicateSummary: number
  flaggedContentInferred: number
  flaggedPdfInvalid: number
  flaggedOrphan: number
}

export interface MassageResult {
  nodes: Node[]
  stats: MassageStats
}

/**
 * Clean and validate nodes between mergeSources() and mapNodesToPages().
 * Drops phantom/malformed nodes, validates content and hierarchy,
 * adds qualityFlags for issues that can't be auto-fixed.
 */
export function massage(nodes: Node[]): MassageResult {
  const stats: MassageStats = {
    inputCount: nodes.length,
    outputCount: 0,
    droppedPhantom: 0,
    droppedShortContent: 0,
    droppedDuplicateSummary: 0,
    flaggedContentInferred: 0,
    flaggedPdfInvalid: 0,
    flaggedOrphan: 0,
  }

  let result = [...nodes]

  // Pass 1: Drop stat-line title phantoms
  result = result.filter(n => {
    if (STAT_LINE_TITLE.test(n.title)) {
      stats.droppedPhantom++
      return false
    }
    return true
  })

  // Pass 2: Drop short-content non-structural nodes
  result = result.filter(n => {
    if (n.content.length < 20 && !STRUCTURAL_CATEGORIES.has(n.category)) {
      stats.droppedShortContent++
      return false
    }
    return true
  })

  // Pass 3: Drop duplicate summaries within same category+factionId
  const seenSummaries = new Map<string, string>() // key → first node id
  result = result.filter(n => {
    const key = `${n.category}:${n.factionId || ''}:${n.summary}`
    if (seenSummaries.has(key)) {
      stats.droppedDuplicateSummary++
      return false
    }
    seenSummaries.set(key, n.id)
    return true
  })

  stats.outputCount = result.length

  console.log(`[massage] ${stats.inputCount} in → ${stats.outputCount} out`)
  console.log(`  Dropped: ${stats.droppedPhantom} phantom, ${stats.droppedShortContent} short-content, ${stats.droppedDuplicateSummary} dup-summary`)

  return { nodes: result, stats }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/brain/server && npx vitest run src/lib/massage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/massage.ts apps/brain/server/src/lib/massage.test.ts
git commit -m "feat(brain): massage layer — drop phantom nodes"
```

---

## Task 3: Massage Layer — Content Independence & Validation

**Files:**
- Modify: `apps/brain/server/src/lib/massage.ts`
- Modify: `apps/brain/server/src/lib/massage.test.ts`

- [ ] **Step 1: Write failing tests for content validation and PDF validation**

```typescript
describe('massage — content independence', () => {
  it('flags nodes where content just echoes the title', () => {
    const nodes = [
      makeNode({ id: 'echo', title: 'INVULNERABLE SAVE', content: 'INVULNERABLE SAVE', summary: 'Invulnerable save rule from Core Rules.' }),
    ]
    const result = massage(nodes)
    expect(result.nodes[0].qualityFlags).toContain('content-inferred')
    // Content should be populated from summary
    expect(result.nodes[0].content.length).toBeGreaterThan(30)
  })
})

describe('massage — PDF reference validation', () => {
  it('flags PDF sources with out-of-range percentages', () => {
    const nodes = [
      makeNode({
        id: 'bad-pdf',
        title: 'Good Title Here',
        sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01T00:00:00Z', page: 5, topPct: -10, heightPct: 200, leftPct: 0, widthPct: 50 }],
      }),
    ]
    const result = massage(nodes)
    expect(result.nodes[0].qualityFlags).toContain('pdf-ref-invalid')
  })

  it('flags PDF sources with zero-area bounding box', () => {
    const nodes = [
      makeNode({
        id: 'zero-area',
        title: 'Good Title',
        sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01T00:00:00Z', page: 1, topPct: 50, heightPct: 0, leftPct: 10, widthPct: 0 }],
      }),
    ]
    const result = massage(nodes)
    expect(result.nodes[0].qualityFlags).toContain('pdf-ref-invalid')
  })
})

describe('massage — hierarchy validation', () => {
  it('flags weapons without a valid datasheetId', () => {
    const nodes = [
      makeNode({ id: 'ds:001', category: 'datasheet', title: 'Intercessors' }),
      makeNode({ id: 'w:good', category: 'weapon', title: 'Bolt Rifle', datasheetId: 'ds:001' }),
      makeNode({ id: 'w:orphan', category: 'weapon', title: 'Orphan Gun', datasheetId: 'ds:missing' }),
    ]
    const result = massage(nodes)
    const orphan = result.nodes.find(n => n.id === 'w:orphan')
    expect(orphan?.qualityFlags).toContain('orphan')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/brain/server && npx vitest run src/lib/massage.test.ts`
Expected: FAIL

- [ ] **Step 3: Add content/PDF/hierarchy validation to massage()**

Add after Pass 3 in `massage.ts`:

```typescript
  // Build ID set for hierarchy validation
  const nodeIds = new Set(result.map(n => n.id))

  for (const node of result) {
    if (!node.qualityFlags) node.qualityFlags = []

    // Pass 4: Content independence
    const contentNorm = node.content.trim().toLowerCase()
    const titleNorm = node.title.trim().toLowerCase()
    if (contentNorm === titleNorm || node.content.length < 30) {
      // Try to populate from summary
      if (node.summary && node.summary.length > node.content.length) {
        node.content = node.summary
      }
      node.qualityFlags.push('content-inferred')
      stats.flaggedContentInferred++
    }

    // Pass 5: PDF reference validation
    for (const src of node.sources) {
      if (src.type !== 'pdf') continue
      const p = src as any
      if (p.page != null) {
        const invalid =
          (p.topPct != null && (p.topPct < 0 || p.topPct > 100)) ||
          (p.heightPct != null && (p.heightPct < 0.5 || p.heightPct > 100)) ||
          (p.leftPct != null && (p.leftPct < 0 || p.leftPct > 100)) ||
          (p.widthPct != null && (p.widthPct < 0.5 || p.widthPct > 100))
        if (invalid) {
          node.qualityFlags.push('pdf-ref-invalid')
          stats.flaggedPdfInvalid++
        }
      }
    }

    // Pass 6: Hierarchy validation
    if ((node.category === 'weapon' || node.category === 'unit-ability') && node.datasheetId) {
      if (!nodeIds.has(node.datasheetId)) {
        node.qualityFlags.push('orphan')
        stats.flaggedOrphan++
      }
    }
    if ((node.category === 'stratagem' || node.category === 'enhancement') && node.detachmentId) {
      if (!nodeIds.has(node.detachmentId)) {
        node.qualityFlags.push('orphan')
        stats.flaggedOrphan++
      }
    }

    // Clean up empty flags
    if (node.qualityFlags.length === 0) delete (node as any).qualityFlags
  }

  console.log(`  Flagged: ${stats.flaggedContentInferred} content-inferred, ${stats.flaggedPdfInvalid} pdf-invalid, ${stats.flaggedOrphan} orphan`)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/brain/server && npx vitest run src/lib/massage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/massage.ts apps/brain/server/src/lib/massage.test.ts
git commit -m "feat(brain): massage layer — content/PDF/hierarchy validation"
```

---

## Task 4: Wire Massage into Build Pipeline

**Files:**
- Modify: `apps/brain/server/src/build-graph.ts:236-244`

- [ ] **Step 1: Add massage import and call**

At top of `build-graph.ts`, add:
```typescript
import { massage } from './lib/massage'
```

After line 244 (`allRefs.push(...mergeResult.refs)`), before `// ── Map nodes to PDF page positions`, add:
```typescript
  // ── Massage: clean bad nodes, validate content, flag issues ──────────────
  console.log('\n6b. Data massage')
  const massageResult = massage(allNodes)
  allNodes.length = 0
  allNodes.push(...massageResult.nodes)
```

- [ ] **Step 2: Run build to verify it works**

Run: `cd apps/brain/server && npx tsx src/build-graph.ts`
Expected: Build completes with massage stats printed

- [ ] **Step 3: Run validate-all.ts to check improvement**

Run: `cd apps/brain/server && npx tsx src/validate-all.ts`
Expected: Fewer warnings than before

- [ ] **Step 4: Commit**

```bash
git add apps/brain/server/src/build-graph.ts
git commit -m "feat(brain): wire massage layer into build pipeline"
```

---

## Task 5: New Card Data Types

**Files:**
- Modify: `apps/brain/client/src/components/cards/types.ts`

- [ ] **Step 1: Add new card data interfaces and extend CardData union**

```typescript
// Add these interfaces:

export interface CoreRuleCardData {
  id: string
  name: string
  description: string
  phase?: string
  tableHtml?: string   // Pre-rendered HTML table (wound roll, hit roll)
  sources?: SourceRef[]
  errata?: ErrataEntry[]
  qualityFlags?: string[]
}

export interface DeploymentZoneCardData {
  id: string
  name: string
  battleSize?: string
  description: string
  pdfImage?: { pdfName: string; page: number }
  sources?: SourceRef[]
  qualityFlags?: string[]
}

export interface TerrainLayoutCardData {
  id: string
  name: string
  description: string
  pdfImage?: { pdfName: string; page: number }
  sources?: SourceRef[]
  qualityFlags?: string[]
}

export interface ErrataCardData {
  id: string
  name: string
  targetRule?: string        // Title of the rule this clarifies
  targetNodeId?: string      // ID for navigation
  correctionText: string
  source?: string
  effectiveDate?: string
  qualityFlags?: string[]
}

export interface BalanceCardData {
  id: string
  name: string
  description: string
  effectiveDate?: string
  sources?: SourceRef[]
  qualityFlags?: string[]
}

export interface CommunityCardData {
  id: string
  name: string
  description: string
  sourceAttribution?: string
  qualityFlags?: string[]
}

export interface DetachmentCardData {
  id: string
  name: string
  factionId: string
  factionName?: string
  subfaction?: string
  abilityText: string
  stratagems: StratagemCardData[]
  enhancements: EnhancementCardData[]
  chapterBadge?: string
  sources?: SourceRef[]
  errata?: ErrataEntry[]
  qualityFlags?: string[]
}

// Extend CardData union:
export type CardData =
  | { type: 'unit'; data: UnitCardData }
  | { type: 'stratagem'; data: StratagemCardData }
  | { type: 'enhancement'; data: EnhancementCardData }
  | { type: 'rule'; data: RuleCardData }
  | { type: 'core-rule'; data: CoreRuleCardData }
  | { type: 'mission'; data: MissionCardData }
  | { type: 'twist'; data: TwistCardData }
  | { type: 'challenger'; data: ChallengerCardData }
  | { type: 'deployment-zone'; data: DeploymentZoneCardData }
  | { type: 'terrain-layout'; data: TerrainLayoutCardData }
  | { type: 'errata'; data: ErrataCardData }
  | { type: 'balance'; data: BalanceCardData }
  | { type: 'community'; data: CommunityCardData }
  | { type: 'detachment'; data: DetachmentCardData }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/brain/client && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add apps/brain/client/src/components/cards/types.ts
git commit -m "feat(brain): add card data types for all record categories"
```

---

## Task 6: CoreRuleCard Component

**Files:**
- Create: `apps/brain/client/src/components/cards/CoreRuleCard.tsx`
- Create: `apps/brain/client/src/components/cards/CoreRuleCard.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CoreRuleCard } from './CoreRuleCard'

const mockContext = { highlightTerms: [], onContentClick: () => {}, onDismiss: () => {} }

describe('CoreRuleCard', () => {
  it('renders rule name and description', () => {
    render(<CoreRuleCard data={{ id: '1', name: 'SUSTAINED HITS', description: 'Weapons with [SUSTAINED HITS X]...' }} context={mockContext} />)
    expect(screen.getByText('SUSTAINED HITS')).toBeInTheDocument()
    expect(screen.getByText(/Weapons with/)).toBeInTheDocument()
  })

  it('renders phase badge when provided', () => {
    render(<CoreRuleCard data={{ id: '1', name: 'WOUND ROLL', description: 'Make a wound roll...', phase: 'shooting' }} context={mockContext} />)
    expect(screen.getByText(/shooting/i)).toBeInTheDocument()
  })

  it('renders HTML table when tableHtml provided', () => {
    render(<CoreRuleCard data={{ id: '1', name: 'WOUND ROLL', description: 'Roll to wound.', tableHtml: '<table><tr><td>3+</td></tr></table>' }} context={mockContext} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('shows quality flag badge when flagged', () => {
    render(<CoreRuleCard data={{ id: '1', name: 'Test', description: 'Desc', qualityFlags: ['content-inferred'] }} context={mockContext} />)
    expect(screen.getByText(/inferred/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/brain/client && npx vitest run src/components/cards/CoreRuleCard.test.tsx`

- [ ] **Step 3: Implement CoreRuleCard**

```tsx
// CoreRuleCard.tsx
import { ErrataSection } from './ErrataSection'
import type { CardContext, CoreRuleCardData } from './types'

interface Props { data: CoreRuleCardData; context: CardContext }

export function CoreRuleCard({ data, context }: Props) {
  const pdfSource = data.sources?.find(s => s.type === 'pdf' && s.page)

  return (
    <div className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950" style={{ fontFamily: "'Source Sans 3', sans-serif" }}>
      <div className="px-3.5 py-2.5">
        <div className="border-b-2 border-amber-500 pb-1 mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-bold uppercase tracking-wider text-white" style={{ fontFamily: "'Oswald', sans-serif" }}>
            {data.name}
          </span>
          {data.phase && (
            <span className="text-[9px] text-amber-400 uppercase tracking-wide bg-amber-400/10 px-1.5 py-0.5 rounded">{data.phase}</span>
          )}
        </div>
        <div className="text-[11px] text-slate-300 leading-snug whitespace-pre-line">{data.description}</div>
        {data.tableHtml && (
          <div className="mt-2 overflow-x-auto text-[10px]" dangerouslySetInnerHTML={{ __html: data.tableHtml }} />
        )}
        {data.qualityFlags?.length ? (
          <div className="flex gap-1 mt-2">
            {data.qualityFlags.map(f => (
              <span key={f} className="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{f}</span>
            ))}
          </div>
        ) : null}
        {pdfSource && context.onViewSource && (
          <button onClick={() => context.onViewSource!(pdfSource.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), pdfSource.page!, data.name, pdfSource.topPct, pdfSource.heightPct, pdfSource.leftPct, pdfSource.widthPct)} className="text-[9px] text-slate-500 hover:text-amber-400 mt-2 underline">
            View Source PDF
          </button>
        )}
      </div>
      <ErrataSection errata={data.errata} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

## Task 7: ErrataCard, BalanceCard, CommunityCard Components

**Files:**
- Create: `apps/brain/client/src/components/cards/ErrataCard.tsx` + test
- Create: `apps/brain/client/src/components/cards/BalanceCard.tsx` + test
- Create: `apps/brain/client/src/components/cards/CommunityCard.tsx` + test

Each follows the same pattern as Task 6: Oswald header, type-specific accent color, structured fields, quality flag badges, "View Source" button when applicable.

- [ ] **Step 1: Write tests for all three cards**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement ErrataCard** (orange accent — `border-orange-500`)
  - Header: errata title
  - Body: "Clarifies: {targetRule}" (clickable via `onContentClick`), correction text, date
- [ ] **Step 4: Implement BalanceCard** (red accent — `border-red-500`)
  - Header: change title
  - Body: description, effective date
- [ ] **Step 5: Implement CommunityCard** (cyan accent — `border-cyan-500`)
  - Header: title
  - Body: content, source attribution footer
- [ ] **Step 6: Run all tests to verify they pass**
- [ ] **Step 7: Commit**

---

## Task 8: DeploymentZoneCard and TerrainLayoutCard

**Files:**
- Create: `apps/brain/client/src/components/cards/DeploymentZoneCard.tsx` + test
- Create: `apps/brain/client/src/components/cards/TerrainLayoutCard.tsx` + test

These are unique: PDF page image is the PRIMARY content (they're diagrams). Text is the fallback.

- [ ] **Step 1: Write tests**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement DeploymentZoneCard** (green accent)
  - If `pdfImage` provided: render `<img>` of the PDF page inline (same URL pattern as PdfPageView: `${API_BASE}/pages/${pdfName}/page-${page}.png`)
  - If image fails to load: show text description fallback
  - Header: zone name + battle size badge
- [ ] **Step 4: Implement TerrainLayoutCard** (green accent)
  - Same pattern: inline PDF image with text fallback
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit**

---

## Task 9: DetachmentCard Component

**Files:**
- Create: `apps/brain/client/src/components/cards/DetachmentCard.tsx` + test

This replaces the separate `DetachmentPage` component with an inline card that shows ability + collapsible stratagem/enhancement lists.

- [ ] **Step 1: Write tests**

```typescript
it('renders detachment name and ability', () => { ... })
it('renders stratagem count badge', () => { ... })
it('expands to show stratagems when clicked', () => { ... })
it('renders enhancement count badge', () => { ... })
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement DetachmentCard** (blue accent — `border-blue-500`)
  - Header: detachment name, faction name, chapter badge
  - Body: ability text
  - Collapsible sections: "Stratagems (N)" → renders StratagemCard for each, "Enhancements (N)" → renders EnhancementCard for each
  - Uses `CollapsibleSection` component (already exists)
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

---

## Task 10: Display Resilience Utility

**Files:**
- Create: `apps/brain/client/src/lib/card-display.ts`
- Create: `apps/brain/client/src/lib/card-display.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest'
import { resolveCardView } from './card-display'

describe('resolveCardView', () => {
  it('returns a card for every known category', () => {
    const categories = ['datasheet', 'stratagem', 'enhancement', 'faction-ability',
      'detachment-rule', 'phase-sequence', 'core-mechanic', 'terrain',
      'primary-mission', 'secondary-mission', 'twist', 'challenger',
      'deployment-zone', 'terrain-layout', 'faq', 'commentary',
      'balance-change', 'mission', 'army-construction']
    for (const cat of categories) {
      const node = { id: '1', title: 'Test', content: 'Content', summary: 'Sum', layer: 'core', category: cat, score: 0, sources: [], keywords: [] }
      const result = resolveCardView(node as any)
      expect(result.card, `missing card for ${cat}`).toBeDefined()
      expect(result.card.type).toBeTruthy()
    }
  })

  it('includes pdfSource when valid PDF ref exists', () => {
    const node = { id: '1', title: 'Test', content: 'Content', summary: 'Sum', layer: 'core', category: 'phase-sequence', score: 0, sources: [{ type: 'pdf', title: 'Core Rules', page: 5, topPct: 10, heightPct: 20, leftPct: 0, widthPct: 50 }], keywords: [] }
    const result = resolveCardView(node as any)
    expect(result.pdfSource).toBeDefined()
    expect(result.pdfSource!.page).toBe(5)
  })

  it('never returns only PDF — always has a card', () => {
    const node = { id: '1', title: 'Test', content: '', summary: '', layer: 'core', category: 'phase-sequence', score: 0, sources: [{ type: 'pdf', title: 'Core Rules', page: 1 }], keywords: [] }
    const result = resolveCardView(node as any)
    expect(result.card).toBeDefined()
  })

  it('surfaces qualityFlags from node', () => {
    const node = { id: '1', title: 'T', content: 'C', summary: 'S', layer: 'core', category: 'core-mechanic', score: 0, sources: [], keywords: [], qualityFlags: ['content-inferred'] }
    const result = resolveCardView(node as any)
    expect(result.qualityFlags).toContain('content-inferred')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement resolveCardView**

The function maps every `category` to the correct card builder and card type. Uses the existing `buildUnitData`, `buildStratagemData`, `buildEnhancementData`, `buildRuleData` functions (extracted from BrainScreen.tsx or imported). Adds new builders for core-rule, errata, balance, community, detachment, deployment-zone, terrain-layout.

```typescript
export interface CardView {
  card: CardData
  pdfSource?: { pdfName: string; page: number; title: string; topPct?: number; heightPct?: number; leftPct?: number; widthPct?: number }
  qualityFlags: string[]
}

export function resolveCardView(node: ResultNode, record?: SearchRecord): CardView {
  const pdfSrc = node.sources?.find((s: any) => s.type === 'pdf' && s.page)
  const pdfSource = pdfSrc ? {
    pdfName: pdfSrc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    page: pdfSrc.page!,
    title: node.title,
    topPct: (pdfSrc as any).topPct,
    heightPct: (pdfSrc as any).heightPct,
    leftPct: (pdfSrc as any).leftPct,
    widthPct: (pdfSrc as any).widthPct,
  } : undefined
  const qualityFlags = (node as any).qualityFlags ?? []

  // Map category → card type + builder
  const card = buildCardForCategory(node, record)
  return { card, pdfSource, qualityFlags }
}
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

---

## Task 11: Integrate resolveCardView into BrainScreen.tsx

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`

This is the critical integration task. It removes PDF-first branching and makes cards primary.

- [ ] **Step 1: Import resolveCardView and new card components**

Add imports at top of BrainScreen.tsx:
```typescript
import { resolveCardView } from '../lib/card-display'
import { CoreRuleCard } from '../components/cards/CoreRuleCard'
import { ErrataCard } from '../components/cards/ErrataCard'
import { BalanceCard } from '../components/cards/BalanceCard'
import { CommunityCard } from '../components/cards/CommunityCard'
import { DetachmentCard } from '../components/cards/DetachmentCard'
import { DeploymentZoneCard } from '../components/cards/DeploymentZoneCard'
import { TerrainLayoutCard } from '../components/cards/TerrainLayoutCard'
```

- [ ] **Step 2: Replace handleOpenCard**

Remove the PDF-first branching. New logic:
```typescript
async function handleOpenCard(node: ResultNode) {
  // For unit cards, fetch full data
  if (node.category === 'datasheet') {
    const unitData = await fetchFullUnitData(node.id, node)
    setActiveCard({ type: 'unit', data: unitData })
    return
  }
  const { card } = resolveCardView(node)
  setActiveCard(card)
}
```

- [ ] **Step 3: Replace handleOpenRecord**

Same pattern — remove PDF-first branching, use resolveCardView for non-unit records:
```typescript
async function handleOpenRecord(record: SearchRecord) {
  const node = record.primaryNode
  if (record.type === 'unit' || node.category === 'datasheet') {
    // existing unit data building from record.childNodes
    ...
    return
  }
  const { card } = resolveCardView(node, record)
  setActiveCard(card)
}
```

- [ ] **Step 4: Add new card types to the Overlay render block**

In the `<Overlay>` section, add:
```tsx
{activeCard?.type === 'core-rule' && <CoreRuleCard data={activeCard.data} context={cardContext} />}
{activeCard?.type === 'errata' && <ErrataCard data={activeCard.data} context={cardContext} />}
{activeCard?.type === 'balance' && <BalanceCard data={activeCard.data} context={cardContext} />}
{activeCard?.type === 'community' && <CommunityCard data={activeCard.data} context={cardContext} />}
{activeCard?.type === 'detachment' && <DetachmentCard data={activeCard.data} context={cardContext} />}
{activeCard?.type === 'deployment-zone' && <DeploymentZoneCard data={activeCard.data} context={cardContext} />}
{activeCard?.type === 'terrain-layout' && <TerrainLayoutCard data={activeCard.data} context={cardContext} />}
```

- [ ] **Step 5: Add "View Source" button to cardContext**

The `onViewSource` callback on `cardContext` already exists. Cards that have PDF sources can call it. No change needed — the card components call it internally.

- [ ] **Step 6: Run all client tests**

Run: `cd apps/brain/client && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add apps/brain/client/src/pages/BrainScreen.tsx
git commit -m "feat(brain): integrate resolveCardView, remove PDF-first branching"
```

---

## Task 12: Build, Validate, Deploy

- [ ] **Step 1: Run full test suite**

```bash
cd apps/brain/client && npx vitest run
cd apps/brain/server && npx vitest run src/lib/
```
Expected: All pass

- [ ] **Step 2: Rebuild graph with massage layer**

```bash
cd apps/brain/server && npx tsx src/build-graph.ts
```

- [ ] **Step 3: Run validate-all.ts**

```bash
cd apps/brain/server && npx tsx src/validate-all.ts
```
Expected: Fewer phantoms, quality flags reported

- [ ] **Step 4: Upload to R2**

```bash
export CLOUDFLARE_API_TOKEN="(from .env)"
npx wrangler r2 object put tabletop-tools-brain/manifest.json --file .local/brain/manifest.json
for f in .local/brain/nodes/*.json; do npx wrangler r2 object put "tabletop-tools-brain/nodes/$(basename $f)" --file "$f"; done
for f in .local/brain/refs/*.json; do npx wrangler r2 object put "tabletop-tools-brain/refs/$(basename $f)" --file "$f"; done
```

- [ ] **Step 5: Deploy server**

```bash
export BUILD_VERSION="$(date +%Y%m%d-%H%M%S)"
cd apps/brain/server && npx wrangler deploy --var BUILD_VERSION:"$BUILD_VERSION"
```

- [ ] **Step 6: Build and deploy client**

```bash
cd apps/brain/client && rm -f tsconfig.tsbuildinfo && rm -rf node_modules/.vite dist
BUILD_VERSION=$BUILD_VERSION npx vite build
cd apps/gateway && rm -rf dist && bash build.sh
npx wrangler pages deploy dist --project-name tabletop-tools --branch main --commit-dirty=true
```

- [ ] **Step 7: Purge CDN cache**

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

- [ ] **Step 8: Verify live**

Test on `tabletop-tools.net/brain/`:
- Browse each category — all show proper cards
- Search "Sustained Hits" — opens CoreRuleCard, not PdfPageView
- Search "Berzerker Warband" — opens DetachmentCard
- Click a deployment zone in browse — shows inline PDF image
- Click an errata entry — shows ErrataCard with target rule link
- No record shows "Page image unavailable" as sole content

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(brain): data massage layer + complete card system — all record types render as cards"
```
