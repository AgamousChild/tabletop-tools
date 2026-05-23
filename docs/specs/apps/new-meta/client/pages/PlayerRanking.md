# apps/new-meta/client/src/pages/PlayerRanking.tsx

> Glicko-2 leaderboard with search.

## Prompt

Show ranked player list and search. Uses `trpc.player.leaderboard.useQuery({ limit, minGames })` and `trpc.player.search.useQuery({ name }, { enabled: !!searchTerm })`. Renders `GlickoBar` for each player. Clickable rows → player profile.

Props: `onPlayerSelect(id: string)`.
