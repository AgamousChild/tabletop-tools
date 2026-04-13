# Brain Unified Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify brain Search/Ask/Graph behind one shared retrieval function. Fix subfaction filtering. Replace Cytoscape with react-force-graph. Fix Browse tab. Clean up result presentation.

**Architecture:** Extract worker.ts monolith into focused modules (faction-detect, fetch-nodes, retrieve, format, strip-flavor). All endpoints call one `retrieve()` function. Client gets numbered results sorted by faction, faction filter banner, react-force-graph visualizer.

**Tech Stack:** TypeScript, Hono (Cloudflare Worker), Vectorize, R2, Workers AI, React, react-force-graph-2d, Vitest

**Spec:** `docs/superpowers/specs/2026-04-12-brain-unified-retrieval-design.md`

**Test commands:**
- Server: `cd apps/brain/server && pnpm test`
- Client: `cd apps/brain/client && pnpm test`

---

## File Map

### Server — Create

| File | Responsibility |
|---|---|
| `apps/brain/server/src/lib/faction-detect.ts` | Faction/subfaction detection, query stripping, mechanic aliases |
| `apps/brain/server/src/lib/faction-detect.test.ts` | Tests for above |
| `apps/brain/server/src/lib/strip-flavor.ts` | Flavor text stripping (extracted from worker.ts) |
| `apps/brain/server/src/lib/strip-flavor.test.ts` | Tests for above |
| `apps/brain/server/src/lib/fetch-nodes.ts` | R2 node fetching, graph traversal, manifest caching |
| `apps/brain/server/src/lib/fetch-nodes.test.ts` | Tests for above |
| `apps/brain/server/src/lib/format.ts` | Conversational formatter, LLM context assembler |
| `apps/brain/server/src/lib/format.test.ts` | Tests for above |
| `apps/brain/server/src/lib/retrieve.ts` | Unified retrieval function + types |
| `apps/brain/server/src/lib/retrieve.test.ts` | Tests for above |

### Server — Modify

| File | Change |
|---|---|
| `apps/brain/server/src/worker.ts` | Gut to thin route handlers that call `retrieve()` + formatters. Add `/graph-data` endpoint. |

### Client — Create

| File | Responsibility |
|---|---|
| `apps/brain/client/src/components/ResultCard.tsx` | Numbered result card component |
| `apps/brain/client/src/components/ResultCard.test.tsx` | Tests for above |
| `apps/brain/client/src/components/FactionBanner.tsx` | Faction filter banner component |
| `apps/brain/client/src/components/FactionBanner.test.tsx` | Tests for above |
| `apps/brain/client/src/components/ForceGraph.tsx` | react-force-graph wrapper (replaces GraphView) |
| `apps/brain/client/src/components/ForceGraph.test.tsx` | Tests for above |

### Client — Modify

| File | Change |
|---|---|
| `apps/brain/client/src/pages/BrainScreen.tsx` | Update tabs (4 tabs), Ask/Search use ResultCard + FactionBanner, new response types |
| `apps/brain/client/src/pages/BrainScreen.test.tsx` | Update for new tabs, components, response shapes |
| `apps/brain/client/package.json` | Add react-force-graph-2d, remove cytoscape |

### Client — Delete

| File | Reason |
|---|---|
| `apps/brain/client/src/components/GraphView.tsx` | Replaced by ForceGraph.tsx |

---

## Task 1: Extract faction-detect module

**Files:**
- Create: `apps/brain/server/src/lib/faction-detect.ts`
- Create: `apps/brain/server/src/lib/faction-detect.test.ts`

- [ ] **Step 1: Write failing tests for faction detection**

