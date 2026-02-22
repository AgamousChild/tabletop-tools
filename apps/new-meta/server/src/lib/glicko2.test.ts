import { describe, it, expect } from 'vitest'
import { updateGlicko2 } from './glicko2.js'

// ============================================================
// Tests against Glickman (2012) worked example
// http://www.glicko.net/glicko/glicko2.pdf
//
// Player: r=1500, RD=200, σ=0.06
// Games:
//   Opponent 1: r=1400, RD=30,  s=1 (win)
//   Opponent 2: r=1550, RD=100, s=0 (loss)
//   Opponent 3: r=1700, RD=300, s=0 (loss)
//
// Expected results (from Glickman 2012):
//   r'  ≈ 1464.06
//   RD' ≈ 151.52
//   σ'  ≈ 0.05999
// ============================================================

const PLAYER = { rating: 1500, ratingDeviation: 200, volatility: 0.06 }

const GAMES = [
  { opponentRating: 1400, opponentRD: 30,  score: 1 },
  { opponentRating: 1550, opponentRD: 100, score: 0 },
  { opponentRating: 1700, opponentRD: 300, score: 0 },
]

describe('updateGlicko2 — Glickman worked example', () => {
  it('produces the correct rating', () => {
    const result = updateGlicko2(PLAYER, GAMES)
    expect(result.rating).toBeCloseTo(1464.06, 1)
  })

  it('produces the correct rating deviation', () => {
    const result = updateGlicko2(PLAYER, GAMES)
    expect(result.ratingDeviation).toBeCloseTo(151.52, 1)
  })

  it('produces the correct volatility', () => {
    const result = updateGlicko2(PLAYER, GAMES)
    expect(result.volatility).toBeCloseTo(0.05999, 4)
  })
})

describe('updateGlicko2 — inactivity (no games)', () => {
  it('only increases RD when no games played', () => {
    const player = { rating: 1500, ratingDeviation: 200, volatility: 0.06 }
    const result = updateGlicko2(player, [])
    // RD should grow: sqrt(200² + 0.06²*173.7178²) ≈ 200.something
    expect(result.rating).toBe(1500)
    expect(result.ratingDeviation).toBeGreaterThan(200)
    // Volatility unchanged
    expect(result.volatility).toBeCloseTo(0.06)
  })
})

describe('updateGlicko2 — edge cases', () => {
  it('handles a single win against equal opponent', () => {
    const player = { rating: 1500, ratingDeviation: 350, volatility: 0.06 }
    const result = updateGlicko2(player, [
      { opponentRating: 1500, opponentRD: 350, score: 1 },
    ])
    // Winning against equal opponent should increase rating above 1500
    expect(result.rating).toBeGreaterThan(1500)
    // RD should decrease from 350
    expect(result.ratingDeviation).toBeLessThan(350)
  })

  it('handles a single loss against equal opponent', () => {
    const player = { rating: 1500, ratingDeviation: 350, volatility: 0.06 }
    const result = updateGlicko2(player, [
      { opponentRating: 1500, opponentRD: 350, score: 0 },
    ])
    // Losing against equal opponent should decrease rating below 1500
    expect(result.rating).toBeLessThan(1500)
    expect(result.ratingDeviation).toBeLessThan(350)
  })

  it('produces symmetric results for wins and losses against equal opponents', () => {
    const player = { rating: 1500, ratingDeviation: 350, volatility: 0.06 }
    const winResult = updateGlicko2(player, [
      { opponentRating: 1500, opponentRD: 350, score: 1 },
    ])
    const lossResult = updateGlicko2(player, [
      { opponentRating: 1500, opponentRD: 350, score: 0 },
    ])
    // Win gain == loss drop (symmetric around 1500)
    expect(winResult.rating - 1500).toBeCloseTo(1500 - lossResult.rating, 5)
    expect(winResult.ratingDeviation).toBeCloseTo(lossResult.ratingDeviation, 5)
  })

  it('rating deviation is always positive', () => {
    const player = { rating: 1500, ratingDeviation: 200, volatility: 0.06 }
    const result = updateGlicko2(player, GAMES)
    expect(result.ratingDeviation).toBeGreaterThan(0)
  })

  it('volatility remains positive and reasonable', () => {
    const result = updateGlicko2(PLAYER, GAMES)
    expect(result.volatility).toBeGreaterThan(0)
    expect(result.volatility).toBeLessThan(1)
  })
})
