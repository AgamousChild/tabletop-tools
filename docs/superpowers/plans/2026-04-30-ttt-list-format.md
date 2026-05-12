# TTT Package Format (#45, #51)

## Goal

Define a portable, self-contained army package format. A TTT package contains everything needed to build, play, simulate, and share an army list — from rules to TTS objects. One file, every platform.

## Pre-Implementation: Variant Catalogue

Before writing any parser code, sample 50 random `listText` values from `meta_event_players` and document the actual format distribution. Do NOT write regex against one clean example.

## Package Schema

```typescript
interface TTTPackage {
  version: 1
  parsedWith?: string           // 'battlescribe-v1' | 'new-recruit-v1' | 'manual'
  parseStatus?: 'ok' | 'partial' | 'failed'
  parseError?: string

  // ── Layer 1: Meta ────────────────────────────────────────────────
  meta: {
    name: string                // list name (user-defined or event+player)
    author?: string             // player name
    createdAt: string           // ISO date
    updatedAt: string
    edition: '10th' | '11th'
    battleSize: 'Combat Patrol' | 'Incursion' | 'Strike Force' | 'Onslaught' | 'unknown'
    totalPoints: number
    source?: string             // 'list-builder' | 'bcp-import' | 'battlescribe-import' | 'yellowscribe'
  }

  // ── Layer 2: List Selection ──────────────────────────────────────
  list: {
    factionId: string           // dim_faction slug
    factionName: string         // display name
    subfactionId?: string
    subfactionName?: string
    detachmentId: string        // dim_detachment slug
    detachmentName: string
    units: TTTUnit[]
  }

  // ── Layer 3: Rules (optional — enriched from brain/game-data) ───
  rules?: {
    armyRule?: {
      name: string
      content: string           // markdown rules text
    }
    detachment?: {
      name: string
      rule: string              // detachment ability text
      stratagems: Array<{
        name: string
        cp: number
        phase: string
        when: string
        target: string
        effect: string
      }>
      enhancements: Array<{
        name: string
        points: number
        effect: string
      }>
    }
    datasheets: Array<{
      name: string
      points: number
      stats: { m: string; t: number; sv: string; w: number; ld: string; oc: number }
      weapons: Array<{
        name: string
        range: string
        a: string; bs: string; s: number; ap: number; d: string
        abilities: string[]
      }>
      abilities: Array<{ name: string; effect: string }>
      keywords: string[]
      composition: string
    }>
  }

  // ── Layer 4: TTS Objects (optional — for Tabletop Simulator) ────
  tts?: {
    objects: Array<{
      unitName: string
      models: Array<{
        name: string
        meshUrl?: string        // Steam Workshop model URL
        textureUrl?: string
        position?: { x: number; y: number; z: number }
        rotation?: { x: number; y: number; z: number }
        scale?: { x: number; y: number; z: number }
      }>
    }>
    savedObject?: object        // full TTS JSON save object (drop onto table)
    deploymentPositions?: Array<{
      unitName: string
      position: { x: number; y: number }  // board coordinates
      facing: number                       // degrees
    }>
  }

  // ── Layer 5: Bill of Materials (optional — shopping list) ────────
  bom?: {
    kits: Array<{
      name: string              // "Khorne Berzerkers"
      sku?: string              // GW product code
      price: number             // USD
      modelsProvided: number    // models per box
      modelsNeeded: number      // models needed for this list
      quantity: number          // boxes to buy
      url?: string              // GW store link
    }>
    totalCost: number
    ownedModels?: string[]      // user marks what they already have → reduces quantity
  }

  // ── Layer 6: PDF (optional — printable rules packet) ─────────────
  pdf?: {
    url?: string                // generated PDF URL (R2 or local)
    sections: Array<{
      type: 'detachment' | 'stratagem' | 'enhancement' | 'datasheet' | 'army-rule'
      title: string
      pageNumber?: number       // page in source PDF
      imageUrl?: string         // rendered card image
    }>
    generatedAt?: string
  }

  // ── Layer 7: Exports (optional — generated on demand) ───────────
  exports?: {
    battlescribe?: string       // .ros XML content
    yellowscribeUrl?: string    // shareable URL
    text?: string               // plain text (BCP paste format)
    rawSource?: string          // original unparsed text (preserved)
  }
}

interface TTTUnit {
  name: string
  role: 'Epic Hero' | 'Character' | 'Battleline' | 'Other' | 'Dedicated Transport' | 'Fortification' | 'Allied'
  models: number
  points: number
  wargear: string[]
  modelLoadouts?: Array<{ count: number; weapons: string[] }>
  enhancement?: string
  isWarlord?: boolean
  datasheetId?: string          // links to rules.datasheets entry
}
```

