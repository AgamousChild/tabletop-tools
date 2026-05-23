# apps/list-builder/server/src/lib/ratings/score.ts

> Pure rating computation — no DB dependency. Assigns S/A/B/C/D tiers from match records.

## Prompt

Write a pure function module for computing unit meta ratings from match records. No database access — takes arrays in, returns arrays out.

### Types

**`MatchRecord`**: `unitIds: string[]` (units in the list), `won: boolean`, optional `unitPoints: Record<string, number>` (points per unit at time of match).

**`UnitRatingResult`**: `unitContentId`, `rating` ('S'|'A'|'B'|'C'|'D'), `winContrib` (0-1 win rate), `ptsEff` (wins per 100 points), `metaWindow`, `computedAt`.

### Constants

`MIN_APPEARANCES = 3` — units with fewer than 3 games are not rated.

### Functions

**`assignGrade(winContrib: number): 'S'|'A'|'B'|'C'|'D'`** — Grade thresholds based on 40K tournament win rates:
- >= 0.75 → S (dominant)
- >= 0.60 → A (strong)
- >= 0.45 → B (average)
- >= 0.30 → C (below average)
- < 0.30 → D (weak)

**`computeRatings(records: MatchRecord[], metaWindow: string): UnitRatingResult[]`** — Aggregate per-unit stats across all records:
1. For each record, iterate over `unitIds` and accumulate `wins` and `games` for each unit
2. If `unitPoints` is available, also accumulate total points and count of games with point data
3. Skip units with `games < MIN_APPEARANCES`
4. Compute `winContrib = wins / games`
5. Compute `ptsEff = (winContrib / avgPoints) * 100` where `avgPoints` defaults to 100 if no point data
6. Assign grade via `assignGrade(winContrib)`
7. Set `computedAt = Date.now()`

## Dependencies

None — pure functions only.
