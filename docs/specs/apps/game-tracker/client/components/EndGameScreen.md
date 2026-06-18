# apps/game-tracker/client/src/components/EndGameScreen.tsx

> Screen 5 — post-game summary with result card, VP breakdown, and stratagem history.

## Prompt

Write the end-game summary screen. Shows after a match is closed.

### Props

`matchId`, `onBack()`

### Data

`trpc.match.get.useQuery({ id: matchId })` — match with turns and secondaries

### Display sections

1. **Result card** — WIN/LOSS/DRAW with final scores, opponent display (name + faction if available)
2. **Per-round breakdown table** — for each turn: round number, your primary, their primary, your secondary, their secondary. V3 fields preferred over legacy (fall back: `yourPrimary ?? primaryScored`).
3. **VP totals** — sum of all rounds per player
4. **Secondary mission summary** — for each player: list of secondaries with VP per round
5. **CP summary** — total gained and spent per player across all rounds
6. **Unit casualties** — count of units destroyed by each player
7. **Photos** — if any rounds have photo URLs, show thumbnails

### Type handling

Turns and secondaries come as raw DB rows. Define local `Turn` and `Secondary` types matching the DB shape. Parse `vpPerRound` from JSON string to number array. Parse `yourUnitsDestroyed`/`theirUnitsDestroyed` from JSON strings.

## Dependencies

- `../lib/trpc` — `trpc`
