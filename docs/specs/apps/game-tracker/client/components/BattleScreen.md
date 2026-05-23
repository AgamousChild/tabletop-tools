# apps/game-tracker/client/src/components/BattleScreen.tsx

> Screen 4 — round-by-round battle tracking with VP scoreboard, turn wizard, and end-game flow.

## Prompt

Write the main battle tracking screen. This manages the live game state during a 40K match.

### Props

`matchId`, `onBack()`, `onClose()`

### Data

- `trpc.match.get.useQuery({ id: matchId })` — the match with turns and secondaries
- `trpc.turn.add.useMutation()` — save a round
- `trpc.turn.update.useMutation()` — edit a past round
- `trpc.match.close.useMutation()` — finalize the match
- `trpc.secondary.set/remove/score.useMutation()` — secondary objective CRUD
- `useStratagems({ factionId, detachmentId })` — load faction stratagems from IndexedDB for both players
- `useList(listId)` — load army list from IndexedDB (for unit picker)

### Core UX

1. **Scoreboard** — persistent header showing: round number, your VP vs their VP, CP for both, opponent name. VP total updates live as rounds are saved.

2. **Round Wizard** — `<RoundWizard>` component handles the turn flow for the current round. Each round has your turn and their turn, each turn goes through Command Phase → Action Phase → Photo → Summary.

3. **End Game** — After all rounds, show final score inputs and "End Game" button. Calls `match.close.mutate(...)`.

4. **Round Editor** — `<RoundEditor>` for editing past rounds. Shows when user taps a completed round in the round list.

### State

- `yourFinalScore`, `theirFinalScore` — text inputs for end game
- `showEndGame` — boolean toggle
- `editingTurnId` — string | null (which past round is being edited)

### Stratagem and unit data

Load stratagems for both players from IndexedDB based on the match's faction/detachment fields. Load the user's army list for the unit destruction picker. These are passed down to the turn flow components.

## Dependencies

- `react` — `useState`, `useMemo`
- `../lib/trpc` — `trpc`
- `@tabletop-tools/game-data-store` — `useStratagems`, `useList`, `useMissions`
- `./battle/Scoreboard` — `Scoreboard`
- `./battle/RoundWizard` — `RoundWizard`
- `./battle/RoundEditor` — `RoundEditor`
- `./battle/types` — `TurnData`
- `./battle/SecondaryPicker` — `SecondaryMission` (type)
