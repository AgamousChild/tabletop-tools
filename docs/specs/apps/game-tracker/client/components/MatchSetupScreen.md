# apps/game-tracker/client/src/components/MatchSetupScreen.tsx

> Screen 1 — collect match metadata: date, factions, opponent, list selection.

## Prompt

Write a form screen that collects match setup data. Export both the component and the `MatchSetupData` type.

### MatchSetupData type

```typescript
{
  date: number             // epoch ms
  location: string
  opponentName: string
  opponentFaction: string  // required
  opponentDetachment: string
  yourFaction: string
  yourDetachment: string
  listId: string | null
  pastedList: string
  isTournament: boolean
  tournamentName: string
  tournamentId: string | null
}
```

### Props

`onNext(data: MatchSetupData)`, `onBack()`

### Fields

- **Date** — initialized to today via `new Date().toISOString().split('T')[0]`
- **Location** — free text
- **Your faction** — dropdown from `usePrimaryFactions()` (game-data-store)
- **Your detachment** — dropdown from `useDetachments(yourFaction)`
- **Opponent name** — free text
- **Opponent faction** — dropdown (same faction list) — **required** (only field blocking "Next")
- **Opponent detachment** — dropdown from `useDetachments(opponentFaction)`
- **List selection** — toggle between "Select" (pick from `useLists()`) and "Paste" (free text)
- **Tournament toggle** — checkbox, when on shows tournament name field

### Validation

`canProceed = opponentFaction.trim() !== ''`

## Dependencies

- `react` — `useState`
- `@tabletop-tools/game-data-store` — `usePrimaryFactions`, `useDetachments`, `useLists`
