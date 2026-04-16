# Brain Unified Retrieval Layer — Design Spec

**Date:** 2026-04-12
**Goal:** Unify Search, Ask, and Graph endpoints behind one shared retrieval function. Clean up result presentation. Fix subfaction filtering. Replace Cytoscape with react-force-graph. Fix Browse tab.

---

## Problem

`worker.ts` is a 980-line monolith with three query paths that each implement their own faction detection, query stripping, Vectorize search, and post-filtering. They give different results for the same query. The Ask endpoint's chapter filter checks title/summary text instead of subfaction metadata. Connected node traversal doesn't filter by subfaction. Results are unstructured and hard to read. The Cytoscape graph visualizer is ugly and errors on cold start. The Browse tab doesn't work.

---

## Architecture

Split `worker.ts` into focused modules:

```
apps/brain/server/src/
  worker.ts              ← thin route handlers only
  lib/
    retrieve.ts          ← unified retrieval function (the core)
    faction-detect.ts    ← faction/subfaction detection, query stripping, aliases
    format.ts            ← deterministic answer formatter, context assembler
    fetch-nodes.ts       ← R2 node fetching, graph traversal, manifest caching
    strip-flavor.ts      ← flavor text stripping
```

### `retrieve.ts` — The Unified Retrieval Function

One function that all endpoints call:

```typescript
interface RetrieveOptions {
  query: string
  limit?: number               // default 10, max 50
  filter?: {
    layer?: string
    category?: string
    factionId?: string
    phase?: string
  }
  includeConnected?: boolean   // Ask wants connected nodes; Search/Graph don't
  connectedDepth?: number      // default 1
  dualEmbedding?: boolean      // true for Ask — generates keyword embedding too
}

interface RetrieveResult {
  // What was detected from the query
  detected: {
    factions: string[]         // all detected faction slugs
    subfaction?: string        // chapter/legion/craftworld if detected
    strippedQuery: string      // query with faction names removed
    keywords: string[]         // extracted mechanic keywords
  }

  // Primary results from Vectorize search
  results: EnrichedNode[]

  // Connected nodes from graph traversal (if requested)
  connected: EnrichedNode[]

  // Parent map for unit name resolution
  parentMap: Map<string, string>
}

interface EnrichedNode {
  id: string
  score: number                // Vectorize relevance score (0-1)
  title: string
  summary: string
  content: string              // full rules text
  layer: string
  category: string
  factionId?: string
  subfaction?: string
  phase?: string
  datasheetId?: string
  parentUnit?: string          // resolved from parentMap — "what unit is this on?"
  sources: Source[]
  keywords: string[]
}
```

**Retrieval pipeline (same for all endpoints):**

1. Detect all factions/subfactions from query text
2. Strip detected faction names from query for cleaner semantic search
3. Expand mechanic aliases (fnp -> feel no pain, etc.)
4. Generate embedding(s) via Workers AI — single for Search/Graph, dual (question + keywords) for Ask
5. Query Vectorize with faction filter (if detected), fetch 3x limit to allow post-filtering
6. If dual embedding: merge and deduplicate results from both queries
7. Post-filter: faction match, then subfaction match
8. Sort: subfaction-matched first, then faction-matched, then generic — by score within each group
9. Fetch full node content from R2 (manifest cached at module scope)
10. If `includeConnected`: walk graph indexes with faction/subfaction filter, apply priority sort (faction-ability > detachment > ability > weapon), cap weapons at 15
11. Resolve parent names via forward index
12. Return `RetrieveResult`

### `faction-detect.ts` — Faction Detection

Consolidates the currently duplicated logic. **Uses the full 30-faction `FACTION_PATTERNS` set** (not the ~10 faction subset from `stripFactionFromQuery`). Stripping function also uses the full set.

```typescript
// Single source of truth — full 30-faction list
export const FACTION_PATTERNS: FactionPattern[]
export const SUBFACTION_KEYWORDS: SubfactionKeyword[]
export const MECHANIC_ALIASES: MechanicAlias[]

// One detection function (replaces both detectFactionFromQuestion and detectAllFactions)
export function detectFactions(query: string): {
  factions: string[]
  subfaction?: string
}

// One stripping function — uses same FACTION_PATTERNS
export function stripFactionFromQuery(query: string, detectedFactions: string[]): string

// One keyword extractor
export function extractMechanicKeywords(query: string): string[]
```

