# apps/game-tracker/client/src/components/battle/types.ts

> Shared types for the battle turn flow system.

## Prompt

Define the shared types for the round-by-round battle tracking system.

### Types

**`TurnData`** — data collected during one player's turn within a round:
- `cpGained: number` (default 1)
- `primaryVp: number`
- `secondaryScores: { secondaryId: string; vp: number }[]`
- `stratagems: StratagemEntry[]` (from StratagemPicker)
- `unitsDestroyed: DestroyedUnit[]` (from UnitPicker)
- `photoDataUrl: string | null`
- `notes: string`

**`RoundStep`** — phase progression within a round:
`'your-command' | 'your-action' | 'your-photo' | 'their-command' | 'their-action' | 'their-photo' | 'summary'`

**`RoundState`** — tracks both players' turns and current step:
- `yourTurn: TurnData`
- `theirTurn: TurnData`
- `currentStep: RoundStep`

### Factory function

**`createEmptyTurnData(): TurnData`** — returns a TurnData with all fields at their defaults (cpGained: 1, empty arrays, null photo, empty notes).

## Dependencies

- `./StratagemPicker` — `StratagemEntry` (type)
- `./UnitPicker` — `DestroyedUnit` (type)
