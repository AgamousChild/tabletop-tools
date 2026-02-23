import { describe, expect, it } from 'vitest'

import { getKFactor, updateElo } from './elo'

describe('getKFactor', () => {
  it('returns 32 for new players (fewer than 30 games)', () => {
    expect(getKFactor(0)).toBe(32)
    expect(getKFactor(1)).toBe(32)
    expect(getKFactor(29)).toBe(32)
  })

  it('returns 16 for established players (30 or more games)', () => {
    expect(getKFactor(30)).toBe(16)
    expect(getKFactor(100)).toBe(16)
  })
})

describe('updateElo', () => {
  it('winner gains points when winning from equal ratings', () => {
    const { newWinner, newLoser } = updateElo(1200, 1200, 32, false)
    expect(newWinner).toBeGreaterThan(1200)
    expect(newLoser).toBeLessThan(1200)
  })

  it('total rating is conserved (zero-sum)', () => {
    const before = 1200 + 1200
    const { newWinner, newLoser } = updateElo(1200, 1200, 32, false)
    expect(newWinner + newLoser).toBe(before)
  })

  it('returns 0.5 score for draw (both sides)', () => {
    const { newWinner, newLoser } = updateElo(1200, 1200, 32, true)
    // equal ratings + draw = no change (or 0)
    expect(newWinner).toBe(1200)
    expect(newLoser).toBe(1200)
  })

  it('higher-rated winner gains fewer points (expected to win)', () => {
    const { newWinner: highWin } = updateElo(1600, 1200, 32, false)
    const { newWinner: evenWin } = updateElo(1200, 1200, 32, false)
    const highGain = highWin - 1600
    const evenGain = evenWin - 1200
    expect(highGain).toBeLessThan(evenGain)
  })

  it('lower-rated winner gains more points (upset)', () => {
    const { newWinner } = updateElo(1200, 1600, 32, false)
    const gain = newWinner - 1200
    expect(gain).toBeGreaterThan(16)
  })

  it('total rating is conserved at different ratings', () => {
    const w = 1500
    const l = 1100
    const { newWinner, newLoser } = updateElo(w, l, 32, false)
    expect(newWinner + newLoser).toBe(w + l)
  })

  it('respects K-factor: smaller K = smaller changes', () => {
    const { newWinner: bigK } = updateElo(1200, 1200, 32, false)
    const { newWinner: smallK } = updateElo(1200, 1200, 16, false)
    expect(bigK - 1200).toBeGreaterThan(smallK - 1200)
  })

  it('returns rounded integers', () => {
    const { newWinner, newLoser } = updateElo(1201, 1199, 32, false)
    expect(Number.isInteger(newWinner)).toBe(true)
    expect(Number.isInteger(newLoser)).toBe(true)
  })
})
