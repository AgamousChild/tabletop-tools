# apps/game-tracker/client/src/components/PregameScreen.tsx

> Screen 3 — attacker/defender selection and who goes first.

## Prompt

Write a simple selection screen with two choices. Export the component and `PregameData` type.

### PregameData type

```typescript
{ attackerDefender: string; whoGoesFirst: string }
```

### Props

`opponentFaction`, `mission` (display only), `onStart(data: PregameData)`, `onBack()`

### Layout

1. Header with Back button, Home link, "Pre-Game" title
2. Mission/opponent info display card
3. **Attacker/Defender** — two-button toggle: "You Attack" (`YOU_ATTACK`) / "You Defend" (`YOU_DEFEND`). Selected button highlighted with amber border.
4. **Who Goes First** — two-button toggle: "You Go First" (`YOU`) / "They Go First" (`THEM`).
5. "Start Battle" button — enabled when both selections are made (`canStart = attackerDefender !== '' && whoGoesFirst !== ''`)

## Dependencies

- `react` — `useState`
