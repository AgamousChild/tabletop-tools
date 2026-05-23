# apps/list-builder/client/src/components/BattleSizeScreen.tsx

> Simple selection screen for battle size (500/1000/2000/3000 points).

## Prompt

Write a selection screen that shows the four battle sizes as tappable cards. Each card shows the size name, description, max duplicate count, and points value (in amber). Props: `onSelect(size: BattleSize)`, `onBack()`. Import `BATTLE_SIZES` from `../lib/armyRules`. Include a "Back" button and instructional text.

## Dependencies

- `../lib/armyRules` — `BATTLE_SIZES`, `BattleSize` (type)
