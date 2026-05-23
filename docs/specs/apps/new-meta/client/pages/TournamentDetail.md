# apps/new-meta/client/src/pages/TournamentDetail.tsx

> Single tournament results — player standings, army lists, win distribution.

## Prompt

Show detailed tournament results. Uses `trpc.source.tournament.useQuery({ eventId })`. Display: event info header, player standings table (placement, name, faction, detachment, W/L/D, list text), win distribution chart.

Props: `importId: string`, `onBack()`.
