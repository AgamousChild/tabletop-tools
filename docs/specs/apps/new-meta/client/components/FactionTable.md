# apps/new-meta/client/src/components/FactionTable.tsx

> Sortable faction stats table with win rate, games, events, representation.

## Prompt

Write a data table component for faction meta statistics. Takes `stats: FactionStat[]` and optional `onSelect(factionId)`.

Columns: Faction name (clickable if onSelect), Win%, Games, Players, Events won, Top4, Representation%. Win rate displayed as percentage with color coding (>55% green, <45% red). Empty state: "No data yet."

Uses standard table layout with slate-800 borders, slate-400 header text.

## Dependencies

None — pure presentational.
