# apps/game-tracker/client/src/components/battle/RoundSummary.tsx

> Side-by-side summary of both players' turn data before confirming and saving a round.

## Prompt

Write a confirmation screen shown after both players' turns are complete in a round.

### Props

`roundNumber`, `yourTurn` (TurnData), `theirTurn` (TurnData), `opponentName`, `onConfirm()`, `onBack()`, `isSaving` (boolean).

### Layout

1. Header: "Round {N} Summary"
2. Two-column grid with a `TurnSummaryCard` for each player
3. Back button + "Confirm & Save Round" button (disabled + "Saving..." while `isSaving`)

### TurnSummaryCard sub-component

Shows for one player's turn: CP gained, primary VP, secondary scores count, stratagems used (with total CP), units destroyed count, photo indicator, notes preview.

## Dependencies

- `./types` — `TurnData`
