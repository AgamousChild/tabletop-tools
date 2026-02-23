export type MatchResult = 'WIN' | 'LOSS' | 'DRAW'

/**
 * Derive the match result from final scores.
 * Pure function — no DB dependency.
 */
export function deriveResult(yourScore: number, theirScore: number): MatchResult {
  if (yourScore > theirScore) return 'WIN'
  if (yourScore < theirScore) return 'LOSS'
  return 'DRAW'
}
