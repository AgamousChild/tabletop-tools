# Brain Cross-Source Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate nodes from BSData and Wahapedia by merging them into single enriched nodes with canonical faction IDs, fixing search collisions and cutting the index size in half.

**Architecture:** Add a merge pass to both `build-graph.ts` and `runBrainSync` in `sync.ts` that runs after both parsers, matching nodes by Wahapedia numeric ID. The game-data parser (`game-data.ts`) is the canonical source for datasheets — BSData faction-pack nodes enrich it with additional keywords and content. The `FACTION_CODE_TO_SLUG` mapping already exists in `game-data.ts` and drives faction normalization. The merge step uses the same mapping to unify short-code factions (SM, CSM, CD) with full-name factions (space-marines, chaos-space-marines, chaos-daemons). After merging, `partitionNodes` only emits canonical faction files.

**Tech Stack:** TypeScript, Vitest, existing brain parser infrastructure

---

## Current State

### The duplicate problem

Both BSData (faction-pack parser) and Wahapedia (game-data parser) produce nodes for the same units:

| Source | Faction ID | File | Node count |
|---|---|---|---|
| BSData | `SM` | `faction-SM.json` | 299 datasheets |
| Wahapedia | `space-marines` | `faction-space-marines.json` | 185 datasheets |

They share the same Wahapedia numeric IDs (e.g., `000000061` = Assault Squad in both). Currently 268 are deduped by ID collision in `build-graph.ts` (game-data wins), but many BSData nodes use IDs that game-data doesn't produce, or have different content that doesn't match.

**Result:** 50 faction files instead of 25, duplicate vectors in Vectorize, search collisions between `faction-ability` nodes and `datasheet` nodes with the same title.

### What each source provides

**Game-data parser (Wahapedia CSV)** — the canonical source:
- Structured stat lines, weapon profiles, ability text
- Points, composition, loadout, transport, damaged profiles
- Unit keywords (faction + generic), subfaction detection
- Combat tier keywords (toughness, save, invuln, wounds)
- Detachments, stratagems, enhancements, detachment abilities
- Leader attachments, wargear options
- Faction parent nodes

