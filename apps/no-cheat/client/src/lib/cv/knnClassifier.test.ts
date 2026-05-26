import { describe, expect, it } from 'vitest'

import { classifyKnn, type TrainingExample } from './knnClassifier'

function makeExample(features: number[], label: number): TrainingExample {
  return { features, label }
}

describe('classifyKnn', () => {
  it('returns null when examples array is empty', () => {
    const result = classifyKnn([1, 2, 3], [], 3)
    expect(result).toBeNull()
  })

  it('returns the only example label when k=1 and 1 example', () => {
    const examples = [makeExample([1, 0, 0], 4)]
    const result = classifyKnn([1, 0, 0], examples, 1)
    expect(result).toEqual({ label: 4, confidence: 1.0 })
  })

  it('returns correct majority vote with k=3 and mixed labels', () => {
    // Query at origin; 3 nearest neighbors labeled 2, 2, 5
    const examples = [
      makeExample([1, 0, 0], 2), // distance 1
      makeExample([2, 0, 0], 2), // distance 2
      makeExample([3, 0, 0], 5), // distance 3
      makeExample([10, 0, 0], 1), // distance 10 — too far, not in top 3
    ]
    const result = classifyKnn([0, 0, 0], examples, 3)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(2)
    expect(result!.confidence).toBeCloseTo(2 / 3)
  })

  it('returns confidence 1.0 when all k neighbors agree', () => {
    const examples = [makeExample([1, 0], 3), makeExample([2, 0], 3), makeExample([3, 0], 3)]
    const result = classifyKnn([0, 0], examples, 3)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(3)
    expect(result!.confidence).toBe(1.0)
  })

  it('returns confidence 2/3 when 2 of 3 agree', () => {
    const examples = [makeExample([1, 0], 6), makeExample([2, 0], 6), makeExample([3, 0], 1)]
    const result = classifyKnn([0, 0], examples, 3)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(6)
    expect(result!.confidence).toBeCloseTo(2 / 3)
  })

  it('handles case where fewer examples than k (uses all available)', () => {
    const examples = [makeExample([1, 0], 5), makeExample([2, 0], 5)]
    // k=3 but only 2 examples — should use all 2
    const result = classifyKnn([0, 0], examples, 3)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(5)
    expect(result!.confidence).toBe(1.0)
  })

  it('uses Euclidean distance', () => {
    // Place query at (3, 4). Example A at origin = distance 5.
    // Example B at (3, 4.1) = distance 0.1. B should be nearest.
    const examples = [
      makeExample([0, 0], 1), // distance = 5
      makeExample([3, 4.1], 2), // distance = 0.1
    ]
    const result = classifyKnn([3, 4], examples, 1)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(2)
  })

  it('breaks ties by closest distance', () => {
    // k=4: two label-1 neighbors and two label-2 neighbors (2-2 tie)
    // The closest neighbor overall is label 1, so label 1 should win
    const examples = [
      makeExample([1, 0], 1), // distance 1 — closest
      makeExample([2, 0], 2), // distance 2
      makeExample([3, 0], 2), // distance 3
      makeExample([4, 0], 1), // distance 4
    ]
    const result = classifyKnn([0, 0], examples, 4)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(1)
    expect(result!.confidence).toBe(0.5)
  })

  it('breaks ties by closest distance — second label wins when closer', () => {
    // k=4: two label-1 neighbors and two label-2 neighbors (2-2 tie)
    // The closest neighbor overall is label 2, so label 2 should win
    const examples = [
      makeExample([1, 0], 2), // distance 1 — closest, label 2
      makeExample([2, 0], 1), // distance 2
      makeExample([3, 0], 1), // distance 3
      makeExample([4, 0], 2), // distance 4
    ]
    const result = classifyKnn([0, 0], examples, 4)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(2)
    expect(result!.confidence).toBe(0.5)
  })

  it('defaults k to 3', () => {
    const examples = [
      makeExample([1, 0], 4),
      makeExample([2, 0], 4),
      makeExample([3, 0], 4),
      makeExample([10, 0], 6),
      makeExample([11, 0], 6),
      makeExample([12, 0], 6),
      makeExample([13, 0], 6),
    ]
    // Without explicit k, should use k=3, picking the 3 nearest (all label 4)
    const result = classifyKnn([0, 0], examples)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(4)
    expect(result!.confidence).toBe(1.0)
  })

  it('works with 12-dimensional feature vectors', () => {
    // Simulating real 12-element feature vectors
    const queryFeatures = [3, 0, 3, 2, 0.05, 0.85, 10, 0.45, 0.12, 0.55, 1.0, 0.64]
    const examples = [
      makeExample([3, 0, 3, 2, 0.05, 0.85, 10, 0.45, 0.12, 0.55, 1.0, 0.64], 3), // exact match
      makeExample([5, 1, 5, 4, 0.08, 0.8, 15, 0.4, 0.15, 0.6, 0.98, 0.62], 5),
      makeExample([1, 0, 1, 1, 0.02, 0.9, 5, 0.5, 0.1, 0.5, 1.02, 0.66], 1),
    ]
    const result = classifyKnn(queryFeatures, examples, 1)
    expect(result).not.toBeNull()
    expect(result!.label).toBe(3) // exact match is nearest
    expect(result!.confidence).toBe(1.0)
  })
})
