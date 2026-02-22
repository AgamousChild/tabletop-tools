import { describe, expect, it } from 'vitest'

import { analyze } from './analyze'

// Helper: generate rolls with a uniform distribution across faces 1–6
function uniformRolls(totalRolls: number): number[][] {
  const rolls: number[][] = []
  for (let i = 0; i < totalRolls; i++) {
    // Cycle evenly through faces 1–6
    rolls.push([(i % 6) + 1])
  }
  return rolls
}

describe('analyze', () => {
  describe('return shape', () => {
    it('returns zScore, isLoaded, and confidence', () => {
      const result = analyze(uniformRolls(60))
      expect(typeof result.zScore).toBe('number')
      expect(typeof result.isLoaded).toBe('boolean')
      expect(typeof result.confidence).toBe('string')
    })
  })

  describe('fair dice', () => {
    it('returns isLoaded=false for a perfectly uniform distribution', () => {
      // 60 rolls: exactly 10 of each face
      const result = analyze(uniformRolls(60))
      expect(result.isLoaded).toBe(false)
    })

    it('returns a low z-score for a uniform distribution', () => {
      const result = analyze(uniformRolls(60))
      expect(result.zScore).toBeLessThan(2.5)
    })

    it('returns confidence=high when there are 30+ rolls', () => {
      const result = analyze(uniformRolls(60))
      expect(result.confidence).toBe('high')
    })
  })

  describe('loaded dice', () => {
    it('returns isLoaded=true when one face appears ~50% of the time over 60 rolls', () => {
      // 30 sixes out of 60 rolls = 50% (expected ~16.7%)
      const rolls: number[][] = [
        ...Array(30).fill([6]),
        ...Array(6).fill([1]),
        ...Array(6).fill([2]),
        ...Array(6).fill([3]),
        ...Array(6).fill([4]),
        ...Array(6).fill([5]),
      ]
      const result = analyze(rolls)
      expect(result.isLoaded).toBe(true)
    })

    it('returns a high z-score when one face is heavily favoured', () => {
      const rolls: number[][] = [
        ...Array(30).fill([6]),
        ...Array(6).fill([1]),
        ...Array(6).fill([2]),
        ...Array(6).fill([3]),
        ...Array(6).fill([4]),
        ...Array(6).fill([5]),
      ]
      const result = analyze(rolls)
      expect(result.zScore).toBeGreaterThanOrEqual(2.5)
    })
  })

  describe('insufficient data', () => {
    it('returns confidence=low when fewer than 30 rolls are provided', () => {
      const result = analyze(uniformRolls(10))
      expect(result.confidence).toBe('low')
    })

    it('returns confidence=medium when between 30 and 59 rolls are provided', () => {
      const result = analyze(uniformRolls(30))
      expect(result.confidence).toBe('medium')
    })

    it('does not flag as loaded when there are too few rolls to be certain', () => {
      // Even biased, 5 rolls isn't enough to call loaded
      const result = analyze([[6], [6], [6], [6], [6]])
      expect(result.isLoaded).toBe(false)
    })
  })

  describe('multi-die rolls', () => {
    it('handles rolls containing multiple dice values', () => {
      // Each roll captures 4 dice at once — still 60 total pip readings
      const roll4 = [1, 2, 3, 4]
      const rolls = Array(15).fill(roll4)
      const result = analyze(rolls)
      expect(typeof result.zScore).toBe('number')
      expect(typeof result.isLoaded).toBe('boolean')
    })
  })

  describe('edge cases', () => {
    it('returns isLoaded=false and confidence=low for empty input', () => {
      const result = analyze([])
      expect(result.isLoaded).toBe(false)
      expect(result.confidence).toBe('low')
    })

    it('handles rolls with only one face value gracefully', () => {
      // All rolls are [1] — extreme bias but only 5 rolls
      const result = analyze([[1], [1], [1], [1], [1]])
      expect(result.isLoaded).toBe(false) // too few to call
    })
  })

  describe('outlier face', () => {
    it('returns outlierFace and observedRate in the result', () => {
      const result = analyze(uniformRolls(60))
      expect(typeof result.outlierFace).toBe('number')
      expect(result.outlierFace).toBeGreaterThanOrEqual(1)
      expect(result.outlierFace).toBeLessThanOrEqual(6)
      expect(typeof result.observedRate).toBe('number')
    })

    it('identifies face 6 as the outlier when rolls are biased toward 6', () => {
      const rolls: number[][] = [
        ...Array(30).fill([6]),
        ...Array(6).fill([1]),
        ...Array(6).fill([2]),
        ...Array(6).fill([3]),
        ...Array(6).fill([4]),
        ...Array(6).fill([5]),
      ]
      const result = analyze(rolls)
      expect(result.outlierFace).toBe(6)
    })

    it('observedRate reflects the actual proportion of the outlier face', () => {
      // 30 sixes out of 60 total = 50%
      const rolls: number[][] = [
        ...Array(30).fill([6]),
        ...Array(6).fill([1]),
        ...Array(6).fill([2]),
        ...Array(6).fill([3]),
        ...Array(6).fill([4]),
        ...Array(6).fill([5]),
      ]
      const result = analyze(rolls)
      expect(result.observedRate).toBeCloseTo(0.5, 2)
    })

    it('returns outlierFace=0 and observedRate=0 when there is insufficient data', () => {
      const result = analyze(uniformRolls(5))
      expect(result.outlierFace).toBe(0)
      expect(result.observedRate).toBe(0)
    })
  })
})
