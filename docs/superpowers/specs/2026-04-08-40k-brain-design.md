# 40K Brain — Knowledge Graph Design Spec

> A structured, source-attributed knowledge graph of Warhammer 40,000 rules, game data, and
> community knowledge. Serves three consumers: a rules browser, an LLM-powered Q&A system,
> and a future game-playing agent.

---

## Problem

40K rules are scattered across multiple sources (core rules PDF, 30+ faction packs, balance
dataslate, rules commentary, community discussions) and multiple layers (core mechanics,
faction rules, unit rules, errata). Players constantly look up interactions mid-game. No
single system assembles the right rules from the right layers with source attribution.

The platform already imports unit data (Wahapedia + BSData) into IndexedDB via data-import.
That data exists in isolation — stats without rules context. The brain unifies game data and
rules into a single connected graph.

---

## Architecture Overview

```
Sources                    Ingestion Worker              Storage           Client
-----------               ------------------            ---------         ------
GW PDFs (markdown)   -->                           -->  R2 (JSON)    -->  IndexedDB
Wahapedia CSVs       -->   Parse, chunk, connect   -->  Vectorize    -->  (graph cache)
BSData XML           -->   Generate embeddings     -->  (embeddings)
Balance Dataslate    -->
Rules Commentary     -->
Community (curated)  -->
```

- **R2**: stores the full node graph as JSON files (same pattern as current data-import)
- **Cloudflare Vectorize**: stores embeddings for semantic search (Q&A, game agent)
- **Client IndexedDB**: caches the node graph locally for fast browsing and offline access
- **Ingestion Worker**: processes all sources, builds the graph, writes to R2 + Vectorize

The brain is heavily cached client-side. The Worker is the ingestion and embedding layer,
not a query bottleneck. Structured browsing and graph traversal happen client-side from
cached data. Semantic Q&A hits Vectorize via the Worker.

---

## Data Model

### Node

Every piece of knowledge in the brain is a **node** — a self-contained unit of rules
knowledge, small enough to be useful as LLM retrieval context, large enough to be
meaningful on its own.

```typescript
interface Node {
  id: string                       // see Node ID Scheme below
  layer: NodeLayer
  category: NodeCategory

  // Content
  title: string                    // human-readable: "Wound Roll", "Fire Overwatch"
  content: string                  // full rules text (markdown)
  summary: string                  // 1-2 sentence plain-language distillation

  // Taxonomy — where does this node live in the game?
  phase?: GamePhase                // which phase(s) this rule is active in
  factionId?: string               // null for core rules
  detachmentId?: string            // null for faction-wide rules
  datasheetId?: string             // null for non-unit rules

  // Source attribution
  sources: Source[]

  // The graph — every node declares its connections
  refs: NodeRef[]

  // Errata/versioning
  effectiveDate?: string           // when this node became effective ("2026-04-01")
  supersededBy?: string            // node ID that replaces this one
  version: number                  // increments on updates, drives client sync

  // Search
  keywords: string[]               // indexed game terms
}
```

### Node ID Scheme

Node IDs must be **deterministic and stable across re-ingestion** so that refs don't
become dangling pointers when the pipeline re-runs.

| Source | ID Strategy | Example |
|---|---|---|
| Core rules | `core:{section-slug}` | `core:wound-roll`, `core:shooting-phase` |
| Faction rules | `faction:{factionId}:{slug}` | `faction:space-marines:oath-of-moment` |
| Detachment | `det:{factionId}:{detachmentSlug}:{slug}` | `det:space-marines:gladius:armour-of-contempt` |
| Errata | `errata:{source-doc}:{page}:{index}` | `errata:core-rules-commentary:p10:1` |
| Balance | `balance:{factionId}:{slug}` | `balance:aeldari:fate-dice-change` |
| Unit (datasheet) | BSData GUID (inherited) | `a1b2c3d4-...` |
| Weapon | `weapon:{datasheetId}:{weaponSlug}` | `weapon:a1b2c3d4:bolt-rifle` |
| Unit ability | `ability:{datasheetId}:{abilitySlug}` | `ability:a1b2c3d4:oath-of-moment` |
| Community | `community:{human-assigned-slug}` | `community:overwatch-engagement-range-ruling` |

