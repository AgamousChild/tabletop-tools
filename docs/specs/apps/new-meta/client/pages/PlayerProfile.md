# apps/new-meta/client/src/pages/PlayerProfile.tsx

> Individual player's Glicko-2 history and tournament results.

## Prompt

Show one player's rating profile. Uses `trpc.player.profile.useQuery({ playerId })`. Display: current rating with uncertainty band, rating history chart (rating over time with each tournament as a point), list of rating periods (tournament name, games, delta).

Props: `playerId: string`, `onBack()`.
