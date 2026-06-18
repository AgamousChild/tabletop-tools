# apps/no-cheat/client/src/components/DiceSetScreen.tsx

> Top-level screen router — navigates between dice set list, detail, session, training.

## Prompt

Write the main orchestrator component using a discriminated union screen state:

```typescript
type Screen =
  | { name: 'list' }
  | { name: 'detail'; diceSet: DiceSet }
  | { name: 'session'; diceSet: DiceSet }
  | { name: 'sessionDetail'; diceSet: DiceSet; sessionId: string }
  | { name: 'training'; diceSet: DiceSet }
```

Shows `DiceSetList` for listing, `CreateDiceSetForm` for creation, `DiceSetDetailScreen` for viewing sessions, `ActiveSessionScreen` for live recording, `SessionDetailScreen` for viewing past results, `TrainingScreen` for ML training data management.

Uses `trpc.diceSet.list/create/delete` queries and mutations.

## Dependencies

- `../lib/auth`, `../lib/trpc`
- All dice set sub-components
