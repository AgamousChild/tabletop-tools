# apps/list-builder/client/src/lib/armyRules.ts

> Army construction rules — battle sizes, duplicate limits, validation.

## Prompt

Write the army construction rules module for Warhammer 40K matched play.

### Types

**`BattleSize`**: `name: string`, `points: number`, `maxDuplicates: number`, `description: string`.

**`ListUnit`**: `unitContentId`, `unitName` (strings), `unitPoints`, `count` (numbers), optional `isWarlord` (boolean), `role` (string).

**`ValidationError`**: `type: 'OVER_POINTS' | 'DUPLICATE_LIMIT' | 'NO_WARLORD'`, `message: string`.

### Constants

**`BATTLE_SIZES`** array with four entries:
1. Incursion — 500pts, max 1 duplicate, "Small-scale skirmish"
2. Strike Force — 1000pts, max 2 duplicates, "Standard matched play"
3. Strike Force — 2000pts, max 3 duplicates, "Tournament standard"
4. Onslaught — 3000pts, max 3 duplicates, "Large-scale battle"

### Functions

**`validateArmy(units: ListUnit[], battleSize: BattleSize): ValidationError[]`** — Run three validation checks:

1. **Points total**: Sum `unitPoints * count` for all units. If over `battleSize.points`, return error with "X/Ypts — over by Z".

2. **Duplicate limits**: Group units by `unitContentId`, sum their `count`. If any non-Battleline unit exceeds `maxDuplicates`, return error. **Battleline units are exempt** from duplicate limits per matched play rules — check `unit.role?.toLowerCase() === 'battleline'`.

3. **Warlord check**: If the list has any units but none has `isWarlord === true`, return a "No Warlord designated" error.

Return all errors found (not just the first).

## Dependencies

None — pure functions only.