### `format.ts` — Answer Formatting

```typescript
// Conversational deterministic formatter (replaces formatDeterministicAnswer)
// Outputs prose paragraphs grouped by impact tier, then a "Reference" section
export function formatConversationalAnswer(
  question: string,
  nodes: EnrichedNode[],
  parentMap: Map<string, string>,
): string

// Context assembler for LLM prompts (replaces assembleContext)
export function assembleContext(
  primaryNodes: EnrichedNode[],
  connectedNodes: EnrichedNode[],
  parentMap: Map<string, string>,
): string
```

The conversational formatter outputs readable prose. Impact hierarchy: army-wide rules first, detachment rules, then leader/character abilities, then unit abilities, then weapons. Each section is a short paragraph, not a bullet list. Followed by a `## Reference` section with structured data for users who want the raw details.

### `fetch-nodes.ts` — R2 + Graph Traversal

```typescript
// Module-scope manifest cache — fetched once per isolate lifetime, not per request
let cachedManifest: { data: BrainManifest; fetchedAt: number } | null = null

export async function fetchNodesFromR2(bucket: R2Bucket, nodeIds: string[]): Promise<Node[]>

export async function fetchConnectedNodes(
  bucket: R2Bucket,
  nodeIds: string[],
  depth: number,
  factionFilter?: { factionId?: string; subfaction?: string },
): Promise<{ nodes: Node[]; parentMap: Map<string, string> }>
```

Key changes:
- Manifest is cached at module scope (like the existing Worker handler pattern elsewhere in the codebase)
- `fetchConnectedNodes` accepts a faction filter and applies subfaction filtering to connected nodes — fixing the main bug
- Depth > 1 supported — recursive traversal fetches connected-of-connected from R2
- Priority sort preserved: faction-ability (0) > detachment (1) > ability (2) > other (3) > weapon (4), weapon cap at 15

### `strip-flavor.ts`

```typescript
export function stripFlavorText(text: string): string
```

Extracted for testability. Logic unchanged.

---

## Endpoint Changes

### `/search`

```
POST /search { query, limit?, filter? }

Returns:
{
  detected: { factions, subfaction, strippedQuery, keywords },
  results: EnrichedNode[],
}
```

Calls `retrieve()` with `includeConnected: false, dualEmbedding: false`.

### `/ask`

```
POST /ask { question, factionId?, depth? }

Returns:
{
  detected: { factions, subfaction, strippedQuery, keywords },
  answer: string,             // conversational text from LLM or formatter
  reference: EnrichedNode[],  // structured data for reference section
  sources: Source[],
  connectedCount: number,
}
```

Calls `retrieve()` with `includeConnected: true, dualEmbedding: true`, then passes results to LLM or conversational formatter.

**LLM strategy:**
- Always try LLM first (Workers AI Llama 3.1 8B, or Claude if `?model=claude`)
- LLM context threshold: 40,000 chars (raised from 20,000)
- Above threshold: conversational deterministic formatter with reference section
- LLM failure: fall back to conversational deterministic formatter
- `reference` field is always populated regardless of which path generates `answer`

### `/graph-data`

New endpoint for the Graph tab:

```
POST /graph-data { query, limit? }

Returns:
{
  detected: { factions, subfaction, strippedQuery, keywords },
  nodes: EnrichedNode[],
  edges: Array<{ source: string, target: string, rel: string }>,
}
```

Calls `retrieve()` with `includeConnected: false, dualEmbedding: false`. Then fetches forward/reverse index entries for result nodes server-side (instead of the client fetching raw index JSON). Returns only edges between result nodes.

---

## Client Changes

### Tabs

Four tabs: **Ask, Search, Browse, Graph** (was: Ask, Search, Graph, Browse)

### Remove Cytoscape

Delete `GraphView.tsx` and `cytoscape` dependency. Replace with `react-force-graph` (react-force-graph-2d).

### New Graph Tab — react-force-graph

- Calls `/graph-data` endpoint
- Search bar at top (same pattern as other tabs)
- Force-directed graph renders nodes as circles, edges as lines
- Node color by layer (same palette as current: amber=core, blue=faction, green=unit, red=errata, purple=balance, cyan=community)
- Node size by relevance score
- Click node to see details in a side panel
- Faction filter banner (same as Search/Ask)
- Dark theme (slate-950 background matches the app)
- react-force-graph handles zoom, pan, hover out of the box

