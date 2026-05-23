# apps/list-builder/client/src/components/FactionDetachmentScreen.tsx

> Two-step selection: pick faction from dropdown, then pick detachment from cards.

## Prompt

Write a two-stage selection component. First the user picks a faction from a dropdown, then detachments for that faction appear as cards.

### Props

`battleSize: BattleSize`, `onSelect(faction, detachment)`, `onBack()`

### State

`selectedFaction` string — controls which detachments are shown.

### DetachmentCard sub-component

For each detachment, render a card that loads and previews up to 3 detachment abilities (using `useDetachmentAbilities(detId)` from game-data-store). Show ability name, legend, and description (truncated to 2 lines, HTML stripped via `htmlToText`). If more than 3, show "+N more rules".

### Data sources

- `useGameDataAvailable()` — show "import game data first" prompt if false
- `useGameFactions()` — faction list for dropdown
- `useGameDetachments(selectedFaction)` — detachment list

### Layout

1. Back button + header
2. Instructional text
3. Game data availability check
4. Faction dropdown
5. Detachment cards (only shown after faction selected)

## Dependencies

- `react` — `useState`
- `@tabletop-tools/ui` — `htmlToText`
- `@tabletop-tools/game-data-store` — `useGameDataAvailable`, `useDetachmentAbilities`
- `../lib/useGameData` — `useGameFactions`, `useGameDetachments`
- `../lib/armyRules` — `BattleSize` (type)
