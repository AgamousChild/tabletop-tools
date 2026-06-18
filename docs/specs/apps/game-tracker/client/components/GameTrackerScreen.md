# apps/game-tracker/client/src/components/GameTrackerScreen.tsx

> Top-level screen router — manages the multi-screen wizard flow from match list to end-game.

## Prompt

Write the orchestrator component for the game tracker. Uses a discriminated union `Screen` type to navigate between screens:

```typescript
type Screen =
  | { type: 'list' }
  | { type: 'match-setup' }
  | { type: 'mission-setup'; setupData: MatchSetupData }
  | { type: 'pregame'; setupData: MatchSetupData; missionData: MissionSetupData }
  | { type: 'battle'; matchId: string }
  | { type: 'summary'; matchId: string }
```

### Data

- `trpc.match.list.useQuery()` — all user's matches for the list screen
- `trpc.match.start.useMutation()` — create match, on success navigate to battle screen
- `trpc.match.delete.useMutation()` — delete match, refetch list

### Match list screen (type: 'list')

Show header with "Game Tracker" title, home link, and sign-out button. Below, show "New Match" button and list of existing matches as cards. Each card shows: opponent faction, mission, date, result (WIN/LOSS/DRAW/In Progress), with click to resume (→ battle) or view summary (→ summary if closed). Delete button on each card.

### Wizard flow

When user clicks "New Match":
1. Navigate to `match-setup` → `MatchSetupScreen` collects opponent info, factions, list selection
2. On next → `mission-setup` → `MissionSetupScreen` collects mission, deployment zone, twist/challenger cards
3. On next → `pregame` → `PregameScreen` collects attacker/defender, who goes first
4. On start → call `startMatch.mutate(...)` combining all three data objects → navigate to `battle`
5. Battle screen → `BattleScreen` handles round-by-round play
6. On close → navigate to `summary` → `EndGameScreen`

The `handleStartBattle` function maps the three data objects into the `match.start` input shape. Boolean-to-optional conversions: only include twistCards/challengerCards if their respective toggles are true. Convert empty strings to `undefined`.

## Dependencies

- `react` — `useState`
- `@tabletop-tools/ui` — `HelpTip`
- `../lib/auth` — `authClient`
- `../lib/trpc` — `trpc`
- `./MatchSetupScreen` — component + `MatchSetupData` type
- `./MissionSetupScreen` — component + `MissionSetupData` type
- `./PregameScreen` — component + `PregameData` type
- `./BattleScreen` — component
- `./EndGameScreen` — component