### Fix Browse Tab

The Browse tab currently relies on IndexedDB data from the client sync. If the user hasn't synced brain data to IndexedDB, Browse shows nothing. Fix:

- On mount, check if IndexedDB has brain data (via `getBrainMeta()`)
- If no data: show a prompt to sync, or fall back to fetching from the API
- Layer navigation should show node counts per layer
- Selecting a layer loads nodes from IndexedDB (if synced) or API fallback
- Node detail view should render content as markdown (reuse `renderMarkdown` from BrainScreen)

### Result Presentation (Search + Ask reference section)

**Numbered results with clean separation:**

Each result is a card with:
1. **Number indicator** (`#1`, `#2`, etc. — auto-increment)
2. **Title** (bold, prominent)
3. **Parent unit** (if weapon/ability — "on Intercessor Squad")
4. **Tags line:** layer badge, category, faction, subfaction, phase
5. **Summary** (1-2 lines)
6. **Relevance score** (percentage, subtle)

Results sorted: detected faction/subfaction first, then by score within each group.

### Faction Filter Banner

When the API returns `detected.factions` or `detected.subfaction`:

```
Filtered to Blood Angels | [Show all results]
```

Dismissing the banner shows all results but keeps faction-matched results sorted to top. The filter controls visibility, sort is always faction-first.

Appears in Search, Ask, and Graph tabs.

### Ask Tab Changes

- Answer section: rendered as conversational prose (markdown via `renderMarkdown`)
- Below the answer: "Reference" section with numbered result cards (same component as Search)
- Sources section stays

**Client response handling updated** for new `/ask` response shape: `{ detected, answer, reference, sources, connectedCount }`. The `QAResponse` interface and fetch handler in `BrainScreen.tsx` are updated accordingly.

---

## Testing Strategy

### Server — new test files

- `lib/faction-detect.test.ts` — faction detection, query stripping, alias expansion, full 30-faction coverage
- `lib/retrieve.test.ts` — full retrieval pipeline with Vectorize/R2 mocks, faction sort order verification
- `lib/format.test.ts` — conversational formatter output structure, context assembler
- `lib/fetch-nodes.test.ts` — R2 fetching with manifest caching, graph traversal, subfaction filtering on connected nodes, priority sort, weapon cap
- `lib/strip-flavor.test.ts` — flavor text stripping

### Server — unchanged tests

Parsers, slugify, normalize, model, sync, combat-tiers, combat-knowledge — all unchanged.

### Client — updated tests

- `BrainScreen.test.tsx` — updated for four tabs, numbered results, faction banner, new Ask response shape
- New: `components/FactionBanner.test.tsx`
- New: `components/ResultCard.test.tsx`
- New: `components/GraphView.test.tsx` (react-force-graph)
- Remove: old `GraphView.tsx` Cytoscape tests (there are none currently)

---

## Dependencies

### Add
- `react-force-graph-2d` — Graph tab visualization

### Remove
- `cytoscape` — replaced by react-force-graph

---

## What This Fixes

1. **Subfaction filtering inconsistency** — one function, one set of rules, all endpoints
2. **Ask shows wrong chapters** — connected node traversal now filters by subfaction
3. **Search/Ask give different results** — same retrieval function
4. **Graph visualizer ugly/broken** — replaced with react-force-graph (good OOB look, customizable later)
5. **Browse tab doesn't work** — sync check + API fallback + proper rendering
6. **Messy result presentation** — numbered, separated, sorted by faction then relevance
7. **Deterministic formatter is a bullet dump** — conversational prose with reference section
8. **worker.ts is untestable** — split into focused, independently testable modules
9. **Manifest re-fetched on every request** — module-scope caching
10. **Faction pattern sets diverged** — single source of truth (full 30-faction list)
11. **Dual embedding dropped for Ask** — explicitly modeled in RetrieveOptions

## What This Doesn't Change

- Parsers (core-rules, faction-pack, rules-commentary, balance-dataslate, game-data)
- Graph build pipeline (build-graph.ts, upload-graph.ts)
- Node model schema
- R2 data format
- Vectorize index structure
- Client store/sync/hooks (IndexedDB layer) — except Browse now falls back to API
- Deploy process
