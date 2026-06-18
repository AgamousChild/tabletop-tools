# apps/new-meta/client/src/pages/SourceData.tsx

> Tournament data browser — list all imported tournaments with details.

## Prompt

Show imported tournament list. Uses `trpc.source.tournaments.useQuery({ format, limit })`. Each row shows event name, date, format, location, player count, winner faction. Clickable → tournament detail page.

Props: `onTournamentSelect(eventId: string)`.