```typescript
// apps/brain/server/src/lib/faction-detect.test.ts
import { describe, it, expect } from 'vitest'
import {
  detectFactions,
  stripFactionFromQuery,
  extractMechanicKeywords,
  FACTION_PATTERNS,
} from './faction-detect'

describe('detectFactions', () => {
  it('detects single faction', () => {
    const result = detectFactions('who has sustained hits in necrons')
    expect(result.factions).toEqual(['necrons'])
    expect(result.subfaction).toBeUndefined()
  })

  it('detects SM chapter as subfaction', () => {
    const result = detectFactions('blood angels sustained hits')
    expect(result.factions).toEqual(['space-marines'])
    expect(result.subfaction).toBe('blood angels')
  })

  it('detects multiple factions', () => {
    const result = detectFactions('necrons vs orks who is better')
    expect(result.factions).toContain('necrons')
    expect(result.factions).toContain('orks')
  })

  it('returns empty for no faction', () => {
    const result = detectFactions('how does wound roll work')
    expect(result.factions).toEqual([])
    expect(result.subfaction).toBeUndefined()
  })

  it('handles chaos space marines vs space marines', () => {
    const result = detectFactions('chaos space marine stratagems')
    expect(result.factions).toEqual(['chaos-space-marines'])
  })

  it('detects tau with apostrophe', () => {
    const result = detectFactions("t'au empire weapons")
    expect(result.factions).toEqual(['t-au-empire'])
  })

  it('detects chaos daemon subfaction — plague legions', () => {
    const result = detectFactions('plague legions stratagems')
    expect(result.factions).toContain('chaos-daemons')
    expect(result.subfaction).toBe('plague legions')
  })

  it('detects aeldari subfaction — ynnari', () => {
    const result = detectFactions('ynnari abilities')
    expect(result.factions).toContain('aeldari')
    expect(result.subfaction).toBe('ynnari')
  })

  it('detects aeldari subfaction — harlequins', () => {
    const result = detectFactions('harlequins weapons')
    expect(result.factions).toContain('aeldari')
    expect(result.subfaction).toBe('harlequins')
  })
})

describe('stripFactionFromQuery', () => {
  it('strips detected faction from query', () => {
    expect(stripFactionFromQuery('in blood angels who has sustained hits', ['space-marines']))
      .toBe('who has sustained hits')
  })

  it('strips multiple factions', () => {
    expect(stripFactionFromQuery('necrons vs orks', ['necrons', 'orks']))
      .toBe('vs')
  })

  it('returns original if no match', () => {
    expect(stripFactionFromQuery('how does wound roll work', []))
      .toBe('how does wound roll work')
  })
})

describe('extractMechanicKeywords', () => {
  it('extracts known mechanics', () => {
    expect(extractMechanicKeywords('who has sustained hits'))
      .toContain('sustained hits')
  })

  it('expands aliases', () => {
    expect(extractMechanicKeywords('units with fnp'))
      .toContain('feel no pain')
  })

  it('expands dev wounds alias', () => {
    expect(extractMechanicKeywords('who has dev wounds'))
      .toContain('devastating wounds')
  })

  it('returns empty for no mechanics', () => {
    expect(extractMechanicKeywords('tell me about captains'))
      .toEqual([])
  })
})

describe('FACTION_PATTERNS', () => {
  it('has at least 25 entries', () => {
    expect(FACTION_PATTERNS.length).toBeGreaterThanOrEqual(25)
  })

  it('has chaos space marines before space marines', () => {
    const csmIdx = FACTION_PATTERNS.findIndex(p => p.slug === 'chaos-space-marines')
    const smIdx = FACTION_PATTERNS.findIndex(p => p.slug === 'space-marines')
    expect(csmIdx).toBeLessThan(smIdx)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/faction-detect.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement faction-detect.ts**

Extract `FACTION_PATTERNS`, `detectFactionFromQuestion`, `detectAllFactions`, `stripFactionFromQuery`, `MECHANIC_ALIASES`, and `extractMechanicKeywords` from `worker.ts` into `faction-detect.ts`. Consolidate the two detection functions into one `detectFactions()`. Use the full 30-faction `FACTION_PATTERNS` list for stripping too (the current `stripFactionFromQuery` only covers ~10).

Key: `FACTION_PATTERNS` must have `chaos space marine` before `space marine` — otherwise "chaos space marines" matches "space marines" first.

Add `SUBFACTION_KEYWORDS` from `game-data.ts` (Blood Angels, Dark Angels, Space Wolves, etc.) and detect subfactions from those.

```typescript
// apps/brain/server/src/lib/faction-detect.ts
export interface FactionPattern {
  pattern: string
  slug: string
}

export const FACTION_PATTERNS: FactionPattern[] = [
  // Longer patterns first to avoid partial matches
  { pattern: 'chaos space marine', slug: 'chaos-space-marines' },
  { pattern: 'space marine', slug: 'space-marines' },
  { pattern: 'blood angel', slug: 'blood-angels' },
  { pattern: 'dark angel', slug: 'dark-angels' },
  { pattern: 'space wolf', slug: 'space-wolves' },
  { pattern: 'space wolves', slug: 'space-wolves' },
  { pattern: 'black templar', slug: 'black-templars' },
  { pattern: 'grey knight', slug: 'grey-knights' },
  { pattern: 'death guard', slug: 'death-guard' },
  { pattern: 'thousand sons', slug: 'thousand-sons' },
  { pattern: 'world eater', slug: 'world-eaters' },
  { pattern: 'imperial agent', slug: 'imperial-agents' },
  { pattern: 'imperial knight', slug: 'imperial-knights' },
  { pattern: 'chaos knight', slug: 'chaos-knights' },
  { pattern: 'imperial guard', slug: 'astra-militarum' },
  { pattern: 'astra militarum', slug: 'astra-militarum' },
  { pattern: 'sisters of battle', slug: 'adepta-sororitas' },
  { pattern: 'dark eldar', slug: 'drukhari' },
  { pattern: 'ork', slug: 'orks' },
  { pattern: 'necron', slug: 'necrons' },
  { pattern: 'tyranid', slug: 'tyranids' },
  { pattern: 'aeldari', slug: 'aeldari' },
  { pattern: 'eldar', slug: 'aeldari' },
  { pattern: "t'au", slug: 't-au-empire' },
  { pattern: 'tau', slug: 't-au-empire' },
  { pattern: 'custodes', slug: 'adeptus-custodes' },
  { pattern: 'sororitas', slug: 'adepta-sororitas' },
  { pattern: 'mechanicus', slug: 'adeptus-mechanicus' },
  { pattern: 'genestealer', slug: 'genestealer-cults' },
  { pattern: 'drukhari', slug: 'drukhari' },
  { pattern: 'votann', slug: 'leagues-of-votann' },
  { pattern: 'deathwatch', slug: 'deathwatch' },
  { pattern: 'daemon', slug: 'chaos-daemons' },
]

// All subfactions — maps subfaction name → parent faction slug
// Includes SM chapters, Chaos daemon legions, Aeldari subfactions, etc.
// Source: SUBFACTION_KEYWORDS in game-data.ts
const SUBFACTION_TO_PARENT: Record<string, string> = {
  // SM chapters
  'blood angels': 'space-marines',
  'dark angels': 'space-marines',
  'space wolves': 'space-marines',
  'black templars': 'space-marines',
  'deathwatch': 'space-marines',
  'iron hands': 'space-marines',
  'ultramarines': 'space-marines',
  'salamanders': 'space-marines',
  'raven guard': 'space-marines',
  'imperial fists': 'space-marines',
  'white scars': 'space-marines',
  'crimson fists': 'space-marines',
  'blood ravens': 'space-marines',
  // Aeldari subfactions
  'ynnari': 'aeldari',
  'harlequins': 'aeldari',
  'asuryani': 'aeldari',
  // Chaos daemon legions
  'plague legions': 'chaos-daemons',
  'scintillating legions': 'chaos-daemons',
  'legions of excess': 'chaos-daemons',
  'blood legions': 'chaos-daemons',
  // CSM
  'damned': 'chaos-space-marines',
}

