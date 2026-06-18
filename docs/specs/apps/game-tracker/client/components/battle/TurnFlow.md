# apps/game-tracker/client/src/components/battle/TurnFlow.tsx

> Phase-by-phase flow for a single player's turn: Command → Action → Photo.

## Prompt

Write a component that manages the phase progression for one player's turn within a round.

### Props

`player` ('You' | string), `turnData`, `onUpdate(partial)`, `onComplete()`, `requirePhotos`, `secondaries`, secondary callbacks, `currentRound`, optional `availableStratagems`, `availableUnits`, `availableSecondaries`.

### State

`phase: 'command' | 'action' | 'photo'`

### Flow

1. `command` phase → render `<CommandPhaseScreen>`. On next → `action`.
2. `action` phase → render `<ActionPhaseScreen>`. On next → `photo` if `requirePhotos`, else → `onComplete()`.
3. `photo` phase → render `<PhotoCaptureScreen>`. On capture → update `turnData.photoDataUrl`, call `onComplete()`.

## Dependencies

- `react` — `useState`
- `@tabletop-tools/game-data-store` — `Stratagem` (type)
- `./CommandPhaseScreen`, `./ActionPhaseScreen`, `./PhotoCaptureScreen`
- `./SecondaryPicker` — `SecondaryMission` (type)
- `./types` — `TurnData`
