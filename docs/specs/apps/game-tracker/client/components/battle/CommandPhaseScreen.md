# apps/game-tracker/client/src/components/battle/CommandPhaseScreen.tsx

> Command phase — CP gain, primary VP, secondaries, command phase stratagems.

## Prompt

Write the command phase screen for a player's turn. Shows in the turn flow between phases.

### Props

`player` ('You' | string), `turnData` (TurnData), `onUpdate(partial)`, `onNext()`, `secondaries`, `onAddSecondary`, `onRemoveSecondary`, `onScoreSecondary`, `currentRound`, optional `availableStratagems`, optional `availableSecondaries`.

### Layout

1. Header: "{Player}'s Command Phase" with round badge
2. **CP Gained** — VpStepper (default 1 per turn, adjustable for special rules)
3. **Primary VP** — VpStepper
4. **Secondaries** — SecondaryPicker (add/remove/score for this round)
5. **Command Phase Stratagems** — StratagemPicker
6. "Next" button → `onNext()`

## Dependencies

- `@tabletop-tools/game-data-store` — `Stratagem` (type)
- `./SecondaryPicker` — type
- `./StratagemPicker` — type
- `./types` — `TurnData`
- `./VpStepper` — component
- `./SecondaryPicker` — component
- `./StratagemPicker` — component
