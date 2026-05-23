# apps/versus/client/src/components/UnitSelector.tsx

> Faction + unit selection with role filtering for the combat simulator.

## Prompt

Write a React component for selecting a Warhammer 40K unit. It has two stages: pick a faction from a dropdown, then search/select a unit from that faction.

### Props

`label` (string), `factions` (string[]), `units` (UnitOption[]), `selectedUnitId` (string | null), `isLoadingUnits` (boolean), `hasFaction?` (boolean), `onFactionChange`, `onQueryChange`, `onSelect`.

Where `UnitOption = { id: string; name: string; faction: string; points: number }`.

### Role filtering

Define `ROLE_FILTERS = ['All', 'Battleline', 'Characters', 'Other', 'Dedicated Transports', 'Fortifications']`.

Use `useUnitRoles()` from `../lib/useGameData` to get a `Map<string, string>` of unit ID → role. When a role filter is selected (not 'All'), filter the units list by matching role (case-insensitive).

### Layout

1. Section header with the `label` prop
2. Faction dropdown (`<select>`)
3. Unit search text input (calls `onQueryChange`)
4. Role filter toggle buttons (horizontal row)
5. Scrollable unit list — each unit shows name and points, highlighted if selected
6. Loading indicator when `isLoadingUnits` is true

## Dependencies

- `react` — `useState`
- `../lib/useGameData` — `useUnitRoles`
