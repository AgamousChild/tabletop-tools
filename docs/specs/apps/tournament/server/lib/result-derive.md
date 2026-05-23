# apps/tournament/server/src/lib/result/derive.ts

> Derive pairing result from VP scores — P1_WIN, P2_WIN, or DRAW.

## Prompt

Export type `PairingResult = 'P1_WIN' | 'P2_WIN' | 'DRAW'` and function `deriveResult(p1VP, p2VP): PairingResult`. Higher VP wins.

Same concept as game-tracker's `deriveResult` but returns P1_WIN/P2_WIN instead of WIN/LOSS (because it's from a neutral perspective, not "your" score).

## Dependencies

None.