## Layers Explained

| Layer | What | When populated | Required |
|---|---|---|---|
| **1. Meta** | Name, author, points, edition | Always | Yes |
| **2. List** | Faction, detachment, units, wargear | Always | Yes |
| **3. Rules** | Army rule, detachment stratagems, datasheets | On enrich from brain/game-data | No |
| **4. TTS** | 3D model references, deployment positions | On TTS export | No |
| **5. BOM** | Kit names, prices, quantities, owned models | On cost calculation | No |
| **6. PDF** | Printable rules packet — unit cards, stratagems, enhancements, detachment, army rule | On PDF generation | No |
| **7. Exports** | BattleScribe XML, Yellowscribe URL, plain text | On export request | No |

A minimal package has only Meta + List (imported from BCP text). A fully enriched package has all 5 layers (built in list-builder with brain data + TTS objects).

## Package Operations

```
Import:
  BattleScribe text  → parse → Meta + List
  New Recruit text   → parse → Meta + List
  Yellowscribe URL   → fetch → Meta + List
  BCP raw text       → parse → Meta + List (what we have now)

Enrich:
  Meta + List → query brain/game-data → + Rules layer

Export:
  Meta + List → generate → BattleScribe .ros XML
  Meta + List → generate → Yellowscribe URL
  Meta + List → generate → plain text
  Meta + List + Rules → generate → printable army sheet

TTS:
  Meta + List → map units to TTS Workshop objects → + TTS layer
  Meta + List + TTS → generate → TTS saved object JSON
```

## Parsers

### BattleScribe parser

**Detachment extraction:** Use existing `extractDetachment()` from `apps/new-meta/server/src/lib/detachment.ts` — do NOT reimplement.

Known variants to handle:
- `+ Epic Hero +`, `+ Character +`, `+ Battleline +`, `+ Other +`, `+ Fortification +`
- `+ Agents of the Imperium +` (allied detachment block)
- Points on unit line `[120pts]` OR on sub-entries `[15pts]`
- Multi-line wargear with inline model counts
- Older BattleScribe versions with different section headers
- Missing Battle Size line

Parser returns `{ ok: false, reason: '...' }` for unrecognizable lists.

### GW App / New Recruit parser (PRIMARY — most common format)

The GW official list builder output is the most common format in our dataset. This is the primary parser and the canonical display format for all apps.

Format:
```
LIST NAME (POINTS)

Faction
Detachment
Battle Size (Points)

CHARACTERS

Unit Name (Points)
• wargear line
• Enhancement: name
• Warlord
◦ sub-model wargear (for multi-model characters like Silent King)

OTHER DATASHEETS

Unit Name (Points)
• Nx Model Name
◦ Nx wargear per model

Exported with App Version: vX.X.X, Data Version: vXXX
```

