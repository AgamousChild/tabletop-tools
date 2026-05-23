# apps/no-cheat/client/src/components/DistributionChart.tsx

> Visual pip frequency distribution — horizontal bars for each face value 1-6.

## Prompt

Write a component that shows the observed frequency distribution of pip values as horizontal bars.

### Props

`distribution: Map<number, number>` — pip value → count

### Rendering

For each pip value 1-6:
1. Get count from map (default 0)
2. Compute percentage: `count / total * 100`
3. Color logic: if total < 6, all amber (insufficient data). Otherwise: >5% above expected (100/6 ≈ 16.7%) → red, >5% below → blue, within range → emerald.
4. Render: pip number | progress bar (width = percentage%) | count | percentage text

## Dependencies

None — pure presentational.
