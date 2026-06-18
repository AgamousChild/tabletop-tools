# apps/game-tracker/client/src/components/battle/ActionPhaseScreen.tsx

> Action phase — unit destruction tracking, stratagems, notes.

## Prompt

Write the action phase screen. Shows after command phase.

### Props

`player` ('You' | string), `turnData`, `onUpdate(partial)`, `onNext()`, optional `availableStratagems`, optional `availableUnits`.

### Layout

1. Header: "{Player}'s Action Phase"
2. **Units Destroyed** — UnitPicker. Label adapts: if player is "You", label is "Their Units You Destroyed"; if opponent, "Your Units They Destroyed".
3. **Action Phase Stratagems** — StratagemPicker
4. **Notes** — textarea for free-text notes
5. "Next" button → `onNext()`

## Dependencies

- `@tabletop-tools/game-data-store` — `Stratagem` (type)
- `./UnitPicker` — component + `DestroyedUnit` type
- `./StratagemPicker` — component + `StratagemEntry` type
- `./types` — `TurnData`
