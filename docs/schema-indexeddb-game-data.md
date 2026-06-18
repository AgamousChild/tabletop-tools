# IndexedDB — Game Data Store

> Source: `packages/game-data-store/src/store.ts`
> Database name: `tabletop-tools-game-data`
> Current version: 9
> Engine: Browser IndexedDB
> Consumers: data-import (writes), versus (reads), list-builder (reads + list writes)

---

## Store Summary

| # | Store | Version Added | keyPath | Indexes | Purpose |
|---|-------|---------------|---------|---------|---------|
| 1 | `units` | V1 | `id` | `faction` | BSData unit profiles |
| 2 | `meta` | V1 | (key-value) | — | Import metadata, settings |
| 3 | `lists` | V2 | `id` | — | Local army lists |
| 4 | `list_units` | V2 | `id` | `listId` | Units within army lists |
| 5 | `detachments` | V3 | `id` | `factionId` | Detachment definitions |
| 6 | `detachment_abilities` | V3 | `id` | `detachmentId` | Detachment ability rules |
| 7 | `stratagems` | V3 | `id` | `factionId`, `detachmentId` | Stratagems by faction/detachment |
| 8 | `enhancements` | V3 | `id` | `detachmentId` | Enhancements per detachment |
| 9 | `leader_attachments` | V3 (V5 upgrade) | `id` | `leaderId`, `attachedId` | Leader-to-unit attachment rules |
| 10 | `unit_compositions` | V3 | `id` | `datasheetId` | Unit composition tables |
| 11 | `unit_costs` | V3 | `id` | `datasheetId` | Unit point costs |
| 12 | `wargear_options` | V3 | `id` | `datasheetId` | Weapon/wargear options |
| 13 | `unit_keywords` | V3 | `id` | `datasheetId` | Unit keywords |
| 14 | `unit_abilities` | V3 | `id` | `datasheetId` | Unit special rules |
| 15 | `missions` | V3 | `id` | — | Mission definitions |
| 16 | `datasheets` | V6 | `id` | `factionId`, `name` | Wahapedia unit datasheets |
| 17 | `datasheet_wargear` | V6 | `id` | `datasheetId` | Weapon profiles from datasheets |
| 18 | `datasheet_models` | V6 | `id` | `datasheetId` | Model stat lines from datasheets |
| 19 | `abilities` | V7 | `id` | — | Global abilities catalog |
| 20 | `datasheet_stratagems` | V7 | `id` | `datasheetId`, `stratagemId` | Datasheet ↔ stratagem junction |
| 21 | `datasheet_enhancements` | V7 | `id` | `datasheetId`, `enhancementId` | Datasheet ↔ enhancement junction |
| 22 | `datasheet_detachment_abilities` | V7 | `id` | `datasheetId`, `detachmentAbilityId` | Datasheet ↔ detachment ability junction |

**Total: 22 object stores**

---

## Version History

| Version | Changes |
|---------|---------|
| V1 | `units`, `meta` |
| V2 | + `lists`, `list_units` |
| V3 | + `detachments`, `detachment_abilities`, `stratagems`, `enhancements`, `leader_attachments`, `unit_compositions`, `unit_costs`, `wargear_options`, `unit_keywords`, `unit_abilities`, `missions` |
| V5 | + `attachedId` index on `leader_attachments` (reverse lookup) |
| V6 | + `datasheets`, `datasheet_wargear`, `datasheet_models` |
| V7 | + `abilities`, `datasheet_stratagems`, `datasheet_enhancements`, `datasheet_detachment_abilities` |
| V8-V9 | (no new stores — internal changes) |

---

## Type Definitions

### `units` store — UnitProfile (from game-content)

```typescript
interface UnitProfile {
  id: string           // BSData GUID or Wahapedia ID
  faction: string      // e.g., "Space Marines", "Aeldari"
  name: string         // e.g., "Intercessor Squad"
  move: number
  toughness: number
  save: number
  wounds: number
  leadership: number
  oc: number
  invulnSave?: number
  weapons: WeaponProfile[]
  abilities: string[]
  abilityDescriptions?: Record<string, string>
  points: number
}
```

### `meta` store — key-value pairs

| Key | Type | Purpose |
|-----|------|---------|
| `importMeta` | `ImportMeta` | Last unit import info |
| `rulesImportMeta` | `RulesImportMeta` | Last rules import info |
| `includeLegends` | `boolean` | Whether to include Legends units |

```typescript
interface ImportMeta {
  lastImport: number     // timestamp
  factions: string[]
  totalUnits: number
  parserVersion?: number
  commitSha?: string
}

interface RulesImportMeta {
  lastImport: number
  counts: {
    detachments: number
    stratagems: number
    enhancements: number
    leaderAttachments: number
    unitCompositions: number
    unitCosts: number
    wargearOptions: number
    unitKeywords: number
    unitAbilities: number
    missions: number
    abilities: number
    datasheetStratagems: number
    datasheetEnhancements: number
    datasheetDetachmentAbilities: number
  }
}
```

### `lists` store