Slugs are generated from titles via `kebab-case(title)`. For core/faction/errata nodes,
the combination of `(layer, source-document, section-path)` guarantees uniqueness and
stability. Unit-layer nodes inherit BSData GUIDs, which are already stable hex identifiers
used for in-place IndexedDB updates.

### Layers

Layers represent precedence. When assembling an answer, the system starts with the most
specific layer and grounds upward, applying errata on top.

```typescript
type NodeLayer =
  | 'core'        // core rules PDF — universal mechanics
  | 'faction'     // faction pack rules — detachment rules, faction abilities
  | 'unit'        // datasheets, weapons, unit abilities (from Wahapedia/BSData)
  | 'errata'      // rules commentary, faction pack FAQs
  | 'balance'     // balance dataslate — overrides core and faction
  | 'community'   // curated knowledge — never supersedes, only clarifies
```

**Precedence order** (most specific to least specific):
```
balance     — dataslate overrides everything
errata      — rules commentary / FAQ supersedes original text
unit        — datasheet rules override faction/core when they conflict
faction     — faction rules modify/extend core
core        — universal baseline
community   — annotates anything, never overrides
```

In 40K, specificity wins: a unit's datasheet ability always takes precedence over a
generic faction rule when they conflict. Balance and errata sit above both because they
are explicit corrections to the rules as written.

### Categories

```typescript
type NodeCategory =
  // Core rules
  | 'core-mechanic'       // dice rolling, wound allocation, saving throws, modifiers
  | 'phase-sequence'      // step-by-step phase flow
  | 'terrain'             // cover, visibility, terrain types
  | 'army-construction'   // mustering, detachments, leaders, points
  | 'mission'             // objectives, scoring, deployment
  | 'keyword'             // keyword definition (Infantry, Character, Vehicle, etc.)

  // Faction
  | 'detachment-rule'     // detachment-wide passive ability
  | 'stratagem'           // any stratagem (core or detachment)
  | 'enhancement'         // detachment enhancements
  | 'faction-ability'     // faction-wide rules (e.g. Oath of Moment)

  // Unit
  | 'datasheet'           // unit stats, composition, role
  | 'weapon'              // weapon profile with abilities
  | 'unit-ability'        // ability specific to a unit
  | 'wargear-option'      // weapon/loadout swap options
  | 'leader-attachment'   // leader-to-unit attachment rules
  | 'unit-composition'    // model count and build options

  // Overlay
  | 'balance-change'      // dataslate modifications
  | 'faq'                 // Q&A pair from official FAQ
  | 'commentary'          // designer's note or worked example

  // Community
  | 'ruling'              // community consensus on an interaction
  | 'tactic'              // competitive insight, common play pattern
  | 'worked-example'      // step-by-step walkthrough of an interaction
```

### Game Phases

```typescript
type GamePhase =
  | 'command'
  | 'movement'
  | 'shooting'
  | 'charge'
  | 'fight'
  | 'any'            // usable in multiple phases (e.g. some stratagems)
  | 'pre-battle'     // army construction
  | 'deployment'     // deploy armies step (distinct from army construction)
  | 'end-of-turn'
```

### Chunking Heuristic

Target node size: **200-800 tokens** (roughly 150-600 words). This balances embedding
quality (Vectorize degrades with overly long text) and retrieval usefulness (too small =
missing context, too large = diluted relevance).

Splitting rules:
- **One node per distinct game mechanic** (e.g., "Wound Roll" is one node, not split into
  "Wound Roll Table" and "Wound Roll Modifiers" — those are `part_of` sub-nodes only if
  the parent exceeds 800 tokens)
- **One node per stratagem** (self-contained: name, cost, when, target, effect)
- **One node per enhancement** (self-contained: name, effect, restrictions)
- **One node per datasheet** (stats + composition + keywords as a single node; abilities
  and weapons are separate nodes linked via `part_of`)
- **One node per FAQ/errata entry** (each page reference + amendment is atomic)
- **Phase sequences** split into one node per step (movement phase -> normal moves,
  advance moves, fall back moves, reinforcements — each a node, linked by
  `sequence_adjacent`)

---

## The Graph — Node References

References are the core value of the brain. Every node declares its connections to other
nodes. References are typed, directional, and always include a `context` string explaining
*why* the connection exists.

```typescript
interface NodeRef {
  targetId: string
  rel: RefType
  context: string              // REQUIRED — why this connection exists
  bidirectional?: boolean      // if true, reverse ref is materialized in storage
}
```

