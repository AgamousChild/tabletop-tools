export type PairingResult = 'P1_WIN' | 'P2_WIN' | 'DRAW'

export function deriveResult(p1VP: number, p2VP: number): PairingResult {
  if (p1VP > p2VP) return 'P1_WIN'
  if (p2VP > p1VP) return 'P2_WIN'
  return 'DRAW'
}