```typescript
interface LocalList {
  id: string
  faction: string
  name: string
  description?: string
  detachment?: string
  battleSize?: number     // 500/1000/2000/3000
  totalPts: number
  createdAt: number
  updatedAt: number
}
```

### `list_units` store

```typescript
interface LocalListUnit {
  id: string
  listId: string          // FK to lists store
  unitContentId: string   // reference to unit/datasheet
  unitName: string        // denormalized for offline display
  unitPoints: number      // denormalized
  modelCount?: number
  count: number
  isWarlord?: boolean
  enhancementId?: string
  enhancementName?: string
  enhancementCost?: number
}
```

### `detachments` store

```typescript
interface Detachment {
  id: string
  factionId: string
  name: string
  legend: string
  type: string
}
```

### `detachment_abilities` store

```typescript
interface DetachmentAbility {
  id: string
  detachmentId: string
  factionId: string
  name: string
  legend: string
  description: string
}
```

### `stratagems` store

```typescript
interface Stratagem {
  id: string
  factionId: string
  detachmentId: string
  name: string
  type: string
  cpCost: string
  turn: string
  phase: string
  legend: string
  description: string
}
```

### `enhancements` store

```typescript
interface Enhancement {
  id: string
  factionId: string
  detachmentId: string
  name: string
  legend: string
  description: string
  cost: string
}
```

### `leader_attachments` store

```typescript
interface LeaderAttachment {
  id: string
  leaderId: string      // datasheet ID of leader
  attachedId: string    // datasheet ID of unit they can lead
}
```

### `unit_compositions` store

```typescript
interface UnitComposition {
  id: string
  datasheetId: string
  line: string
  description: string
}
```

### `unit_costs` store

```typescript
interface UnitCost {
  id: string
  datasheetId: string
  line: string
  description: string
  cost: string
}
```

### `wargear_options` store

```typescript
interface WargearOption {
  id: string
  datasheetId: string
  line: string
  description: string
}
```

### `unit_keywords` store

```typescript
interface UnitKeyword {
  id: string
  datasheetId: string
  keyword: string
  isFactionKeyword: boolean
}
```

### `unit_abilities` store

```typescript
interface UnitAbility {
  id: string
  datasheetId: string
  name: string
  description: string
  type: string
  abilityId?: string     // FK to abilities store
  parameter?: string
}
```

### `missions` store

```typescript
interface Mission {
  id: string
  name: string
  type: string
  description: string
}
```

### `datasheets` store

```typescript
interface Datasheet {
  id: string
  name: string
  factionId: string
  role: string
  legend: string
  transport: string
  loadout: string
  damagedW: string
  damagedDescription: string
  isLegends?: boolean
  move?: string
  toughness?: string
  save?: string
  wounds?: string
  leadership?: string
  oc?: string
  invSv?: string
}
```

### `datasheet_wargear` store

```typescript
interface DatasheetWargear {
  id: number
  datasheetId: string
  name: string
  description: string    // weapon abilities text
  range: string
  type: string           // Ranged/Melee
  attacks: string
  skill: string
  strength: string
  ap: string
  damage: string
}
```

### `datasheet_models` store

```typescript
interface DatasheetModel {
  id: number
  datasheetId: string
  name: string
  move: string
  toughness: string
  save: string
  wounds: string
  leadership: string
  oc: string
  invSv: string
  invSvDescription: string
  baseSize: string
}
```

### `abilities` store

```typescript
interface Ability {
  id: string
  name: string
  legend: string
  factionId: string
  description: string
}
```

### Junction stores (datasheet_stratagems, datasheet_enhancements, datasheet_detachment_abilities)

```typescript
interface DatasheetStratagem {
  id: number
  datasheetId: string
  stratagemId: string
}

interface DatasheetEnhancement {
  id: number
  datasheetId: string
  enhancementId: string
}

interface DatasheetDetachmentAbility {
  id: number
  datasheetId: string
  detachmentAbilityId: string
}
```

---

## Data Flow

```
Wahapedia CSVs + BSData XML
    → data-import Worker (processes + maps IDs)
    → R2 (pre-processed JSON)
    → data-import client (downloads)
    → game-data-store (saves to IndexedDB)
    → versus, list-builder (reads via hooks)
```

BSData IDs are stable hex GUIDs — re-importing overwrites the same IndexedDB keys (in-place update, no duplicates).

---

## Key Design Decisions

1. **Denormalization in list_units**: `unitName` and `unitPoints` copied at add-time so lists display without requiring game content to be loaded.
2. **Dual unit data**: Both BSData `units` store (V1) and Wahapedia `datasheets` store (V6) exist. Wahapedia is the primary source for detailed stat lines; BSData provides the legacy UnitProfile format.
3. **Manual cascade delete**: `deleteList()` manually deletes all `list_units` with matching `listId` before deleting the list itself (IndexedDB has no built-in cascade).
4. **Faction normalization**: `normalizeFactionName()` strips "Imperium - " and "Chaos - " BSData prefixes to match Wahapedia faction names.
