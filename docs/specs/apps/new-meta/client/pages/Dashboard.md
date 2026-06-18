# apps/new-meta/client/src/pages/Dashboard.tsx (implied)

> Main dashboard — faction win rate table + matchup matrix with frame selector.

## Prompt

Show the meta overview dashboard. Uses `trpc.meta.factions.useQuery({ frame })` and `trpc.meta.matchups.useQuery({ frame })`. Includes a `MetaWindowSelector` to pick the time frame. Renders `FactionTable` (clickable rows → faction detail) and `MatchupMatrix`.

## Dependencies

- `../lib/trpc` — `trpc`
- `../components/FactionTable`, `MatchupMatrix`, `MetaWindowSelector`
