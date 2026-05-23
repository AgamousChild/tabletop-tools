# apps/game-tracker/server/src/lib/scoring/result.ts

> Pure function — derive WIN/LOSS/DRAW from final VP scores.

## Prompt

Export a type `MatchResult = 'WIN' | 'LOSS' | 'DRAW'` and a pure function `deriveResult(yourScore: number, theirScore: number): MatchResult`. Returns WIN if your score is higher, LOSS if lower, DRAW if equal.

## Dependencies

None.
