# apps/new-meta/client/src/components/MatchupMatrix.tsx

> Faction-vs-faction win rate grid with color-coded cells.

## Prompt

Write a matrix visualization for faction matchup win rates. Takes `cells: MatchupCell[]`.

Build a symmetric matrix: extract unique factions, create a lookup Map keyed by `"factionA::factionB"`. For the reverse direction, use `1 - aWinRate`. Diagonal is empty.

Cell color logic:
- >60% → deep green (emerald-900/40)
- >55% → light green (emerald-900/20)
- <40% → deep red (red-900/40)
- <45% → light red (red-900/20)
- 45-55% → neutral (slate-800/50)
- undefined → dark gray

Display as percentage. Scrollable horizontally for many factions.

## Dependencies

None — pure presentational.
