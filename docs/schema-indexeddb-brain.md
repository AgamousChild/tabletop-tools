# IndexedDB — Brain Knowledge Graph (Client Cache)

> Source: `apps/brain/client/src/lib/store.ts`
> Database name: `tabletop-tools-brain`
> Current version: 1
> Engine: Browser IndexedDB
> Purpose: Client-side cache of knowledge graph nodes synced from R2

---

## Store Summary

| # | Store | keyPath | Indexes | Purpose |
|---|-------|---------|---------|---------|
| 1 | `nodes` | `id` | `layer`, `category`, `factionId`, `phase` | Knowledge graph nodes |
| 2 | `refs` | autoIncrement | `sourceId`, `targetId`, `rel` | Cross-references between nodes |
| 3 | `meta` | `key` | — | Sync metadata |

---

## Type Definitions

### `nodes` store — BrainNode

```typescript
interface BrainNode {
  id: string
  layer: string          // core | faction | unit | errata | balance | community
  category: string       // see NodeCategory enum below
  title: string
  content: string        // full markdown content
  summary: string        // short summary for search results
  phase?: string         // command | movement | shooting | charge | fight | any | pre-battle | deployment | end-of-turn
  factionId?: string     // e.g., "SM" for Space Marines
  detachmentId?: string
  datasheetId?: string
  sources: Array<{
    type: string         // pdf | wahapedia | bsdata | faq | errata | balance-dataslate | reddit | youtube | manual
    title: string
    url?: string
    page?: number
    section?: string
    timestamp?: string
    retrievedAt: string  // ISO date
  }>
  refs: Array<{
    targetId: string
    rel: string          // see RefType enum below
    context: string
    bidirectional?: boolean
  }>
  effectiveDate?: string
  supersededBy?: string  // ID of node that replaces this one
  version: number
  keywords: string[]
}
```

### `refs` store — StoredRef

```typescript
interface StoredRef {
  // auto-incrementing key (no explicit id field)
  sourceId: string
  targetId: string
  rel: string           // part_of | supersedes | clarifies | requires | modifies | triggers | etc.
  context: string
  bidirectional?: boolean
}
```

### `meta` store — BrainMeta

Stored with key `'sync'`:

```typescript
interface BrainMeta {
  lastSync: number                    // timestamp
  fileHashes: Record<string, string>  // filename → hash for cache invalidation
}
```

---

## Server-Side Node Model (R2 + Vectorize)

> Source: `apps/brain/server/src/lib/model.ts`
> The canonical node schema lives server-side. The client BrainNode is a subset.

### Node (full server model)

```typescript
interface Node {
  id: string
  layer: NodeLayer
  category: NodeCategory
  title: string
  content: string
  summary: string
  phase?: GamePhase
  factionId?: string
  factionName?: string          // display name (e.g., "SPACE MARINES")
  detachmentId?: string
  datasheetId?: string

  // Structured fields (parsed from content)
  cpCost?: number               // stratagem CP cost
  targetKeywords?: string[]     // keywords a stratagem targets
  modelRestriction?: string     // enhancement restriction (e.g., "PHOBOS model only")
  isUpgrade?: boolean           // enhancement is a unit upgrade
  isEpicHero?: boolean          // named character — cannot take enhancements
  points?: Array<{              // unit points by model count
    models: string
    cost: number
  }>

  // Unit stat line
  stats?: {
    M: string       // e.g., "6\""
    T: number
    SV: string      // e.g., "3+"
    W: number
    LD: string      // e.g., "6+"
    OC: number
    invSv?: string  // e.g., "4+"
  }

  // Weapon stat line
  weaponStats?: {
    range: string   // e.g., "24\"", "Melee"
    A: string       // e.g., "2", "D6"
    skill: string   // e.g., "3+"
    S: number
    AP: number
    D: string       // e.g., "1", "D3"
  }

  sources: Source[]
  refs: NodeRef[]
  effectiveDate?: string
  supersededBy?: string
  version: number
  subfaction?: string           // chapter, legion, craftworld, etc.
  edition?: string              // '10th', '11th'
  keywords: string[]
  qualityFlags?: string[]       // data quality warnings
}
```

### Enums

**NodeLayer:** `core`, `faction`, `unit`, `errata`, `balance`, `community`

**NodeCategory:**
- Core: `core-mechanic`, `phase-sequence`, `terrain`, `army-construction`, `mission`, `keyword`
- Faction: `faction`, `army-rule`, `army-ability`, `detachment`, `detachment-rule`, `stratagem`, `enhancement`, `faction-ability`
- Unit: `datasheet`, `weapon`, `unit-ability`, `wargear-option`, `leader-attachment`, `unit-composition`
- Overlay: `balance-change`, `faq`, `commentary`
- Community: `ruling`, `tactic`, `worked-example`
- Missions: `primary-mission`, `secondary-mission`, `deployment-zone`, `twist`, `challenger`, `terrain-layout`

**GamePhase:** `command`, `movement`, `shooting`, `charge`, `fight`, `any`, `pre-battle`, `deployment`, `end-of-turn`

**RefType:**
- Structural: `part_of`, `supersedes`, `clarifies`
- Mechanical (obvious): `requires`, `modifies`, `triggers`, `sequence_adjacent`
- Mechanical (non-obvious): `interacts_with`, `commonly_confused`, `edge_case`, `stacks_with`, `prevents`
- Army construction: `eligible_for`, `can_lead`

**SourceType:** `pdf`, `wahapedia`, `bsdata`, `faq`, `errata`, `balance-dataslate`, `reddit`, `youtube`, `manual`

### Record (aggregated view)

```typescript
interface BrainRecord {
  type: RecordType               // faction | detachment | unit | stratagem | enhancement | army-rule | rule | errata | balance | mission types
  primaryNode: Node
  childNodes: Node[]             // e.g., weapons/abilities under a unit
  crossRefs: CrossRef[]          // links to related records
  errata: ErrataAnnotation[]     // errata/FAQ entries for this record
  matchedChildIds: string[]      // which children matched the search query
}
```

---

## Data Flow

```
Source files (GW PDFs, Wahapedia, BSData, community content)
    → build-graph.ts (parse + merge + massage)
    → .local/brain/ JSON files
    → R2 bucket: tabletop-tools-brain
    → /index-vectors endpoint → Vectorize (768-dim embeddings)
    → Client syncs from R2 → IndexedDB cache
```

---

## Storage Architecture

| Storage | What | Access |
|---------|------|--------|
| R2 bucket | Canonical node + ref JSON files, manifest | Server reads on every request |
| Vectorize | 768-dim embeddings (bge-base-en-v1.5) | Semantic search via Workers AI |
| IndexedDB (client) | Cached nodes + refs for offline browsing | Client-side reads |

Node count: ~25,000 (datasheets, weapons, abilities, stratagems, enhancements, rules, errata, community content).
