# apps/no-cheat/server/src/lib/stats/analyze.ts

> Statistical engine — Z-score and chi-squared analysis for loaded dice detection.

## Prompt

Write a pure statistical analysis function for detecting loaded dice from observed pip frequency data.

### Constants

- `FACES = [1, 2, 3, 4, 5, 6]`
- `EXPECTED_FREQ = 1/6` (~0.1667)
- `LOW_THRESHOLD = 30` — minimum total pip readings for analysis
- `HIGH_THRESHOLD = 60` — threshold for "high confidence" label
- `Z_THRESHOLD = 2.5` — z-score at or above triggers loaded flag (~p < 0.012 one-tailed)

### AnalysisResult type

```typescript
{
  zScore: number        // worst-case z-score across all faces
  isLoaded: boolean
  confidence: 'low' | 'medium' | 'high'
  outlierFace: number   // face 1-6 with highest deviation (0 if insufficient data)
  observedRate: number   // observed proportion of outlier face (0 if insufficient data)
}
```

### Function: `analyze(rolls: number[][]): AnalysisResult`

1. **Flatten** all rolls: each roll is an array of pips captured in one photo (e.g., [3, 5, 2] for three dice)
2. **Confidence check**: if total pips < 30, return zScore=0, isLoaded=false, confidence='low'
3. **Count frequencies** per face (1-6)
4. **Z-score per face**: `(observed_proportion - expected_proportion) / sqrt(p*(1-p)/n)` where `p = 1/6`
5. **Worst-case Z-score**: max of absolute z-scores across all faces
6. **Identify outlier**: the face with the highest deviation
7. **Chi-squared goodness-of-fit**: `Σ((observed - expected)² / expected)` for all 6 faces. Critical value at p=0.05, df=5 is 11.07.
8. **Verdict**: `isLoaded = maxZ >= 2.5 OR chiSq > 11.07`
9. Round zScore to 2 decimal places, observedRate to 3.

### Key design decisions

- Conservative threshold (2.5, not 1.96) to avoid false positives — better to miss a subtle loaded die than to accuse a fair one
- Chi-squared as backup: catches uniform-but-shifted distributions that Z-score might miss
- Confidence label is for UI display only, not used in the loaded determination

## Dependencies

None — pure math.