When `bidirectional` is true, the ingestion pipeline materializes both directions as
explicit entries in the refs store. This avoids expensive full-table scans in IndexedDB
when traversing the graph in reverse (e.g., "what refs point TO this node?").

### Reference Types

```typescript
type RefType =
  // Structural
  | 'part_of'              // sub-section of a larger rule (wound roll -> shooting phase)
  | 'supersedes'           // errata/balance replaces this node
  | 'clarifies'            // FAQ/commentary explains this node

  // Mechanical — obvious connections
  | 'requires'             // must understand target first (saving throw -> AP)
  | 'modifies'             // changes how target works (faction rule -> core mechanic)
  | 'triggers'             // activates target rule (charge -> overwatch)
  | 'sequence_adjacent'    // next/prev step in game flow

  // Mechanical — non-obvious connections
  | 'interacts_with'       // rules that commonly combine in play
  | 'commonly_confused'    // rules people mix up
  | 'edge_case'            // unusual interaction that catches people out
  | 'stacks_with'          // effects that combine (multiple +1 modifiers)
  | 'prevents'             // this rule blocks the target (battle-shock -> actions)
```

### What Makes Refs Valuable

The `context` field turns a graph edge into knowledge:

- **Not**: `Overwatch -> shooting-sequence` (rel: `triggers`)
- **Yes**: `Overwatch -> shooting-sequence` (rel: `triggers`, context: "Overwatch triggers
  a shooting attack during the opponent's charge phase. Hit roll modifiers and weapon
  abilities apply normally, but out-of-phase restrictions mean abilities like Pinning
  Bombardment don't trigger (see Rules Commentary p.10).")

Non-obvious connections are where the real value lives:

- **Overwatch** `interacts_with` **engagement range**: "If the charging unit is already
  within engagement range, Overwatch cannot be used — the trigger is 'when a charge is
  declared', but the unit must not already be in engagement range."
- **Fights First** `edge_case` **charge bonus**: "A unit with Fights First that was
  charged still gets to fight first, but the charging unit still gets its charge bonus
  (+1S from Lance, etc.) — these are separate mechanics."
- **Battle-shock** `prevents` **actions**: "Battle-shocked units cannot perform Actions,
  Fall Back, or use Stratagems. This is commonly missed for the Stratagem restriction."

---

## Source Attribution

Every node tracks its provenance. When the system answers a question, it cites sources.

```typescript
interface Source {
  type: 'pdf' | 'wahapedia' | 'bsdata' | 'faq' | 'errata'
       | 'balance-dataslate' | 'reddit' | 'youtube' | 'manual'
  title: string                  // "Core Rules v1.0", "Faction Pack: Space Marines v1.6"
  url?: string                   // link to original
  page?: number                  // PDF page number
  section?: string               // section heading within the document
  timestamp?: string             // YouTube timestamp (e.g. "14:32")
  retrievedAt: string            // ISO date when this was pulled
}
```

**Answer attribution example:**

> **Q:** Can I use Overwatch if the charging unit is already in engagement range?
>
> **A:** No. Overwatch requires the charging unit to not already be within engagement range.
>
> *Sources: Core Rules p.41 (Fire Overwatch stratagem), Rules Commentary p.10
> (out-of-phase rules), Reddit r/WarhammerCompetitive [link] (community consensus)*

---

## Data Unification

The brain subsumes the existing game data. Current Wahapedia/BSData data that flows through
data-import becomes unit-layer nodes in the graph.

| Current Store (IndexedDB) | Brain Layer | Brain Category |
|---|---|---|
| datasheets | unit | datasheet |
| datasheet_wargear | unit | weapon |
| datasheet_models | unit | datasheet (embedded) |
| unit_abilities | unit | unit-ability |
| unit_keywords | unit | datasheet (embedded) |
| unit_compositions | unit | unit-composition |
| unit_costs | unit | datasheet (embedded) |
| wargear_options | unit | wargear-option |
| leader_attachments | unit | leader-attachment |
| abilities (core) | core | core-mechanic / ability |
| detachments | faction | detachment-rule |
| detachment_abilities | faction | faction-ability |
| stratagems | faction | stratagem |
| enhancements | faction | enhancement |
| missions | core | mission |
| datasheet_stratagems | — | becomes `modifies` refs (stratagem → datasheet) |
| datasheet_enhancements | — | becomes `modifies` refs (enhancement → datasheet) |
| datasheet_detachment_abilities | — | becomes `modifies` refs (detachment ability → datasheet) |

**The brain does NOT replace game-data-store for structured data.** Consumer apps (versus,
list-builder, game-tracker) continue to query existing IndexedDB stores for typed unit
data (`UnitProfile`, weapon stats, points costs). The brain is a **knowledge layer** —
it adds rules context, source attribution, and graph relationships on top of the same
underlying data.

Unit-layer brain nodes reference the same IDs as game-data-store records (BSData GUIDs).
A brain node for an Intercessor Squad contains the rules text, abilities, and refs — not
the M/T/Sv/W/Ld/OC stats. The structured stats stay in game-data-store. The rules browser
can display both by joining on ID.

---

## Storage Architecture

### R2 (Source of Truth)

The node graph is stored in R2 as JSON files, following the existing data-import pattern:

```
r2://tabletop-tools-brain/
  manifest.json                         # version, per-file hashes, last updated
  nodes/
    core.json                           # all core-layer nodes
    faction-space-marines.json          # faction + unit layer nodes for this faction
    faction-necrons.json
    ...                                 # one file per faction
    errata.json                         # all errata-layer nodes
    balance.json                        # all balance-layer nodes
    community.json                      # all community-layer nodes
  refs/
    core-refs.json                      # refs originating from core nodes
    faction-space-marines-refs.json     # refs originating from SM faction/unit nodes
    faction-necrons-refs.json
    ...                                 # one refs file per faction
    errata-refs.json                    # refs from errata nodes
    balance-refs.json                   # refs from balance nodes
    community-refs.json                 # refs from community nodes
```

**Refs are partitioned to match nodes.** Each refs file contains edges originating from
nodes in the corresponding node file. This means a ref update to Space Marines doesn't
force clients to re-download all refs. The manifest tracks per-file versions so the client
can sync incrementally.

**Why separate refs from nodes?** Refs are the most frequently updated part (new
connections discovered, community knowledge added). Keeping them separate means clients
can sync just the ref changes without re-downloading all node content.

### Cloudflare Vectorize (Semantic Search)

Every node gets an embedding generated from `title + summary + content`. Stored in a
Vectorize index for semantic similarity search.

```typescript
// Vectorize record
{
  id: node.id,
  values: embedding,           // vector from embedding model
  metadata: {
    layer: node.layer,
    category: node.category,
    phase: node.phase,
    factionId: node.factionId,
    title: node.title,
    summary: node.summary       // returned with search results
  }
}
```

Vectorize supports metadata filtering, so Q&A can scope searches:
- "Space Marines rules about shooting" -> filter `factionId: 'space-marines'`, `phase: 'shooting'`
- "How does battle-shock work?" -> no filter, core layer results rank highest

### Client IndexedDB (Cache)

The client syncs the node graph from R2, same pattern as current data-import but in its
own IndexedDB database (`tabletop-tools-brain`), separate from game-data-store. This
decouples the brain's schema lifecycle from the existing game data stores (already at
version 9 with 22 stores).

