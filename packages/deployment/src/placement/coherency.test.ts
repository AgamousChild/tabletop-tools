import { describe, it, expect } from 'vitest'
import { baseSizeInches, isCoherent } from './coherency'
import { DEFAULT_10E_RULES } from '../types'

// ── baseSizeInches ────────────────────────────────────────────────────────────

describe('baseSizeInches', () => {
  it('converts 25mm to ~1"', () => {
    expect(baseSizeInches(25)).toBeCloseTo(0.984, 2)
  })

  it('converts 28mm to ~1.1"', () => {
    expect(baseSizeInches(28)).toBeCloseTo(1.102, 2)
  })

  it('converts 32mm to ~1.26"', () => {
    expect(baseSizeInches(32)).toBeCloseTo(1.26, 2)
  })

  it('converts 40mm to ~1.57"', () => {
    expect(baseSizeInches(40)).toBeCloseTo(1.575, 2)
  })

  it('converts 50mm to ~1.97"', () => {
    expect(baseSizeInches(50)).toBeCloseTo(1.969, 2)
  })

  it('converts 60mm to ~2.36"', () => {
    expect(baseSizeInches(60)).toBeCloseTo(2.362, 2)
  })

  it('converts 80mm to ~3.15"', () => {
    expect(baseSizeInches(80)).toBeCloseTo(3.15, 2)
  })

  it('returns 2.95" for oval-75x42 (larger dimension 75mm)', () => {
    expect(baseSizeInches('oval-75x42')).toBeCloseTo(2.953, 2)
  })

  it('returns 3" for hull', () => {
    expect(baseSizeInches('hull')).toBe(3)
  })
})

// ── isCoherent ────────────────────────────────────────────────────────────────

describe('isCoherent', () => {
  const rules = DEFAULT_10E_RULES
  // coherency: distance=2, minConnections=1, minConnectionsLarge=2, largeUnitThreshold=7

  it('returns true for a single model', () => {
    expect(isCoherent([{ x: 0, y: 0 }], rules)).toBe(true)
  })

  it('returns true for 5 models in a line 1.5" apart (each has 1+ neighbor)', () => {
    const positions = [0, 1, 2, 3, 4].map((i) => ({ x: i * 1.5, y: 0 }))
    expect(isCoherent(positions, rules)).toBe(true)
  })

  it('returns false for 5 models in a line 3" apart (too far apart)', () => {
    const positions = [0, 1, 2, 3, 4].map((i) => ({ x: i * 3, y: 0 }))
    expect(isCoherent(positions, rules)).toBe(false)
  })

  it('returns false for 10 models in single-file line 1.5" apart (middle models only have 1 neighbor, need 2)', () => {
    // Large unit (>=7): each model needs 2 neighbors. End models only have 1.
    const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ x: i * 1.5, y: 0 }))
    expect(isCoherent(positions, rules)).toBe(false)
  })

  it('returns true for 10 models in a 2x5 block 1.5" apart', () => {
    // Row 0: y=0, x=0,1.5,3,4.5,6
    // Row 1: y=1.5, x=0,1.5,3,4.5,6
    // Every non-corner model has 3-4 neighbors; corners have 2 neighbors.
    const positions: { x: number; y: number }[] = []
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        positions.push({ x: col * 1.5, y: row * 1.5 })
      }
    }
    expect(isCoherent(positions, rules)).toBe(true)
  })

  it('returns true for 10 models in dog-bone formation', () => {
    // 3 clustered at left end (close together), 4 in chain, 3 clustered at right end
    // Left cluster at x=0: (0,0), (1.3,0), (0.65,1.0)
    // Chain: x=2.1, x=3.9, x=5.7, x=7.5 all at y=0 (1.8" spacing)
    // Right cluster at x=8.5+: (8.8,0), (10.1,0), (9.45,1.0)
    const positions = [
      // left cluster (3)
      { x: 0, y: 0 },
      { x: 1.3, y: 0 },
      { x: 0.65, y: 1.0 },
      // chain (4 models connecting the clusters, 1.8" apart)
      { x: 2.8, y: 0 },
      { x: 4.6, y: 0 },
      { x: 6.4, y: 0 },
      { x: 8.2, y: 0 },
      // right cluster (3)
      { x: 9.5, y: 0 },
      { x: 10.8, y: 0 },
      { x: 10.15, y: 1.0 },
    ]
    expect(isCoherent(positions, rules)).toBe(true)
  })

  it('returns false for 0 models', () => {
    // Edge case: empty array
    expect(isCoherent([], rules)).toBe(false)
  })

  it('returns true for 2 models within 2" of each other', () => {
    expect(isCoherent([{ x: 0, y: 0 }, { x: 1.5, y: 0 }], rules)).toBe(true)
  })

  it('returns false for 2 models exactly 2" apart (exclusive boundary)', () => {
    // distance exactly 2" — NOT connected (must be strictly less than coherency distance)
    expect(isCoherent([{ x: 0, y: 0 }, { x: 2, y: 0 }], rules)).toBe(false)
  })
})
