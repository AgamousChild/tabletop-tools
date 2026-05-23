# apps/tournament/server/src/lib/standings/compute.ts

> Tournament standings computation with tiebreakers.

## Prompt

Write a standings computation function. Pure — no DB dependency.

### Types

**`PlayerStandingInput`**: id, displayName, faction, registeredAt.

**`ResultInput`**: player1Id, player2Id (nullable), player1Vp, player2Vp, result ('P1_WIN'|'P2_WIN'|'DRAW'|'BYE').

**`PlayerStanding`**: rank, id, displayName, faction, wins, losses, draws, totalVP, vpAgainst, margin, strengthOfSchedule.

### Function

**`computeStandings(players, results): PlayerStanding[]`**

1. Initialize a record map for each player: `{ wins, losses, draws, totalVP, vpAgainst, opponents[] }`.
2. Process results: BYE gives p1 a win (no VP). Otherwise accumulate VP for both sides, track opponents, assign W/L/D.
3. **Strength of Schedule (SOS)**: For each player, compute the average win percentage of all their opponents. `winPct = wins / gamesPlayed` per opponent.
4. **Sort order** (tiebreakers): wins DESC → margin DESC → SOS DESC → totalVP DESC → registeredAt ASC.
5. Assign rank (1-based) and return.

### Key detail

`margin = totalVP - vpAgainst`. BYE contributes 0 VP to margin (not a free VP source).

## Dependencies

None — pure functions only.
