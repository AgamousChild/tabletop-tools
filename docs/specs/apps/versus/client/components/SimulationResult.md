# apps/versus/client/src/components/SimulationResult.tsx

> Displays simulation results with per-weapon breakdown and damage distribution histogram.

## Prompt

Write a React component that displays combat simulation results for a Warhammer 40K matchup.

### Types (exported)

```typescript
type Result = {
  expectedWounds: number
  expectedModelsRemoved: number
  survivors: number
  worstCase: { wounds: number; modelsRemoved: number }
  bestCase: { wounds: number; modelsRemoved: number }
}

type WeaponBreakdown = {
  weaponName: string
  expectedWounds: number
  expectedModelsRemoved: number
  abilities?: string[]
}
```

### Props

`attackerName`, `defenderName` (strings), `result` (Result), optional `weaponBreakdowns` (WeaponBreakdown[]), optional `distribution` (DistributionData | null), `onSave` callback.

### Layout

1. **Header**: "{attackerName} vs {defenderName}"
2. **Summary stats**: Expected wounds, models removed, survivors — displayed in a grid with large numbers
3. **Best/worst case**: Two sub-boxes showing wound range
4. **Per-weapon breakdown**: If `weaponBreakdowns` provided, show a table with each weapon's contribution and abilities
5. **Distribution chart**: If `distribution` provided, render a `DistributionChart` sub-component
6. **Save button**: Calls `onSave`

### DistributionChart sub-component

Takes `DistributionData`. Renders:
- A row of percentile values (10th, 25th, median, 75th, 90th) — median highlighted in slate-300
- Horizontal histogram bars: for each damage value in the histogram Map, render a bar proportional to `count / maxCount`. Show damage value on left, percentage on right.

Sort histogram entries by damage value ascending. Use `Array.from(data.histogram.entries()).sort()`.

## Dependencies

- `react` — `useState`
- `../lib/rules/pipeline` — `DistributionData` (type)
