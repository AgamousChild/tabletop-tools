import { describe, expect, it } from 'vitest'

import { addToCluster, findBestCluster, labelCluster } from './cluster'
import type { Cluster } from './cluster'

const SIZE = 64

/** Solid-color 64×64 grayscale image */
function solid(value: number): Uint8Array {
  return new Uint8Array(SIZE * SIZE).fill(value)
}

/** Circle at (cx, cy) radius r */
function circle(cx: number, cy: number, r: number): Uint8Array {
  const img = new Uint8Array(SIZE * SIZE).fill(0)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img[y * SIZE + x] = 255
    }
  }
  return img
}

// Trivial similarity function: just compares first byte.
// Returns 0 if identical first byte, 1 otherwise. Used to control test outcomes.
function trivialSimilarity(a: Uint8Array, b: Uint8Array): number {
  return a[0] === b[0] ? 0 : 1
}

// Two "images" with distinct first bytes
const imgA = (() => { const a = solid(0); a[0] = 10; return a })()
const imgB = (() => { const a = solid(0); a[0] = 20; return a })()
const imgA2 = (() => { const a = solid(0); a[0] = 10; return a })()  // same "face" as A

function makeCluster(firstExemplar: Uint8Array): Cluster {
  return {
    id: 'c1',
    pipValue: null,
    exemplars: [firstExemplar],
    updatedAt: 0,
  }
}

// ---------------------------------------------------------------------------
// findBestCluster
// ---------------------------------------------------------------------------

describe('findBestCluster', () => {
  it('returns null when cluster list is empty', () => {
    expect(findBestCluster(imgA, [], trivialSimilarity)).toBeNull()
  })

  it('returns the matching cluster when score is below threshold', () => {
    const clusters: Cluster[] = [makeCluster(imgA)]
    const result = findBestCluster(imgA2, clusters, trivialSimilarity)
    expect(result).not.toBeNull()
    expect(result!.cluster.id).toBe('c1')
    expect(result!.score).toBe(0)
  })

  it('returns the cluster with the lowest score when multiple clusters exist', () => {
    const clusters: Cluster[] = [
      { id: 'c1', pipValue: null, exemplars: [imgB], updatedAt: 0 },
      { id: 'c2', pipValue: null, exemplars: [imgA], updatedAt: 0 },
    ]
    // imgA2 matches c2 (score 0) better than c1 (score 1)
    const result = findBestCluster(imgA2, clusters, trivialSimilarity)
    expect(result!.cluster.id).toBe('c2')
  })

  it('picks the best-matching exemplar within a cluster', () => {
    // Cluster has two exemplars: one that matches (imgA) and one that does not (imgB)
    const cluster: Cluster = { id: 'c1', pipValue: null, exemplars: [imgB, imgA], updatedAt: 0 }
    const result = findBestCluster(imgA2, [cluster], trivialSimilarity)
    expect(result!.score).toBe(0)  // matched against the imgA exemplar
  })
})

// ---------------------------------------------------------------------------
// addToCluster
// ---------------------------------------------------------------------------

describe('addToCluster', () => {
  it('creates a new cluster when list is empty', () => {
    const result = addToCluster(imgA, [], { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
    expect(result.action).toBe('created')
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]!.exemplars).toHaveLength(1)
  })

  it('merges into an existing cluster when score is below threshold', () => {
    const initial: Cluster[] = [makeCluster(imgA)]
    const result = addToCluster(imgA2, initial, { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
    expect(result.action).toBe('merged')
    expect(result.clusters).toHaveLength(1)
    // Exemplar added to the cluster
    expect(result.clusters[0]!.exemplars).toHaveLength(2)
  })

  it('creates a new cluster when score is at or above threshold', () => {
    const initial: Cluster[] = [makeCluster(imgA)]
    // imgB has first byte 20 ≠ 10 → trivialSimilarity returns 1 → above any reasonable threshold
    const result = addToCluster(imgB, initial, { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
    expect(result.action).toBe('created')
    expect(result.clusters).toHaveLength(2)
  })

  it('returns the correct clusterId in both merge and create cases', () => {
    const initial: Cluster[] = [makeCluster(imgA)]

    const merged = addToCluster(imgA2, initial, { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
    expect(merged.clusterId).toBe('c1')

    const created = addToCluster(imgB, initial, { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
    expect(created.clusterId).not.toBe('c1')
    expect(typeof created.clusterId).toBe('string')
  })

  it('does not mutate the input clusters array', () => {
    const initial: Cluster[] = [makeCluster(imgA)]
    const originalLength = initial.length
    addToCluster(imgA2, initial, { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
    expect(initial).toHaveLength(originalLength)
  })

  it('accumulates six distinct clusters after seeing six distinct die faces', () => {
    // Six "faces" with distinguishable images (distinct first bytes)
    const faces = [10, 20, 30, 40, 50, 60].map((v) => {
      const img = solid(0)
      img[0] = v
      return img
    })

    let clusters: Cluster[] = []
    for (const face of faces) {
      const result = addToCluster(face, clusters, { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
      clusters = result.clusters
    }
    expect(clusters).toHaveLength(6)
  })

  it('stabilizes at 6 clusters after repeated rolls of the same 6 faces', () => {
    const faces = [10, 20, 30, 40, 50, 60].map((v) => {
      const img = solid(0)
      img[0] = v
      return img
    })

    let clusters: Cluster[] = []
    // Roll each face multiple times in random order
    const rolls = [...faces, ...faces, ...faces, ...faces]
    for (const face of rolls) {
      const result = addToCluster(face, clusters, { mergeThreshold: 0.5, similarityFn: trivialSimilarity })
      clusters = result.clusters
    }
    expect(clusters).toHaveLength(6)
  })
})

// ---------------------------------------------------------------------------
// labelCluster
// ---------------------------------------------------------------------------

describe('labelCluster', () => {
  it('assigns a pip value to the specified cluster', () => {
    const clusters: Cluster[] = [
      { id: 'c1', pipValue: null, exemplars: [imgA], updatedAt: 0 },
      { id: 'c2', pipValue: null, exemplars: [imgB], updatedAt: 0 },
    ]
    const labeled = labelCluster(clusters, 'c1', 6)
    expect(labeled.find((c) => c.id === 'c1')!.pipValue).toBe(6)
    expect(labeled.find((c) => c.id === 'c2')!.pipValue).toBeNull()
  })

  it('does not mutate the input array', () => {
    const clusters: Cluster[] = [{ id: 'c1', pipValue: null, exemplars: [imgA], updatedAt: 0 }]
    labelCluster(clusters, 'c1', 3)
    expect(clusters[0]!.pipValue).toBeNull()
  })

  it('returns all clusters unchanged when clusterId is not found', () => {
    const clusters: Cluster[] = [{ id: 'c1', pipValue: null, exemplars: [imgA], updatedAt: 0 }]
    const result = labelCluster(clusters, 'nonexistent', 5)
    expect(result[0]!.pipValue).toBeNull()
  })
})