```typescript
// New IndexedDB database: 'tabletop-tools-brain'
'nodes'     // all nodes, indexed by layer, category, factionId, phase
'refs'      // all references, indexed by sourceId, targetId, rel
'meta'      // sync metadata (last update, per-file hashes)
```

Client-side graph traversal: given a node, find all connected nodes N levels deep:

```typescript
function getConnectedNodes(nodeId: string, depth: number): Node[] {
  // BFS through brain_refs store, collecting nodes at each level
}
```

---

## Ingestion Pipeline

### Automated Sources

1. **Core Rules PDF** (markdown already extracted)
   - Parse by section headings + game phase markers
   - Each distinct rule/mechanic becomes a node
   - Section hierarchy generates `part_of` refs

2. **Faction Packs** (markdown already extracted)
   - Parse detachment blocks (rule + enhancements + stratagems)
   - Each detachment rule, enhancement, stratagem becomes a node
   - Detachment structure generates `part_of` refs
   - FAQ sections become errata-layer nodes with `clarifies` refs

3. **Rules Commentary** (markdown already extracted)
   - Each page reference + amendment becomes an errata node
   - `supersedes` refs point to the core rule being amended
   - Q&A pairs become FAQ nodes with `clarifies` refs

4. **Balance Dataslate** (markdown already extracted)
   - Per-faction changes become balance-layer nodes
   - `modifies` refs point to affected faction/unit nodes

