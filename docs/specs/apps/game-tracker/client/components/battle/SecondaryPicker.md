# apps/game-tracker/client/src/components/battle/SecondaryPicker.tsx

> Manage secondary objectives — add, remove, score VP per round.

## Prompt

Write a component for managing secondary mission objectives. Export the component and `SecondaryMission` type.

### SecondaryMission type

`{ id: string; secondaryName: string; vpPerRound: number[] }`

### Props

`secondaries` (SecondaryMission[]), `onAdd(name)`, `onRemove(id)`, `onScore(id, roundNumber, vp)`, `currentRound`, optional `label`, optional `availableSecondaries` (array of `{ id, name }`).

### Behavior

Show list of active secondaries. For each, show the name and a VP stepper for the current round (using the `VpStepper` pattern). Remove button per secondary. Add button (dropdown from availableSecondaries if provided, otherwise free-text).

## Dependencies

None beyond React.