Key patterns:
- List name + total points on line 1
- Faction, detachment, battle size on next 3 lines
- Role headers: `CHARACTERS`, `OTHER DATASHEETS`, `BATTLELINE`
- Points in parens: `(200 Points)`
- `•` (bullet) for top-level wargear
- `◦` (hollow bullet) for sub-model / nested wargear
- `Warlord` as a standalone bullet
- `Enhancements: Name` as a bullet
- `Nx Model Name` for multi-model units
- Footer: `Exported with App Version: ...`

**This format is also the canonical DISPLAY format** — when any TTT app renders a list for the user, it outputs in this style. Internal storage is TTT JSON; user-facing display is GW format.

### Multi-faction / edge cases

- Multi-faction: `parseStatus: 'partial'`, extract first detachment only
- Legends: skip units, `parseStatus: 'partial'`
- No battle size: `battleSize: 'unknown'`
- Freeform: `parseStatus: 'failed'`, preserve in `exports.rawSource`

## Yellowscribe Integration

Investigate Yellowscribe's URL schema and whether they have an API. At minimum:
- Generate a Yellowscribe-compatible URL from a TTT package
- Parse a Yellowscribe URL back into a TTT package
- If Yellowscribe supports it, two-way live sync

## Storage

### In meta_event_players (BCP imported lists)
Add `list_ttt` column (TEXT, JSON). Contains Layer 1-2 only (Meta + List). Rules/TTS/Exports not stored in DB — generated on demand.

**Migration required:**
1. Add `listTtt: text('list_ttt')` to `metaEventPlayers` in `packages/db/src/schema.ts`
2. Run `drizzle-kit generate` → next migration
3. Update CREATE TABLE SQL in all 8 test files

### In IndexedDB (list-builder created lists)
Full package stored in game-data-store `lists` object store. All layers populated as user builds.

### As shareable file
Export as `.ttt.json` file. Anyone can import it.

## Batch Processing (BCP lists)

Parse all 30,000 existing lists:
- Chunks of 500 rows per transaction
- Idempotent: `WHERE list_ttt IS NULL`
- Log failed IDs to `.local/meta/parse-errors.json`
- Report: parsed / partial / failed / skipped
- Re-runnable targeting by `parsedWith` version

## Where Used

| App | Layers used |
|---|---|
| List Builder | All 5 — build, enrich, export, TTS |
| New-meta list viewer | 1-2 (Meta + List), optionally 3 (Rules) for card display |
| Tournament | 1-2 for registration validation |
| Game Tracker | 1-3 for match setup (import your list with rules) |
| Versus | 3 (Rules) for simulation input |
| TTS | 4 (TTS objects) for deployment |
| Brain | 3 (Rules) for list analysis / matchup advice |

## Estimated effort

- Schema definition + migration: 1 hour
- Variant catalogue (sample 50 lists): 1 hour
- BattleScribe parser: 4-6 hours
- New Recruit parser: 1-2 hours
- Yellowscribe URL investigation + integration: 2-3 hours
- Enrichment from brain/game-data (Layer 3): 3-4 hours
- TTS object mapping (Layer 4): 4-6 hours (depends on Workshop model library)
- Export generators (Layer 5): 2-3 hours
- Batch processing script: 1 hour
- Unit tests: 3 hours

Total: 22-30 hours (phased — parsers first, then enrichment, then TTS/exports)

## Phase Order

1. **Phase A:** Schema + parsers + batch processing (Layers 1-2) — unblocks #44 list viewer
2. **Phase B:** Brain/game-data enrichment (Layer 3) — unblocks #42 card display, #41 versus
3. **Phase C:** Yellowscribe + BattleScribe export (Layer 6) — unblocks #51
4. **Phase D:** TTS object mapping (Layer 4) — online play
5. **Phase E:** BOM / shopping list (Layer 5) — requires GW product data source (scrape games-workshop.com or maintain manual kit→unit mapping table)

## Needs

- Sample lists from BCP data to validate parsers (we have 30,000)
- Micah to review package schema before implementation
- Yellowscribe URL format investigation
- TTS Workshop model library mapping (unit name → model URL)