export interface FactionDetection {
  factions: string[]       // faction slugs (e.g. ['space-marines'])
  subfaction?: string      // chapter/legion name (e.g. 'blood angels')
}

export function detectFactions(query: string): FactionDetection {
  const lower = query.toLowerCase()
  const found = new Set<string>()
  let subfaction: string | undefined

  // Check for subfactions first (chapters, legions, craftworlds)
  // These map to parent factions and set the subfaction field
  for (const [name, parentSlug] of Object.entries(SUBFACTION_TO_PARENT)) {
    if (lower.includes(name)) {
      found.add(parentSlug)
      if (!subfaction) subfaction = name
      break
    }
  }

  // Then check faction patterns
  for (const { pattern, slug } of FACTION_PATTERNS) {
    if (lower.includes(pattern)) {
      if (found.has(slug)) continue
      // Check if this slug's display name is a known subfaction
      const displayName = slug.replace(/-/g, ' ')
      if (SUBFACTION_TO_PARENT[displayName]) {
        found.add(SUBFACTION_TO_PARENT[displayName]!)
        if (!subfaction) subfaction = displayName
      } else {
        found.add(slug)
      }
    }
  }

  return { factions: [...found], subfaction }
}

export function stripFactionFromQuery(query: string, detectedFactions: string[]): string {
  if (detectedFactions.length === 0) return query

  let result = query

  // Strip subfaction names (chapters, legions, craftworlds)
  for (const name of Object.keys(SUBFACTION_TO_PARENT)) {
    if (result.toLowerCase().includes(name)) {
      result = result.replace(new RegExp(`in\\s+${name}s?`, 'gi'), '')
      result = result.replace(new RegExp(name + 's?', 'gi'), '')
    }
  }

  // Strip faction patterns
  for (const { pattern, slug } of FACTION_PATTERNS) {
    if (detectedFactions.includes(slug) && result.toLowerCase().includes(pattern)) {
      result = result.replace(new RegExp(`in\\s+${pattern}s?`, 'gi'), '')
      result = result.replace(new RegExp(pattern + 's?', 'gi'), '')
    }
  }

  return result.replace(/[\s,]+/g, ' ').trim()
}

export interface MechanicAlias {
  alias: string
  canonical: string
}

export const MECHANIC_ALIASES: MechanicAlias[] = [
  { alias: 'dev wounds', canonical: 'devastating wounds' },
  { alias: 'devs', canonical: 'devastating wounds' },
  { alias: 'sus hits', canonical: 'sustained hits' },
  { alias: 'exploding 6s', canonical: 'sustained hits' },
  { alias: 'exploding 6', canonical: 'sustained hits' },
  { alias: 'critical hit', canonical: 'sustained hits' },
  { alias: 'crit', canonical: 'sustained hits' },
  { alias: 'auto wound', canonical: 'lethal hits' },
  { alias: 'auto-wound', canonical: 'lethal hits' },
  { alias: 'fnp', canonical: 'feel no pain' },
  { alias: 'mortal', canonical: 'mortal wound' },
  { alias: 'mortals', canonical: 'mortal wound' },
  { alias: 'ap', canonical: 'armour penetration' },
  { alias: 'invuln', canonical: 'invulnerable' },
  { alias: 'obs sec', canonical: 'objective control' },
  { alias: 'ob sec', canonical: 'objective control' },
  { alias: 'obsec', canonical: 'objective control' },
]

const MECHANICS = [
  'sustained hits', 'lethal hits', 'devastating wounds', 'hazardous',
  'blast', 'torrent', 'twin-linked', 'rapid fire', 'pistol', 'melta',
  'lance', 'anti-', 'ignores cover', 'indirect fire',
  'feel no pain', 'deadly demise', 'deep strike', 'lone operative',
  'stealth', 'scouts', 'infiltrators', 'battle-shock', 'fights first',
  'overwatch', 'wound roll', 'hit roll', 'saving throw',
  'engagement range', 'coherency', 'visibility', 'cover',
  'advance', 'fall back', 'charge', 'mortal wound',
  'invulnerable', 'firing deck', 'transport', 'objective control',
  'armour penetration',
]

