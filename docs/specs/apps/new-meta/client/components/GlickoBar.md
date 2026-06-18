# apps/new-meta/client/src/components/GlickoBar.tsx

> Glicko-2 rating display with uncertainty band indicator.

## Prompt

Write a single-row player rating display. Props: `rating`, `ratingDeviation`, `rank?`, `playerName`, `gamesPlayed`.

Display: optional rank (#N), player name (truncated), rating (mono font, bold), ±band (2×RD), games count.

Band color indicates rating certainty:
- <50 (narrow) → emerald-400 (confident)
- 50-150 (medium) → amber-400 (moderate)
- >150 (wide) → slate-400 (uncertain/new)

`displayRating = Math.round(rating)`, `band = Math.round(2 * ratingDeviation)`.

## Dependencies

None — pure presentational.
