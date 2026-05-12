# Fix OverRep Calculation (#50)

## Problem

OverRep values in meta_top are displaying incorrectly on the dashboard.

## Current Logic (build-cube.ts)

```typescript
const expectedPct = 1.0 / factions.length  // e.g. 1/23 = 4.35%
const overRep = expectedPct > 0 ? playerPct / expectedPct : 0
```

This divides actual representation by expected (uniform) representation. A faction with 4.35% of players gets overRep = 1.0. A faction with 8.7% gets 2.0.

## Issues

1. **The denominator uses total faction count from dim_faction (23)** — but not all 23 factions appear in every frame. A quarter with only 20 active factions should use 1/20, not 1/23.
2. **The display shows raw ratio** — 4.89 for Space Marines means 489% of expected. The FactionTable shows this as "489%" which is confusing. Should be displayed as a multiplier: "4.9x".
3. **Historical data in the cube is stale** — historical overRep values will be wrong until the cube is rebuilt with the corrected formula.

## Fix

1. In `build-cube.ts`, count active factions per frame (factions with at least 1 player), not total `dim_faction` rows
2. In `FactionTable.tsx`, display as multiplier: "4.9x" (not a percentage)
3. Add a unit test for the active-faction-count calculation
4. After deploying, rebuild the cube — historical data is corrected on rebuild

## Estimated effort

30 min — fix cube builder calc, rebuild cube, update display component.
