# apps/game-tracker/client/src/components/battle/UnitPicker.tsx

> Pick destroyed units from army list or free-text entry.

## Prompt

Write a component for tracking which units were destroyed during a turn. Export the component and `DestroyedUnit` type.

### DestroyedUnit type

`{ contentId: string; name: string }`

### Props

`units` (DestroyedUnit[]), `onAdd`, `onRemove(index)`, optional `label` (default "Units Destroyed"), optional `availableUnits` (array of `{ contentId, name }`).

### Behavior

If `availableUnits` provided, show a searchable dropdown: text input filters the list (case-insensitive substring match, capped at 8 results via `useMemo`), clicking a result calls `onAdd`. Also support a "Custom" toggle for free-text entry when units aren't in the database.

Show the list of destroyed units with remove buttons.

## Dependencies

- `react` — `useState`, `useMemo`
