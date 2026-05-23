# apps/game-tracker/client/src/components/battle/StratagemPicker.tsx

> Add/remove stratagems used during a turn phase.

## Prompt

Write a component for tracking stratagems used in a turn. Export both the component and `StratagemEntry` type.

### StratagemEntry type

`{ stratagemName: string; cpCost: number }`

### Props

`stratagems` (StratagemEntry[]), `onAdd`, `onRemove(index)`, optional `label` (default "Stratagems"), optional `availableStratagems` (Stratagem[] from game-data-store).

### Behavior

If `availableStratagems` are provided, show a dropdown select populated with faction stratagems. On select, parse `cpCost` from the stratagem's `cpCost` string field (`parseInt || 1`). Reset the dropdown after selection.

Also show a free-text input with CP cost field for custom stratagems not in the database.

Show the list of added stratagems with remove (×) buttons, each showing name and CP cost.

## Dependencies

- `@tabletop-tools/game-data-store` — `Stratagem` (type)
