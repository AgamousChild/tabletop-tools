# apps/new-meta/server/src/lib/glicko2.ts

> Glicko-2 rating system implementation — validated against Glickman (2012) worked example.

## Prompt

Implement the full Glicko-2 rating algorithm per Glickman (2012). Pure function — no DB dependency.

### Constants

- `SCALE = 173.7178` — conversion factor between display and working scale
- `TAU = 0.5` — system constant controlling volatility change speed
- `EPSILON = 0.000001` — convergence criterion for Illinois algorithm

### Types

**`Glicko2Player`**: `{ rating: number (starts 1500), ratingDeviation: number (starts 350), volatility: number (starts 0.06) }`

**`Glicko2Game`**: `{ opponentRating, opponentRD, score (1=win, 0.5=draw, 0=loss) }`

**`Glicko2Result`**: `{ rating, ratingDeviation, volatility }`

### Function: `updateGlicko2(player, games): Glicko2Result`

Follow Glickman's 8-step algorithm:

1. Convert to working scale: `μ = (r - 1500) / SCALE`, `φ = RD / SCALE`
2. **No games**: increase RD only (`φ* = sqrt(φ² + σ²)`), return unchanged rating/volatility
3. Compute `g(φ)` and `E(μ, μj, φj)` for each opponent
4. Compute estimated variance `v = 1 / Σ(g²·E·(1-E))`
5. Compute `Δ = v · Σ(g·(s - E))` (performance delta)
6. Find new volatility `σ'` using the Illinois algorithm (iterative root-finding on the function `f(x)` — this is the most complex step)
7. Compute pre-rating-period RD: `φ* = sqrt(φ² + σ'²)`
8. Update: `φ' = 1/sqrt(1/φ*² + 1/v)`, `μ' = μ + φ'² · Σ(g·(s - E))`
9. Convert back to display scale

### Helper functions

- `toMu(r)` / `fromMu(μ)` — scale conversion
- `toPhi(rd)` / `toRD(φ)` — scale conversion
- `gPhi(φ)` — g function: `1 / sqrt(1 + 3·φ²/π²)`
- `eScore(μ, μj, φj, gj)` — expected score: `1 / (1 + exp(-gj·(μ - μj)))`

### Illinois algorithm for volatility

Iterative root-finding with guaranteed convergence. Start with bounds `a = ln(σ²)` and `b` (either from `Δ² - φ² - v` or by stepping down from `a`). Apply Illinois method until `|b - a| < ε`.

## Dependencies

None — pure math.
