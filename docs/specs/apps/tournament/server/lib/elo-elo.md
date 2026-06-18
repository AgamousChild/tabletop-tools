# apps/tournament/server/src/lib/elo/elo.ts

> ELO rating calculation — standard chess-style with configurable K-factor.

## Prompt

Write two pure functions for ELO rating updates.

**`getKFactor(gamesPlayed)`**: Returns 32 for players with fewer than 30 games (provisional), 16 for established players.

**`updateElo(winnerRating, loserRating, kFactor, isDraw)`**: Standard ELO formula.
- Expected score: `1 / (1 + 10^((loserRating - winnerRating) / 400))`
- Actual score: 1 for win, 0.5 for draw
- New rating: `rating + K * (actual - expected)`, rounded to integer
- Returns `{ newWinner, newLoser }`

For draws, both sides use `actualScore = 0.5`.

## Dependencies

None — pure math.