5. **Wahapedia + BSData** (existing pipeline)
   - Datasheet data becomes unit-layer nodes
   - Weapon data becomes weapon nodes
   - Abilities become unit-ability nodes
   - Cross-references generated from keywords and faction tags

### Agent-Assisted Curation

For community knowledge (Reddit, YouTube, manual notes):

1. You provide content (URL, text, or notes)
2. An ingestion agent analyzes the content
3. Agent proposes: which node(s) to create, which layer/category, which refs to add
4. You review and approve
5. Nodes are added to the community layer

This is the "Obsidian with an AI librarian" workflow. The agent understands the existing
graph structure and slots new knowledge into the right place.

### Ref Generation

References come from three sources:

1. **Structural** — automatically generated from document hierarchy (section -> subsection)
2. **Mechanical (obvious)** — automatically generated from keyword/phase matching and
   explicit cross-references in the rules text ("see page X", "as described in Y")
3. **Mechanical (non-obvious)** — generated by the curation agent and reviewed by you.
   These are the high-value connections: edge cases, common confusions, interactions
   that aren't obvious from reading each rule in isolation.

---

## Consumers

### 1. Rules Browser

Structured navigation of the knowledge graph:

- Browse by layer: Core Rules -> Shooting Phase -> Wound Roll
- Browse by faction: Space Marines -> Gladius Task Force -> Stratagems
- Browse by unit: Intercessor Squad -> abilities, weapons, applicable stratagems
- Errata overlay: when viewing a core rule, see all errata/FAQ/balance changes inline
- Community annotations: see community notes alongside official rules

Graph traversal powers "related rules" sidebars — click a node, see its refs.

### 2. Q&A (LLM-Powered)

User asks a natural language question. The system:

1. Embeds the question via the Worker
2. Queries Vectorize for semantically similar nodes (with optional faction/phase filters)
3. Traverses refs from top results to gather connected context (N levels deep)
4. Assembles the relevant nodes into a prompt context
5. Calls Claude API with the question + context
6. Returns an attributed answer with source citations

### 3. Game Agent (Future)

An AI assistant that can:

- Answer rules questions during a live game
- Suggest legal plays based on current game state
- Play a game autonomously using the rules graph as its knowledge base

The agent queries the same graph, using phase-aware filtering to retrieve only rules
relevant to the current game state.

---

## Relationship to Existing Infrastructure

### What Changes

- **New Worker**: `apps/brain/` (or extends data-import Worker) — ingestion + Vectorize queries
- **New IndexedDB stores**: `brain_nodes`, `brain_refs`, `brain_meta` in game-data-store
- **New React hooks**: `useNode`, `useNodeRefs`, `useNodeSearch`, `useConnectedNodes`
- **New UI**: rules browser (could be a new app or a section within an existing app)

### What Stays the Same

- **data-import pipeline**: continues to fetch Wahapedia/BSData, now also feeds the brain
- **game-data-store**: existing stores remain for backward compatibility during migration
- **Consumer apps**: versus, list-builder, game-tracker continue to work unchanged
- **Cloudflare infrastructure**: R2, Workers, Pages — no new services

### What Gets Unified Eventually

Once the brain is stable, consumer apps can query the brain graph instead of individual
IndexedDB stores. The brain becomes the single game knowledge layer for the entire platform.

---

## Size Estimates

Back-of-envelope calculation for total graph size:

| Category | Estimated Node Count |
|---|---|
| Core rules (phases, mechanics, keywords, terrain, missions) | ~80 |
| Core stratagems | 6 |
| Errata / rules commentary entries | ~100 |
| Balance dataslate changes | ~60 |
| Factions x detachments (~30 factions x ~4 detachments, each with rule + 4 enhancements + 6 stratagems) | ~3,600 |
| Factions x faction abilities | ~60 |
| Datasheets (~30 factions x ~40 avg) | ~1,200 |
| Weapons (~1,200 datasheets x ~3 avg) | ~3,600 |
| Unit abilities (~1,200 datasheets x ~2 avg) | ~2,400 |
| Wargear options, compositions, leader attachments | ~2,000 |
| Community nodes (grows over time) | ~100 initial |
| **Total** | **~13,200 nodes** |

