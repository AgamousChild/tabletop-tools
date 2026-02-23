export function getKFactor(gamesPlayed: number): number {
  return gamesPlayed < 30 ? 32 : 16
}

export function updateElo(
  winnerRating: number,
  loserRating: number,
  kFactor: number,
  isDraw: boolean,
): { newWinner: number; newLoser: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400))
  const expectedLoser = 1 - expectedWinner

  const actualWinner = isDraw ? 0.5 : 1
  const actualLoser = isDraw ? 0.5 : 0

  const newWinner = Math.round(winnerRating + kFactor * (actualWinner - expectedWinner))
  const newLoser = Math.round(loserRating + kFactor * (actualLoser - expectedLoser))

  return { newWinner, newLoser }
}
