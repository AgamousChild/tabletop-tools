# apps/admin/client/src/pages/ImportsPage.tsx

> Recent meta events (imported tournaments) with faction distribution.

## Prompt

Show recent events from `trpc.stats.recentEvents.useQuery()` and top factions from `trpc.stats.topFactions.useQuery()`. Events table: name, date, location, player count, source. Faction ranking table: faction name, registration count.
