# apps/new-meta/client/src/pages/FactionDetail.tsx

> Deep dive into one faction — stats, detachments, timeline, top lists.

## Prompt

Show detailed faction analytics. Uses `trpc.meta.faction.useQuery({ factionId, frame })`. Display: faction headline stats (win rate, games, players, event placements), detachment breakdown table, weekly win rate timeline chart, and top 20 army lists with placement and event info.

Props: `factionId: string`, `onBack()`.