export function extractMechanicKeywords(query: string): string[] {
  let expanded = query.toLowerCase()
  for (const { alias, canonical } of MECHANIC_ALIASES) {
    if (expanded.includes(alias)) {
      expanded = expanded.replace(alias, canonical)
    }
  }
  return MECHANICS.filter(m => expanded.includes(m))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/faction-detect.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/faction-detect.ts apps/brain/server/src/lib/faction-detect.test.ts
git commit -m "feat(brain): extract faction-detect module from worker.ts"
```

---

## Task 2: Extract strip-flavor module

**Files:**
- Create: `apps/brain/server/src/lib/strip-flavor.ts`
- Create: `apps/brain/server/src/lib/strip-flavor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/brain/server/src/lib/strip-flavor.test.ts
import { describe, it, expect } from 'vitest'
import { stripFlavorText } from './strip-flavor'

describe('stripFlavorText', () => {
  it('keeps lines with game mechanic keywords', () => {
    const text = 'This unit has 3+ save.\nThe Emperor protects.'
    const result = stripFlavorText(text)
    expect(result).toContain('3+ save')
  })

  it('removes long italic blocks (lore)', () => {
    const text = '*In the grim darkness of the far future there is only war and suffering across the galaxy.*\n**WHEN:** Your shooting phase.'
    const result = stripFlavorText(text)
    expect(result).toContain('**WHEN:**')
    expect(result).not.toContain('grim darkness')
  })

  it('keeps stratagem structure lines', () => {
    const text = '**WHEN:** Your shooting phase\n**TARGET:** One unit\n**EFFECT:** Re-roll wound rolls of 1'
    const result = stripFlavorText(text)
    expect(result).toContain('WHEN')
    expect(result).toContain('TARGET')
    expect(result).toContain('EFFECT')
  })

  it('keeps weapon ability keywords', () => {
    const text = '[SUSTAINED HITS 1] [LETHAL HITS]\nA weapon of terrible power.'
    const result = stripFlavorText(text)
    expect(result).toContain('SUSTAINED')
  })

  it('handles empty string', () => {
    expect(stripFlavorText('')).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/strip-flavor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement strip-flavor.ts**

Copy `stripFlavorText` from `worker.ts` lines 868-889 unchanged.

```typescript
// apps/brain/server/src/lib/strip-flavor.ts
export function stripFlavorText(text: string): string {
  return text
    .replace(/\*[^*]{20,}\*/g, '')
    .split('\n')
    .filter(line => {
      const l = line.trim()
      if (!l) return false
      if (/\*\*(WHEN|TARGET|EFFECT|Type|CP|Turn|Phase|Cost|Range|Role|Keywords|Composition|Points|Transport|Loadout|Damaged):/i.test(l)) return true
      if (/\[SUSTAINED|LETHAL|DEVASTATING|HAZARDOUS|BLAST|TORRENT|MELTA|LANCE|ANTI-|IGNORES|INDIRECT|TWIN|RAPID|PISTOL|HEAVY|ASSAULT|ONE SHOT/i.test(l)) return true
      if (/\d\+|D\d|re-roll|wound|hit|save|attack|model|unit|phase|turn|Engagement Range|Battle-shock/i.test(l)) return true
      if (/Detachment Ability:|Ability:|Enhancement:/i.test(l)) return true
      if (l.length > 80 && !/\d/.test(l) && !/\[/.test(l)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n')
    .trim()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/strip-flavor.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/strip-flavor.ts apps/brain/server/src/lib/strip-flavor.test.ts
git commit -m "feat(brain): extract strip-flavor module from worker.ts"
```

---

## Task 3: Extract fetch-nodes module

**Files:**
- Create: `apps/brain/server/src/lib/fetch-nodes.ts`
- Create: `apps/brain/server/src/lib/fetch-nodes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/brain/server/src/lib/fetch-nodes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchNodesFromR2, fetchConnectedNodes, resetManifestCache } from './fetch-nodes'
import type { Node } from './model'

// Minimal R2Bucket mock
function createMockBucket(files: Record<string, unknown>): any {
  return {
    get: vi.fn(async (key: string) => {
      const data = files[key]
      if (!data) return null
      return {
        json: async () => data,
        text: async () => JSON.stringify(data),
      }
    }),
  }
}

const testNode: Node = {
  id: 'core:wound-roll',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Wound Roll',
  content: 'Compare S to T.',
  summary: 'How wound rolls work.',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01' }],
  refs: [],
  version: 1,
  keywords: ['wound', 'roll'],
}

const smNode: Node = {
  ...testNode,
  id: 'ability:ds1:oath-of-moment',
  layer: 'unit',
  category: 'unit-ability',
  title: 'Oath of Moment',
  factionId: 'space-marines',
  subfaction: 'blood angels',
}

const swNode: Node = {
  ...testNode,
  id: 'ability:ds2:saga-of-the-beast',
  layer: 'unit',
  category: 'unit-ability',
  title: 'Saga of the Beast',
  factionId: 'space-marines',
  subfaction: 'space wolves',
}

describe('fetchNodesFromR2', () => {
  beforeEach(() => {
    resetManifestCache() // Reset module-scope cache between tests
  })

  it('fetches nodes by ID from R2', async () => {
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/core.json': 'hash1' } },
      'nodes/core.json': [testNode],
    })
    const result = await fetchNodesFromR2(bucket, ['core:wound-roll'])
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('core:wound-roll')
  })

  it('returns empty array for missing manifest', async () => {
    const bucket = createMockBucket({})
    const result = await fetchNodesFromR2(bucket, ['core:wound-roll'])
    expect(result).toEqual([])
  })

  it('caches manifest across calls', async () => {
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/core.json': 'hash1' } },
      'nodes/core.json': [testNode],
    })
    await fetchNodesFromR2(bucket, ['core:wound-roll'])
    await fetchNodesFromR2(bucket, ['core:wound-roll'])
    // manifest.json fetched once (first call), not twice
    const manifestCalls = bucket.get.mock.calls.filter((c: any) => c[0] === 'manifest.json')
    expect(manifestCalls.length).toBe(1)
  })
})

describe('fetchConnectedNodes', () => {
  beforeEach(() => {
    resetManifestCache()
  })

  it('filters connected nodes by subfaction', async () => {
    const reverseIndex = {
      'core:sustained-hits': [
        { sourceId: 'ability:ds1:oath-of-moment', rel: 'requires', context: 'test', factionId: 'space-marines' },
        { sourceId: 'ability:ds2:saga-of-the-beast', rel: 'requires', context: 'test', factionId: 'space-marines' },
      ],
    }
    const forwardIndex = {
      'ability:ds1:oath-of-moment': [{ targetId: 'ds1', rel: 'part_of', context: 'test' }],
      'ability:ds2:saga-of-the-beast': [{ targetId: 'ds2', rel: 'part_of', context: 'test' }],
    }
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/faction-space-marines.json': 'h' } },
      'refs/reverse-index.json': reverseIndex,
      'refs/forward-index.json': forwardIndex,
      'nodes/faction-space-marines.json': [smNode, swNode],
    })

    const result = await fetchConnectedNodes(
      bucket,
      ['core:sustained-hits'],
      1,
      { factionId: 'space-marines', subfaction: 'blood angels' },
    )

    // Positive: BA node is included
    const titles = result.nodes.map(n => n.title)
    expect(result.nodes.length).toBeGreaterThan(0) // guard against vacuous pass
    expect(titles).toContain('Oath of Moment')
    // Negative: SW node is excluded
    expect(titles).not.toContain('Saga of the Beast')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/fetch-nodes.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement fetch-nodes.ts**

Extract `fetchNodesFromR2` and `fetchConnectedNodes` from `worker.ts` (lines 606-764). Add module-scope manifest cache. Add faction/subfaction filtering to `fetchConnectedNodes`.

The key changes from the current code:
1. `cachedManifest` at module scope — only fetched once per Worker isolate
2. Export `resetManifestCache()` for testing — sets `cachedManifest = null`
3. `fetchConnectedNodes` accepts `factionFilter?: { factionId?: string; subfaction?: string }` and filters connected nodes by subfaction metadata (not title/summary text matching)
4. Priority sort logic preserved exactly as-is

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/fetch-nodes.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/fetch-nodes.ts apps/brain/server/src/lib/fetch-nodes.test.ts
git commit -m "feat(brain): extract fetch-nodes module with manifest caching and subfaction filter"
```

---

## Task 4: Extract format module

**Files:**
- Create: `apps/brain/server/src/lib/format.ts`
- Create: `apps/brain/server/src/lib/format.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/brain/server/src/lib/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatConversationalAnswer, assembleContext } from './format'
import type { Node } from './model'

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'test:node',
  layer: 'unit',
  category: 'unit-ability',
  title: 'Test Ability',
  content: 'Test content.',
  summary: 'Test summary.',
  sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
  refs: [],
  version: 1,
  keywords: [],
  ...overrides,
})

describe('formatConversationalAnswer', () => {
  it('outputs prose, not bullet lists', () => {
    const nodes = [
      makeNode({ id: 'a', category: 'faction-ability', title: 'Oath of Moment', content: 'Re-roll hits.' }),
      makeNode({ id: 'b', category: 'weapon', title: 'Bolt Rifle', content: 'S4 AP-1 D1.' }),
    ]
    const result = formatConversationalAnswer('who has rerolls', nodes, new Map())
    // Should not start lines with "- **" (bullet format)
    expect(result).not.toMatch(/^- \*\*/m)
    // Should contain a Reference section
    expect(result).toContain('Reference')
  })

  it('groups by impact tier — faction abilities before weapons', () => {
    const nodes = [
      makeNode({ id: 'w', category: 'weapon', title: 'Bolt Rifle' }),
      makeNode({ id: 'f', category: 'faction-ability', title: 'Oath of Moment' }),
    ]
    const result = formatConversationalAnswer('test', nodes, new Map())
    const factionPos = result.indexOf('Oath of Moment')
    const weaponPos = result.indexOf('Bolt Rifle')
    expect(factionPos).toBeLessThan(weaponPos)
  })

  it('generates readable prose with sentences', () => {
    const nodes = [
      makeNode({ id: 'a', category: 'faction-ability', title: 'Oath of Moment', content: 'Re-roll one hit roll and one wound roll per turn.' }),
      makeNode({ id: 'b', category: 'unit-ability', title: 'Rites of Battle', content: 'While this model is leading a unit, add 1 to hit rolls.' }),
    ]
    const result = formatConversationalAnswer('who has rerolls', nodes, new Map())
    // Should contain actual sentences (period-terminated)
    expect(result).toMatch(/\.\s/)
    // Should NOT be a raw list of entries
    expect(result.split('\n').filter(l => l.startsWith('- ')).length).toBeLessThan(3)
  })

  it('includes parent unit for weapons/abilities', () => {
    const nodes = [makeNode({ id: 'w', category: 'weapon', title: 'Bolt Rifle' })]
    const parentMap = new Map([['w', 'Intercessor Squad']])
    const result = formatConversationalAnswer('test', nodes, parentMap)
    expect(result).toContain('Intercessor Squad')
  })
})

describe('assembleContext', () => {
  it('puts primary nodes before connected nodes', () => {
    const primary = [makeNode({ id: 'p', title: 'Primary Node' })]
    const connected = [makeNode({ id: 'c', title: 'Connected Node' })]
    const result = assembleContext(primary, connected, new Map())
    expect(result.indexOf('Primary Node')).toBeLessThan(result.indexOf('Connected Node'))
  })

  it('includes source attribution', () => {
    const nodes = [makeNode({ sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01' }] })]
    const result = assembleContext(nodes, [], new Map())
    expect(result).toContain('Core Rules')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/format.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement format.ts**

Extract `assembleContext` and `formatDeterministicAnswer` from `worker.ts`. Rewrite `formatDeterministicAnswer` as `formatConversationalAnswer` — outputs prose paragraphs grouped by impact tier, with a `## Reference` section at the bottom containing the structured per-entry data.

Import `stripFlavorText` from `./strip-flavor`.

Key difference from current code: the conversational formatter writes short paragraphs per impact group ("Several army-wide abilities grant this mechanic. Oath of Moment (Space Marines) allows re-rolling hits...") instead of `- **Oath of Moment** — on **Captain**: re-roll hits`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/format.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/format.ts apps/brain/server/src/lib/format.test.ts
git commit -m "feat(brain): extract format module with conversational answer formatter"
```

---

## Task 5: Implement unified retrieve module

**Files:**
- Create: `apps/brain/server/src/lib/retrieve.ts`
- Create: `apps/brain/server/src/lib/retrieve.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for `retrieve()` need Vectorize and R2 mocks. Test the pipeline logic: faction detection feeds into query stripping, results are sorted faction-first, connected nodes are filtered.

```typescript
// apps/brain/server/src/lib/retrieve.test.ts
import { describe, it, expect, vi } from 'vitest'
import { retrieve, type RetrieveOptions, type EnrichedNode } from './retrieve'

// Mock Workers AI
function createMockAI() {
  return {
    run: vi.fn(async () => ({
      data: [[0.1, 0.2, 0.3]], // fake embedding
    })),
  }
}

// Mock Vectorize
function createMockVectorize(matches: Array<{ id: string; score: number; metadata: Record<string, string> }>) {
  return {
    query: vi.fn(async () => ({ matches })),
  }
}

// Mock R2 bucket
function createMockBucket(nodes: Record<string, any[]>) {
  const manifest = { files: Object.fromEntries(Object.keys(nodes).map(k => [k, 'hash'])) }
  return {
    get: vi.fn(async (key: string) => {
      if (key === 'manifest.json') return { json: async () => manifest }
      if (key === 'refs/reverse-index.json') return { json: async () => ({}) }
      if (key === 'refs/forward-index.json') return { json: async () => ({}) }
      const data = nodes[key]
      if (!data) return null
      return { json: async () => data, text: async () => JSON.stringify(data) }
    }),
  }
}

describe('retrieve', () => {
  it('detects faction from query and returns in detected field', async () => {
    const result = await retrieve(
      {
        query: 'blood angels sustained hits',
        limit: 5,
      },
      {
        ai: createMockAI() as any,
        vectorize: createMockVectorize([]) as any,
        bucket: createMockBucket({}) as any,
      },
    )
    expect(result.detected.factions).toContain('space-marines')
    expect(result.detected.subfaction).toBe('blood angels')
  })

  it('sorts faction-matched results before generic', async () => {
    const result = await retrieve(
      { query: 'necrons sustained hits', limit: 10 },
      {
        ai: createMockAI() as any,
        vectorize: createMockVectorize([
          { id: 'generic:1', score: 0.9, metadata: { title: 'Generic', summary: 'x', layer: 'core', category: 'core-mechanic', factionId: '', subfaction: '' } },
          { id: 'necron:1', score: 0.8, metadata: { title: 'Necron Thing', summary: 'x', layer: 'faction', category: 'stratagem', factionId: 'necrons', subfaction: '' } },
        ]) as any,
        bucket: createMockBucket({
          'nodes/core.json': [{ id: 'generic:1', layer: 'core', category: 'core-mechanic', title: 'Generic', content: 'x', summary: 'x', sources: [], refs: [], version: 1, keywords: [] }],
          'nodes/faction-necrons.json': [{ id: 'necron:1', layer: 'faction', category: 'stratagem', title: 'Necron Thing', content: 'x', summary: 'x', factionId: 'necrons', sources: [], refs: [], version: 1, keywords: [] }],
        }) as any,
      },
    )
    // Necron result should come first despite lower score
    expect(result.results[0]?.factionId).toBe('necrons')
  })

  it('strips faction from query for embedding', async () => {
    const ai = createMockAI()
    await retrieve(
      { query: 'in necrons who has sustained hits', limit: 5 },
      {
        ai: ai as any,
        vectorize: createMockVectorize([]) as any,
        bucket: createMockBucket({}) as any,
      },
    )
    // The text sent to AI for embedding should not contain "necrons"
    const embeddingCall = ai.run.mock.calls[0]
    const textArg = embeddingCall?.[1]?.text?.[0] ?? ''
    expect(textArg).not.toContain('necrons')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/retrieve.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement retrieve.ts**

This is the core module. It imports from `faction-detect`, `fetch-nodes`, and wires together the full pipeline described in the spec. Export `RetrieveOptions`, `RetrieveResult`, `EnrichedNode` types. The `retrieve()` function takes options + an env object `{ ai, vectorize, bucket }` so it's testable with mocks.

Key implementation details:
- `dualEmbedding: true` generates a second embedding from `extractMechanicKeywords()` results and merges/deduplicates Vectorize results
- Sort order: group results into three buckets (subfaction match, faction match, generic), sort each by score descending, concatenate
- After sorting, fetch full node content from R2 via `fetchNodesFromR2` and enrich with full fields
- If `includeConnected`, call `fetchConnectedNodes` with the faction filter derived from detection
- Resolve `parentUnit` from the parentMap for each EnrichedNode

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/brain/server && pnpm test -- --reporter verbose src/lib/retrieve.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/lib/retrieve.ts apps/brain/server/src/lib/retrieve.test.ts
git commit -m "feat(brain): implement unified retrieve module"
```

---

## Task 6: Rewrite worker.ts as thin route handlers

**Files:**
- Modify: `apps/brain/server/src/worker.ts`

- [ ] **Step 1: Run all existing server tests to establish baseline**

Run: `cd apps/brain/server && pnpm test`
Note the count — should be 143 tests passing.

- [ ] **Step 2: Rewrite worker.ts**

Replace the 980-line monolith with thin route handlers that import from the extracted modules:
- `/search` → calls `retrieve()` with `{ includeConnected: false, dualEmbedding: false }`, returns `{ detected, results }`
- `/ask` → calls `retrieve()` with `{ includeConnected: true, dualEmbedding: true }`, then runs LLM or conversational formatter, returns `{ detected, answer, reference, sources, connectedCount }`
- `/graph-data` → calls `retrieve()` with `{ includeConnected: false, dualEmbedding: false }`, then fetches edges from indexes server-side, returns `{ detected, nodes, edges }`
- `/manifest.json`, `/data/:path`, `/index-vectors`, `/sync` — unchanged (just served from R2)

Delete all helper functions that were extracted (they now live in the lib modules). Keep CORS middleware and data endpoints.

The LLM logic stays in worker.ts (it's route-specific, not retrieval logic): system prompt, Claude API call, Workers AI call, threshold check, fallback.

- [ ] **Step 3: Add test for `/graph-data` endpoint**

The `/graph-data` endpoint is new behavior (server-side edge resolution). Add a test to verify it returns `{ detected, nodes, edges }` and that edges only connect result nodes. This can be a simple test in a new file or added to an existing worker integration test if one exists. At minimum, test that the edge-building logic filters to only edges between returned node IDs.

- [ ] **Step 4: Run all server tests**

Run: `cd apps/brain/server && pnpm test`
Expected: All pass (existing parser/model/sync tests unchanged, new module tests pass, new graph-data test passes)

- [ ] **Step 5: Commit**

```bash
git add apps/brain/server/src/worker.ts
git commit -m "refactor(brain): rewrite worker.ts as thin route handlers using extracted modules"
```

---

## Task 7: Client — ResultCard and FactionBanner components

**Files:**
- Create: `apps/brain/client/src/components/ResultCard.tsx`
- Create: `apps/brain/client/src/components/ResultCard.test.tsx`
- Create: `apps/brain/client/src/components/FactionBanner.tsx`
- Create: `apps/brain/client/src/components/FactionBanner.test.tsx`

- [ ] **Step 1: Write failing tests for ResultCard**

```typescript
// apps/brain/client/src/components/ResultCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultCard } from './ResultCard'

describe('ResultCard', () => {
  const baseProps = {
    index: 1,
    title: 'Bolt Rifle',
    summary: 'A standard bolt weapon.',
    layer: 'unit',
    category: 'weapon',
    score: 0.85,
  }

  it('renders numbered result', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('Bolt Rifle')).toBeInTheDocument()
  })

  it('shows parent unit when provided', () => {
    render(<ResultCard {...baseProps} parentUnit="Intercessor Squad" />)
    expect(screen.getByText(/Intercessor Squad/)).toBeInTheDocument()
  })

  it('shows faction and subfaction tags', () => {
    render(<ResultCard {...baseProps} factionId="space-marines" subfaction="blood angels" />)
    expect(screen.getByText('space-marines')).toBeInTheDocument()
    expect(screen.getByText('blood angels')).toBeInTheDocument()
  })

  it('shows relevance score as percentage', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('85%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write failing tests for FactionBanner**

```typescript
// apps/brain/client/src/components/FactionBanner.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FactionBanner } from './FactionBanner'

describe('FactionBanner', () => {
  it('shows detected faction', () => {
    render(<FactionBanner factions={['necrons']} onDismiss={() => {}} />)
    expect(screen.getByText(/necrons/i)).toBeInTheDocument()
  })

  it('shows subfaction when present', () => {
    render(<FactionBanner factions={['space-marines']} subfaction="blood angels" onDismiss={() => {}} />)
    expect(screen.getByText(/blood angels/i)).toBeInTheDocument()
  })

  it('calls onDismiss when show all clicked', () => {
    const onDismiss = vi.fn()
    render(<FactionBanner factions={['necrons']} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText(/Show all/i))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('renders nothing when no factions detected', () => {
    const { container } = render(<FactionBanner factions={[]} onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/brain/client && pnpm test -- --reporter verbose src/components/ResultCard.test.tsx src/components/FactionBanner.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement ResultCard.tsx**

Numbered result card: `#N` indicator, title, parent unit line, tags (layer badge, category, faction, subfaction, phase), summary, score percentage.

- [ ] **Step 5: Implement FactionBanner.tsx**

Banner: "Filtered to {subfaction || factions.join(', ')} | [Show all results]". Returns null if factions is empty.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/brain/client && pnpm test -- --reporter verbose src/components/ResultCard.test.tsx src/components/FactionBanner.test.tsx`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add apps/brain/client/src/components/ResultCard.tsx apps/brain/client/src/components/ResultCard.test.tsx apps/brain/client/src/components/FactionBanner.tsx apps/brain/client/src/components/FactionBanner.test.tsx
git commit -m "feat(brain): add ResultCard and FactionBanner components"
```

---

## Task 8: Client — Replace Cytoscape with react-force-graph

**Files:**
- Delete: `apps/brain/client/src/components/GraphView.tsx`
- Create: `apps/brain/client/src/components/ForceGraph.tsx`
- Create: `apps/brain/client/src/components/ForceGraph.test.tsx`
- Modify: `apps/brain/client/package.json`

- [ ] **Step 1: Swap dependencies**

```bash
cd apps/brain/client && pnpm remove cytoscape && pnpm add react-force-graph-2d --no-frozen-lockfile
```

- [ ] **Step 2: Delete old GraphView.tsx**

```bash
rm apps/brain/client/src/components/GraphView.tsx
```

- [ ] **Step 3: Write failing tests for ForceGraph**

```typescript
// apps/brain/client/src/components/ForceGraph.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ForceGraph } from './ForceGraph'

// react-force-graph-2d uses canvas — mock it for jsdom
vi.mock('react-force-graph-2d', () => ({
  default: (props: any) => (
    <div data-testid="force-graph">
      {props.graphData?.nodes?.map((n: any) => (
        <div key={n.id} data-testid={`node-${n.id}`}>{n.label}</div>
      ))}
    </div>
  ),
}))

describe('ForceGraph', () => {
  it('renders search input', () => {
    render(<ForceGraph />)
    expect(screen.getByPlaceholderText(/Search to visualize/)).toBeInTheDocument()
  })

  it('renders visualize button', () => {
    render(<ForceGraph />)
    expect(screen.getByText('Visualize')).toBeInTheDocument()
  })

  it('shows legend', () => {
    render(<ForceGraph />)
    expect(screen.getByText('core')).toBeInTheDocument()
    expect(screen.getByText('faction')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/brain/client && pnpm test -- --reporter verbose src/components/ForceGraph.test.tsx`
Expected: FAIL

- [ ] **Step 5: Implement ForceGraph.tsx**

Search bar → calls `/graph-data` endpoint → feeds nodes/edges to `ForceGraph2D`. Node color by layer. Node size by score. Click opens side panel with node details. Dark theme background.

```typescript
// Key structure:
// - Search input + Visualize button
// - FactionBanner (uses detected from response)
// - ForceGraph2D with graphData = { nodes: [...], links: [...] }
// - Side panel for selected node details
```

The `LAYER_COLORS` map stays the same (amber, blue, green, red, purple, cyan). Pass `nodeColor`, `nodeRelSize`, `linkColor`, `backgroundColor` props to ForceGraph2D.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/brain/client && pnpm test -- --reporter verbose src/components/ForceGraph.test.tsx`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add apps/brain/client/src/components/ForceGraph.tsx apps/brain/client/src/components/ForceGraph.test.tsx apps/brain/client/package.json pnpm-lock.yaml
git rm apps/brain/client/src/components/GraphView.tsx
git commit -m "feat(brain): replace Cytoscape with react-force-graph-2d"
```

---

## Task 9: Update BrainScreen — wire everything together

**Files:**
- Modify: `apps/brain/client/src/pages/BrainScreen.tsx`
- Modify: `apps/brain/client/src/pages/BrainScreen.test.tsx`

- [ ] **Step 1: Update BrainScreen.tsx**

Changes:
1. Four tabs: Ask, Search, Browse, Graph
2. `SearchTab`: uses `ResultCard` for results, `FactionBanner` for detected factions, state for filter dismissal. Results sorted faction-first (done server-side, client preserves order). Auto-filter hides non-faction results when banner is active.
3. `AskTab`: updated `QAResponse` interface for new shape `{ detected, answer, reference, sources, connectedCount }`. Shows conversational answer via `renderMarkdown`. Below answer: "Reference" section with `ResultCard` list. `FactionBanner` above answer.
4. `GraphTab`: renders `ForceGraph` component
5. `BrowseTab`: check `getBrainMeta()` on mount. If no data, show sync prompt. If data, show layer nav with counts.

- [ ] **Step 2: Update BrainScreen.test.tsx**

```typescript
// Add/update tests:
// - Four tabs render (Ask, Search, Browse, Graph)
// - Graph tab shows ForceGraph component
// - Ask tab shows Reference section on response
// - Browse tab shows sync prompt when no data

// For Browse tab "no data" test, the existing test setup calls
// clearBrainData() in beforeEach, so getBrainMeta() will return null.
// Import getBrainMeta in BrainScreen.tsx from '../lib/store'.
// Test: click Browse tab → expect "Sync" or "No data" prompt text.
// Test: after saveNodes() in beforeEach, click Browse → expect layer nav with nodes.
```

- [ ] **Step 3: Run all client tests**

Run: `cd apps/brain/client && pnpm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add apps/brain/client/src/pages/BrainScreen.tsx apps/brain/client/src/pages/BrainScreen.test.tsx
git commit -m "feat(brain): wire up unified retrieval UI — four tabs, result cards, faction banner"
```

---

## Task 10: Full integration test

- [ ] **Step 1: Run all server tests**

Run: `cd apps/brain/server && pnpm test`
Expected: All pass

- [ ] **Step 2: Run all client tests**

Run: `cd apps/brain/client && pnpm test`
Expected: All pass

- [ ] **Step 3: Build both packages**

Run: `cd apps/brain/server && pnpm build && cd ../client && pnpm build`
Expected: Clean build, no type errors

- [ ] **Step 4: Verify test counts**

Server should have more tests than before (was 143, now should be ~170+ with new module tests).
Client should have more tests than before (was 51, now should be ~65+ with new component tests).

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -A && git commit -m "fix(brain): integration fixups from full test run"
```

---

## Task Summary

| Task | Description | Dependencies |
|---|---|---|
| 1 | Extract faction-detect module | None |
| 2 | Extract strip-flavor module | None |
| 3 | Extract fetch-nodes module | None |
| 4 | Extract format module | 2 (strip-flavor) |
| 5 | Implement retrieve module | 1, 3 |
| 6 | Rewrite worker.ts | 1, 2, 3, 4, 5 |
| 7 | ResultCard + FactionBanner components | None |
| 8 | Replace Cytoscape with react-force-graph | None |
| 9 | Wire up BrainScreen | 7, 8 |
| 10 | Full integration test | All |

Tasks 1, 2, 3 can run in parallel. Task 7 and 8 can run in parallel (and parallel with 1-3). Task 4 needs 2. Task 5 needs 1 + 3. Task 6 needs 1-5. Task 9 needs 7 + 8. Task 10 needs all.