Estimated refs: ~3-5 per node average = **~40,000-65,000 edges**.

**Storage size estimate:**
- Average node JSON: ~500 bytes (content stored as markdown, not HTML)
- Total nodes: ~6.5 MB
- Total refs: ~6 MB (edge = ~100-150 bytes avg including context strings)
- **Total R2 storage: ~13 MB** (well within R2 free tier)
- **Vectorize vectors: ~13,200** (free tier allows 200,000)
- **Client IndexedDB: ~13 MB** (acceptable for sync-all strategy)

Given the total size is under 10 MB, **sync-all is viable**. The client downloads the
full graph on first sync and incrementally updates changed files using manifest version
tracking (same as data-import today).

---

## Sync Protocol

The client sync follows the existing data-import pattern with per-file versioning:

1. Client fetches `manifest.json` from R2 (via Worker)
2. Manifest contains per-file version hashes:
   ```json
   {
     "version": 12,
     "updatedAt": "2026-04-08T03:00:00Z",
     "files": {
       "nodes/core.json": "sha256:abc123...",
       "nodes/faction-space-marines.json": "sha256:def456...",
       "refs/core-refs.json": "sha256:ghi789...",
       ...
     }
   }
   ```
3. Client compares manifest hashes against locally stored hashes (in `brain_meta`)
4. Downloads only changed files
5. Upserts changed nodes/refs into IndexedDB stores
6. Updates local manifest hashes

**First sync**: downloads everything (~10 MB). **Subsequent syncs**: downloads only files
that changed since last sync (typically a few hundred KB for weekly errata/balance updates).

---

## Prerequisites

### Phase 0: Markdown Normalization

The GW PDF markdown extraction produces single-line files with no structure (the core rules
file is 150KB in 3 lines). This is a **hard prerequisite** — the ingestion pipeline cannot
parse sections or identify chunk boundaries from the current format.

A normalization pass must:
1. Insert line breaks at sentence boundaries
2. Detect and mark section headings (from ALL-CAPS patterns like `SHOOTING PHASE`,
   `CORE CONCEPTS`, `COMMAND PHASE`)
3. Detect and mark sub-sections (e.g., stratagem blocks: WHEN/TARGET/EFFECT patterns)
4. Preserve rules text verbatim — normalize structure, not content
5. Output structured markdown with proper heading hierarchy

This can be done as an LLM-assisted batch process or a regex-based parser (the ALL-CAPS
section headers and stratagem WHEN/TARGET/EFFECT patterns are highly regular). The
normalized markdown becomes the input to the chunking pipeline.

Source files: `C:\R\sync-data\tools\gw-sync\.local\gw\markdown\`

---

## Resolved Decisions

1. **Embedding model**: Cloudflare Workers AI built-in models (`@cf/baai/bge-base-en-v1.5`
   or similar). Native Vectorize integration, no external API calls, no cost. Can upgrade
   to higher-quality embeddings later if retrieval quality is insufficient.

2. **App boundary**: New app at `apps/brain/`. The ingestion pipeline is similar to
   data-import but the consumer surface (rules browser, Q&A) is distinct enough to warrant
   its own app. Separate R2 bucket (`tabletop-tools-brain`), separate Worker, own client
   SPA.

3. **Community curation workflow**: Deferred to a later phase. The initial build focuses
   on automated ingestion from GW PDFs, Wahapedia, BSData, and the rules commentary. The
   agent-assisted curation workflow (Obsidian-style AI librarian) will be designed once the
   base graph is populated and the data model is validated.

4. **LLM Q&A**: Worker-side RAG. The Worker retrieves nodes from Vectorize, traverses refs
   from R2/cache, assembles context, and calls the Claude API. API key stored as a Workers
   secret. Client never sees the API key. Cost is per-query; rate limiting TBD based on
   usage patterns.

---

## Scope Decisions

1. **Combat Patrol**: Out of scope. Separate game mode with its own datasheets and rules.
2. **Crusade**: Out of scope. Narrative play mode — not relevant to competitive rules Q&A.
3. **Munitorum Field Manual (points)**: Included as balance-layer nodes. Points change
   with every dataslate update and are a frequent source of questions ("how much does X
   cost now?"). Each faction's points table becomes a balance-layer node with `modifies`
   refs to the affected datasheet nodes.
