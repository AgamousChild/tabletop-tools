# apps/new-meta/server/src/lib/aggregate.ts

> Pure analytics aggregation functions — compute meta stats from tournament records.

## Prompt

Write pure aggregation functions that compute meta analytics from `TournamentRecord[]`. No DB access.

### Types

**`FactionStat`**: faction, wins, losses, draws, games, winRate (0-1, draws count as 0.5), players (distinct entries), representationPct.

**`DetachmentStat`**: detachment, faction, wins, losses, draws, games, winRate, players.

**`MatchupCell`**: factionA, factionB, aWins, bWins, draws, totalGames, aWinRate.

### Functions

Aggregate functions that group by faction/detachment, compute win rates, matchup matrices, and time-series data from arrays of `TournamentRecord` and `TournamentPlayer` objects.

## Dependencies

- `@tabletop-tools/game-content` — `TournamentRecord`, `TournamentPlayer` (types)
