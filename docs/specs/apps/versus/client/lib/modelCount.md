# apps/versus/client/src/lib/modelCount.ts

> Parse model count and points cost options from Wahapedia unit data.

## Prompt

Write a module that parses model count information from Wahapedia's `UnitComposition` and `UnitCost` records.

### Types

Export `ModelOption = { modelCount: number; points: number; description: string }`.

### Internal helper

`extractModelCount(description: string): number | null` — tries two patterns:
1. Match `(\d+)\s*model` (e.g., "5 models" → 5)
2. If that fails, match `^(\d+)\s` (leading number, e.g., "10 Intercessors" → 10)
3. Return null if neither matches.

### Exported functions

**`parseModelCount(compositions: UnitComposition[]): number | null`**
Parse all compositions, collect model counts, return the smallest (minimum squad size). Return null if no counts found.

**`parseModelOptions(compositions: UnitComposition[], costs: UnitCost[]): ModelOption[]`**
Cross-reference costs with compositions to build selectable options. For each `UnitCost`:
1. Try `extractModelCount` on the cost's description
2. If that fails, look up the matching composition by `line` field and try its description
3. Parse points from `cost.cost` as integer
4. Skip if model count can't be determined

Sort the result by modelCount ascending. Build a `Map<string, UnitComposition>` keyed by `line` for the composition lookup.

## Dependencies

- `@tabletop-tools/game-data-store` — `UnitComposition`, `UnitCost` (types only)