**Faction-pack parser (BSData/GW markdown)** — the enrichment source:
- Errata, FAQ, commentary content (unique — game-data doesn't have this)
- Detachment rules with full rules text from official PDFs
- Stratagems with WHEN/TARGET/EFFECT structure
- Enhancements with cost and description
- Faction abilities

### Key observation

The faction-pack parser creates nodes with IDs like `det:space-marines:gladius-task-force:assault-squad` — these are detachment-scoped rules about units, NOT the datasheet itself. They have `category: 'faction-ability'` or `category: 'enhancement'`. The game-data parser creates the actual datasheet with `category: 'datasheet'` and ID `000000061`.

**These are NOT duplicates — they're different node types that happen to share titles.** The real problem is:
1. BSData short-code faction files (SM, CSM, CD) create a parallel set of nodes that partition into separate files
2. The embedding text for `faction-ability` nodes is too similar to `datasheet` nodes, causing search collisions

## File Structure

### Files to modify

| File | Responsibility |
|---|---|
| `apps/brain/server/src/build-graph.ts` | Add merge pass after both parsers, before partition |
| `apps/brain/server/src/lib/merge-sources.ts` | **NEW** — merge logic: faction normalization, node enrichment, duplicate elimination |
| `apps/brain/server/src/lib/merge-sources.test.ts` | **NEW** — tests for merge logic |
| `apps/brain/server/src/lib/sync.ts` | Wire mergeSources into `runBrainSync` (the Worker-based sync path) |

### Files NOT changed
- `faction-pack.ts` — still produces its nodes with short-code faction IDs; the merge step normalizes them
- `retrieve.ts` — already has datasheet boosting; merge eliminates the collision at the source
- `worker.ts` — no changes needed
- Client code — no changes needed

---

### Task 1: Create the faction code mapping module

The `FACTION_CODE_TO_SLUG` map already exists in `game-data.ts`. Extract it to a shared location so `merge-sources.ts` can use it without importing the entire game-data parser.

**Files:**
- Create: `apps/brain/server/src/lib/faction-codes.ts`
- Modify: `apps/brain/server/src/lib/parsers/game-data.ts:193-225` (import from shared)
- Test: `apps/brain/server/src/lib/faction-codes.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// faction-codes.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeFactionId, FACTION_CODE_TO_SLUG } from './faction-codes'

describe('normalizeFactionId', () => {
  it('maps short codes to canonical slugs', () => {
    expect(normalizeFactionId('SM')).toBe('space-marines')
    expect(normalizeFactionId('CSM')).toBe('chaos-space-marines')
    expect(normalizeFactionId('CD')).toBe('chaos-daemons')
    expect(normalizeFactionId('AM')).toBe('astra-militarum')
    expect(normalizeFactionId('GK')).toBe('grey-knights')
  })

  it('returns canonical slugs unchanged', () => {
    expect(normalizeFactionId('space-marines')).toBe('space-marines')
    expect(normalizeFactionId('necrons')).toBe('necrons')
  })

  it('slugifies unknown codes', () => {
    expect(normalizeFactionId('NewFaction')).toBe('newfaction')
  })

  it('has entries for all known factions', () => {
    expect(Object.keys(FACTION_CODE_TO_SLUG).length).toBeGreaterThanOrEqual(20)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/lib/faction-codes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create faction-codes.ts**

```typescript
// faction-codes.ts
import { slugify } from './slugify'

/** Map Wahapedia/BSData short codes to canonical kebab-case slugs. */
export const FACTION_CODE_TO_SLUG: Record<string, string> = {
  AS: 'adepta-sororitas',
  AC: 'adeptus-custodes',
  AdM: 'adeptus-mechanicus',
  TL: 'adeptus-titanicus',
  AE: 'aeldari',
  AM: 'astra-militarum',
  CD: 'chaos-daemons',
  QT: 'chaos-knights',
  CSM: 'chaos-space-marines',
  DG: 'death-guard',
  DRU: 'drukhari',
  EC: 'emperors-children',
  GC: 'genestealer-cults',
  GK: 'grey-knights',
  AoI: 'imperial-agents',
  QI: 'imperial-knights',
  LoV: 'leagues-of-votann',
  NEC: 'necrons',
  ORK: 'orks',
  SM: 'space-marines',
  TS: 'thousand-sons',
  TYR: 'tyranids',
  TAU: 't-au-empire',
  UN: 'unaligned',
  UA: 'unbound-adversaries',
  WE: 'world-eaters',
}

/** Reverse map: canonical slug → short code(s). */
export const SLUG_TO_CODES: Record<string, string[]> = {}
for (const [code, slug] of Object.entries(FACTION_CODE_TO_SLUG)) {
  if (!SLUG_TO_CODES[slug]) SLUG_TO_CODES[slug] = []
  SLUG_TO_CODES[slug]!.push(code)
}

/** Normalize a faction ID from any format to canonical slug. */
export function normalizeFactionId(code: string): string {
  // Already a canonical slug?
  if (Object.values(FACTION_CODE_TO_SLUG).includes(code)) return code
  // Known short code?
  return FACTION_CODE_TO_SLUG[code] ?? slugify(code)
}
```

- [ ] **Step 4: Update game-data.ts** to import from shared module

Replace the local `FACTION_CODE_TO_SLUG` and `normalizeFactionId` in `game-data.ts:193-225` with:
```typescript
import { normalizeFactionId } from '../faction-codes'
```
Delete the local `FACTION_CODE_TO_SLUG` constant and `normalizeFactionId` function.

- [ ] **Step 5: Run all server tests**

Run: `npx vitest run --passWithNoTests`
Expected: all 323+ tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/brain/server/src/lib/faction-codes.ts apps/brain/server/src/lib/faction-codes.test.ts apps/brain/server/src/lib/parsers/game-data.ts
git commit -m "refactor(brain): extract faction code mapping to shared module"
```

---

### Task 2: Create the merge-sources module

This is the core merge logic. It takes all nodes from both parsers and:
1. Normalizes all factionIds to canonical slugs
2. For nodes with the same ID, keeps the game-data version (it's more complete) and enriches it with BSData keywords
3. For faction-ability/enhancement nodes that share a title with a datasheet, appends " (rule)" to the summary to differentiate embeddings
4. Includes faction name in datasheet summary text for better embedding disambiguation

**Files:**
- Create: `apps/brain/server/src/lib/merge-sources.ts`
- Test: `apps/brain/server/src/lib/merge-sources.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// merge-sources.test.ts
import { describe, it, expect } from 'vitest'
import { mergeSources } from './merge-sources'
import type { Node, NodeRef } from './model'

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: 'test-id',
    layer: 'unit',
    category: 'datasheet',
    title: 'Test Unit',
    content: 'Test content',
    summary: 'Test summary',
    factionId: 'space-marines',
    sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    refs: [],
    version: 1,
    keywords: ['infantry'],
    ...overrides,
  }
}

describe('mergeSources', () => {
  it('normalizes all factionIds to canonical slugs', () => {
    const nodes = [
      makeNode({ id: '001', factionId: 'SM', title: 'Intercessors' }),
      makeNode({ id: '002', factionId: 'CSM', title: 'Chosen' }),
    ]
    const result = mergeSources(nodes, [])
    expect(result.nodes.find(n => n.id === '001')!.factionId).toBe('space-marines')
    expect(result.nodes.find(n => n.id === '002')!.factionId).toBe('chaos-space-marines')
  })

  it('deduplicates nodes with same ID, keeping the first occurrence', () => {
    const nodes = [
      makeNode({ id: '001', title: 'Intercessors', content: 'Game data version', keywords: ['infantry'] }),
      makeNode({ id: '001', title: 'Intercessors', content: 'BSData version', keywords: ['infantry', 'extra-kw'] }),
    ]
    const result = mergeSources(nodes, [])
    const matching = result.nodes.filter(n => n.id === '001')
    expect(matching).toHaveLength(1)
    expect(matching[0]!.content).toBe('Game data version')
    // BSData keywords should be merged in
    expect(matching[0]!.keywords).toContain('extra-kw')
  })

  it('includes faction name in datasheet summary for embedding disambiguation', () => {
    const nodes = [
      makeNode({ id: '001', factionId: 'death-guard', category: 'datasheet', title: 'Chaos Rhino', summary: 'Chaos Rhino — Dedicated Transports' }),
    ]
    const result = mergeSources(nodes, [])
    const rhino = result.nodes.find(n => n.id === '001')!
    expect(rhino.summary).toContain('Death Guard')
  })

  it('does NOT prefix faction name if already present in summary', () => {
    const nodes = [
      makeNode({ id: '001', factionId: 'death-guard', category: 'datasheet', title: 'Death Guard Rhino', summary: 'Death Guard Rhino — Dedicated Transports' }),
    ]
    const result = mergeSources(nodes, [])
    const rhino = result.nodes.find(n => n.id === '001')!
    // Should not have "Death Guard" twice
    expect(rhino.summary.match(/death guard/gi)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('appends category tag to non-datasheet nodes that share a title with a datasheet', () => {
    const nodes = [
      makeNode({ id: '001', category: 'datasheet', title: 'Assault Squad', summary: 'Assault Squad — unit' }),
      makeNode({ id: 'det:sm:x:assault-squad', category: 'faction-ability', title: 'ASSAULT SQUAD', summary: 'ASSAULT SQUAD rule text' }),
    ]
    const result = mergeSources(nodes, [])
    const rule = result.nodes.find(n => n.id === 'det:sm:x:assault-squad')!
    // Summary should indicate it's a rule, not a unit
    expect(rule.summary).toContain('faction rule')
  })

  it('normalizes factionId in refs', () => {
    const nodes = [makeNode({ id: '001', factionId: 'SM' })]
    const refs: NodeRef[] = [
      { sourceId: '001', targetId: '002', rel: 'part_of', context: 'test' },
    ]
    const result = mergeSources(nodes, refs)
    // Refs themselves don't have factionId, but they should still be present
    expect(result.refs).toHaveLength(1)
  })

  it('removes refs where either endpoint does not exist', () => {
    const nodes = [
      makeNode({ id: '001', content: 'first', keywords: ['a'] }),
    ]
    const refs: NodeRef[] = [
      { sourceId: '001', targetId: '999', rel: 'part_of', context: 'target missing' },
      { sourceId: '999', targetId: '001', rel: 'modifies', context: 'source missing' },
      { sourceId: '001', targetId: '001', rel: 'clarifies', context: 'both exist' },
    ]
    const result = mergeSources(nodes, refs)
    // Only the ref where both endpoints exist should survive
    expect(result.refs).toHaveLength(1)
    expect(result.refs[0]!.context).toBe('both exist')
  })

  it('deduplicates refs with same sourceId + targetId + rel', () => {
    const nodes = [makeNode({ id: '001' })]
    const refs: NodeRef[] = [
      { sourceId: '001', targetId: '002', rel: 'part_of', context: 'from game-data' },
      { sourceId: '001', targetId: '002', rel: 'part_of', context: 'from bsdata' },
    ]
    const result = mergeSources(nodes, refs)
    expect(result.refs).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/merge-sources.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement merge-sources.ts**

```typescript
// merge-sources.ts
import type { Node, NodeRef } from './model'
import { normalizeFactionId } from './faction-codes'

export interface MergeResult {
  nodes: Node[]
  refs: NodeRef[]
  stats: {
    inputNodes: number
    outputNodes: number
    mergedByIdCount: number
    factionNormalizedCount: number
    refsDeduped: number
    summaryTagged: number
  }
}

/**
 * Merge nodes from all sources into a deduplicated, faction-normalized set.
 *
 * Rules:
 * 1. All factionIds are normalized to canonical slugs (SM → space-marines)
 * 2. Nodes with the same ID are merged: first occurrence wins for content,
 *    but keywords from all occurrences are combined
 * 3. Datasheet summaries include the faction name for embedding disambiguation
 * 4. Non-datasheet nodes that share a title with a datasheet get a category
 *    tag appended to their summary to differentiate embeddings
 * 5. Refs are deduplicated by sourceId + targetId + rel
 * 6. Refs pointing to/from non-existent nodes are removed
 */
export function mergeSources(allNodes: Node[], allRefs: NodeRef[]): MergeResult {
  const stats = {
    inputNodes: allNodes.length,
    outputNodes: 0,
    mergedByIdCount: 0,
    factionNormalizedCount: 0,
    refsDeduped: 0,
    summaryTagged: 0,
  }

  // Step 1: Normalize factionIds
  for (const node of allNodes) {
    if (node.factionId) {
      const canonical = normalizeFactionId(node.factionId)
      if (canonical !== node.factionId) {
        node.factionId = canonical
        stats.factionNormalizedCount++
      }
    }
  }

  // Step 2: Deduplicate by ID — first occurrence wins, merge keywords
  const nodeMap = new Map<string, Node>()
  const extraKeywords = new Map<string, Set<string>>()

  for (const node of allNodes) {
    if (nodeMap.has(node.id)) {
      stats.mergedByIdCount++
      // Merge keywords from duplicate into the primary
      const kwSet = extraKeywords.get(node.id) ?? new Set()
      for (const kw of node.keywords) kwSet.add(kw)
      extraKeywords.set(node.id, kwSet)
    } else {
      nodeMap.set(node.id, node)
    }
  }

  // Apply merged keywords
  for (const [id, kwSet] of extraKeywords) {
    const node = nodeMap.get(id)!
    const existing = new Set(node.keywords)
    for (const kw of kwSet) {
      if (!existing.has(kw)) node.keywords.push(kw)
    }
  }

  // Step 3: Build title → datasheet lookup for collision detection
  const datasheetTitles = new Set<string>()
  for (const node of nodeMap.values()) {
    if (node.category === 'datasheet') {
      datasheetTitles.add(node.title.toLowerCase())
    }
  }

  // Step 4: Enrich summaries
  for (const node of nodeMap.values()) {
    // 4a: Datasheets — prepend faction name if not already present
    if (node.category === 'datasheet' && node.factionId) {
      const factionLabel = node.factionId.split('-').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')
      if (!node.summary.toLowerCase().includes(factionLabel.toLowerCase())) {
        node.summary = `${factionLabel}: ${node.summary}`
        stats.summaryTagged++
      }
    }

    // 4b: Non-datasheets with title matching a datasheet — tag as rule
    if (node.category !== 'datasheet' && datasheetTitles.has(node.title.toLowerCase())) {
      if (!node.summary.toLowerCase().includes('faction rule') && !node.summary.toLowerCase().includes('ability rule')) {
        const tag = node.category === 'faction-ability' ? 'faction rule'
          : node.category === 'enhancement' ? 'enhancement rule'
          : node.category === 'unit-ability' ? 'ability rule'
          : 'rule'
        node.summary = `${node.summary} (${tag})`
        stats.summaryTagged++
      }
    }
  }

  const nodes = [...nodeMap.values()]
  stats.outputNodes = nodes.length

  // Step 5: Deduplicate refs
  const nodeIdSet = new Set(nodes.map(n => n.id))
  const refKeySet = new Set<string>()
  const dedupedRefs: NodeRef[] = []

  for (const ref of allRefs) {
    // Drop refs where either endpoint doesn't exist
    if (!nodeIdSet.has(ref.sourceId) || !nodeIdSet.has(ref.targetId)) continue

    const key = `${ref.sourceId}|${ref.targetId}|${ref.rel}`
    if (refKeySet.has(key)) {
      stats.refsDeduped++
      continue
    }
    refKeySet.add(key)
    dedupedRefs.push(ref)
  }

  return { nodes, refs: dedupedRefs, stats }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run src/lib/merge-sources.test.ts`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/merge-sources.ts apps/brain/server/src/lib/merge-sources.test.ts
git commit -m "feat(brain): add cross-source merge module for BSData/Wahapedia dedup"
```

---

### Task 3: Integrate merge into both build paths

Wire the merge step into both build pipelines (CLI and Worker) between "all nodes collected" and "partition and write."

**Files:**
- Modify: `apps/brain/server/src/build-graph.ts:126-141` (replace manual dedup with mergeSources call)
- Modify: `apps/brain/server/src/lib/sync.ts:168-178` (add mergeSources call in runBrainSync before partition)

- [ ] **Step 1: Update build-graph.ts**

Replace the current dedup block (lines 126-141):
```typescript
// Before:
const seenNodeIds = new Set<string>()
const dedupedNodes: Node[] = []
// ... manual dedup ...

// After:
import { mergeSources } from './lib/merge-sources'

const mergeResult = mergeSources(allNodes, allRefs)
console.log(`   Merged: ${mergeResult.stats.inputNodes} → ${mergeResult.stats.outputNodes} nodes`)
console.log(`   ${mergeResult.stats.mergedByIdCount} deduped, ${mergeResult.stats.factionNormalizedCount} factions normalized`)
console.log(`   ${mergeResult.stats.summaryTagged} summaries tagged, ${mergeResult.stats.refsDeduped} refs deduped`)

allNodes.length = 0
allNodes.push(...mergeResult.nodes)
allRefs.length = 0
allRefs.push(...mergeResult.refs)
```

- [ ] **Step 2: Update runBrainSync in sync.ts**

In `sync.ts`, after the game data conversion block (~line 178) and before the partition step (~line 181), add:

```typescript
import { mergeSources } from './merge-sources'

// Merge and deduplicate nodes from all sources
const mergeResult = mergeSources(allNodes, allRefs)
allNodes.length = 0
allNodes.push(...mergeResult.nodes)
allRefs.length = 0
allRefs.push(...mergeResult.refs)
```

- [ ] **Step 3: Run the build and compare output**

```bash
cd apps/brain/server && npx tsx src/build-graph.ts
```

Expected:
- Total node count drops significantly (from ~14,581 to ~9,000-10,000)
- Only canonical faction files emitted (no `faction-SM.json`, `faction-CSM.json`, etc.)
- Query tests still pass

- [ ] **Step 4: Run all server tests**

Run: `npx vitest run --passWithNoTests`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/build-graph.ts apps/brain/server/src/lib/sync.ts
git commit -m "feat(brain): integrate cross-source merge into both build paths"
```

---

### Task 4: Full pipeline test — build, upload, index, validate

Run the complete pipeline with the merge changes and validate search quality.

**Files:** No code changes — this is a validation task.

- [ ] **Step 1: Build the merged graph**

```bash
cd apps/brain/server && npx tsx src/build-graph.ts
```

Verify:
- No `faction-SM.json`, `faction-CSM.json`, etc. in output
- Only canonical faction files
- Node count is ~9,000-10,000 (down from ~14,581)
- Query tests pass

- [ ] **Step 2: Upload to R2**

```bash
CLOUDFLARE_API_TOKEN=... npx tsx src/upload-graph.ts
```

- [ ] **Step 3: Deploy Worker**

```bash
rm -f tsconfig.tsbuildinfo
CLOUDFLARE_API_TOKEN=... npx wrangler deploy --var BUILD_VERSION:"$(date +%Y%m%d-%H%M%S)"
```

- [ ] **Step 4: Re-index ALL vectors**

```bash
# Index core files
for file in nodes/core.json nodes/errata.json nodes/balance.json nodes/community.json; do
  curl -s -X POST "https://tabletop-tools-brain.micah-ec2.workers.dev/index-vectors?file=$file" \
    -H "Authorization: Bearer brain-sync-secret-2026"
done

# Index all canonical faction files
for faction in adepta-sororitas adeptus-custodes adeptus-mechanicus adeptus-titanicus aeldari astra-militarum chaos-daemons chaos-knights chaos-space-marines death-guard drukhari emperors-children genestealer-cults grey-knights imperial-agents imperial-knights leagues-of-votann necrons orks space-marines t-au-empire thousand-sons tyranids world-eaters unaligned; do
  curl -s -X POST "https://tabletop-tools-brain.micah-ec2.workers.dev/index-vectors?file=nodes/faction-${faction}.json" \
    -H "Authorization: Bearer brain-sync-secret-2026"
done
```

- [ ] **Step 5: Run search validation tests**

```bash
API_BASE=https://tabletop-tools-brain.micah-ec2.workers.dev npx vitest run src/search-validation.test.ts
```

Success criteria: **>99% pass rate on canonical factions** (up from 98%)

- [ ] **Step 6: Build and deploy client + gateway**

```bash
cd apps/brain/client && rm -f tsconfig.tsbuildinfo && rm -rf node_modules/.vite && BUILD_VERSION="$(date +%Y%m%d-%H%M%S)" npx vite build
cd apps/gateway && rm -rf dist && bash build.sh
CLOUDFLARE_API_TOKEN=... npx wrangler pages deploy dist --project-name tabletop-tools --commit-dirty=true
```

- [ ] **Step 7: Commit all changes**

```bash
git add -A
git commit -m "feat(brain): cross-source merge — eliminate BSData/Wahapedia duplicates"
```

---

## Success Criteria

1. **Zero duplicate faction files** — only 25 canonical faction files, no short-code files
2. **Node count reduction** — ~30-40% fewer nodes (eliminates duplicates)
3. **Search validation** — >99% pass rate on canonical factions (up from 98%)
4. **No regressions** — all 323+ server unit tests pass, all 234 client tests pass
5. **Enriched embeddings** — every datasheet summary includes its faction name
6. **Tagged collisions** — faction-ability nodes with datasheet-matching titles tagged with "(faction rule)" in summary
