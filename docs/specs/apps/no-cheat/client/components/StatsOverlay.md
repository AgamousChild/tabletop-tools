# apps/no-cheat/client/src/components/StatsOverlay.tsx

> Real-time statistical display — Z-score, chi-squared, verdict, and distribution chart.

## Prompt

Write a component that displays live dice analysis statistics below the camera feed.

### Props

`rollCount`, `zScore: number | null`, `chiSquared: number | null`, `distribution: Map<number, number>`

### Verdict logic

`getVerdict(zScore)`: Returns `{ text, color }`:
- `|Z| < 1.65` → FAIR (emerald-400)
- `|Z| < 2.58` → SUSPECT (amber-400)
- `|Z| >= 2.58` → LOADED (red-400)
- null → "Waiting..." (slate-400)

### Layout

1. Stats bar (semi-transparent slate-900/90 background): Z-score value, chi-squared value, verdict badge
2. Roll count text
3. `<DistributionChart distribution={distribution} />`

## Dependencies

- `./DistributionChart`
