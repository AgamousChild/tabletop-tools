# apps/tournament/client/src/components/ManageTournament.tsx

> TO management interface — tabbed view for players, cards, awards.

## Prompt

Write the tournament management component. TO-only interface with three tabs.

### Props

`tournamentId: string`, `onBack: () => void`

### Tabs

1. **Players tab** — List all registered players with active/dropped separation.
   - Active players: show name, faction, detachment, checked-in status, list preview
   - Per-player actions: "Remove" (drops player), "Card History" (view cross-tournament history), "Issue Card" (yellow/red)
   - Dropped players section: "Reinstate" button for each
   - "Seed Test Players" button (dev helper, inserts fake players)

2. **Cards tab** — List all issued cards for this tournament. Each shows: player name, card type (YELLOW/RED), reason, date. Issue card form: select player, select type, enter reason.

3. **Awards tab** — List all awards. Each shows: name, description, recipient (if assigned). Create form: name + description. Assign dropdown: select from registered players.

### Mutations

- `trpc.card.issue.useMutation()` — issue card, refetch cards list
- `trpc.award.create.useMutation()` — create award, refetch awards
- `trpc.award.assign.useMutation()` — assign recipient, refetch awards
- `trpc.player.removePlayer.useMutation()` — drop player, refetch players
- `trpc.player.reinstate.useMutation()` — un-drop player, refetch players
- `trpc.player.seedTestPlayers.useMutation()` — insert test players

### Card history

When TO clicks "Card History" on a player, load `trpc.card.playerHistory.useQuery({ playerId }, { enabled: !!historyPlayerId })`. Show all cards across all tournaments for that user.

## Dependencies

- `react` — `useState`
- `../lib/trpc` — `trpc`
