/**
 * Agglomerative clustering engine for die face recognition.
 *
 * Each die set has a set of clusters — one per unique die face (6 for a d6).
 * As the user rolls dice, each captured 64×64 face ROI is compared against
 * all existing cluster exemplars. If the best match is below the merge
 * threshold, the image is added to that cluster. Otherwise a new cluster
 * is created.
 *
 * Clustering stabilizes after ~20 rolls (all 6 faces seen multiple times).
 * At that point the user labels each cluster with its pip value (1–6).
 *
 * The similarity function is injected (defaults to rotation-invariant
 * template matching from templateMatch.ts) so the engine is testable
 * without the full CV pipeline.
 */

import { matchDissimilarity } from './templateMatch'

export interface Cluster {
  id: string
  pipValue: number | null  // null until the cluster-labeling step
  exemplars: Uint8Array[]  // 64×64 grayscale ROIs
  updatedAt: number
}

export type SimilarityFn = (a: Uint8Array, b: Uint8Array) => number

export interface AddOptions {
  mergeThreshold?: number
  similarityFn?: SimilarityFn
}

const DEFAULT_MERGE_THRESHOLD = 0.15  // avg pixel diff ≤ 15% of max intensity

/**
 * Find the best-matching cluster for the given probe image.
 * Returns null if the cluster list is empty.
 */
export function findBestCluster(
  probe: Uint8Array,
  clusters: Cluster[],
  similarityFn: SimilarityFn = matchDissimilarity,
): { cluster: Cluster; score: number } | null {
  if (clusters.length === 0) return null

  let best: { cluster: Cluster; score: number } | null = null

  for (const cluster of clusters) {
    // Compare against every exemplar; take the best (lowest) score for this cluster
    let minScore = Infinity
    for (const exemplar of cluster.exemplars) {
      const score = similarityFn(probe, exemplar)
      if (score < minScore) minScore = score
    }
    if (best === null || minScore < best.score) {
      best = { cluster, score: minScore }
    }
  }

  return best
}

/**
 * Add a probe image to the cluster set.
 *
 * If the probe's best-matching cluster has a dissimilarity score below
 * `mergeThreshold`, the probe is appended to that cluster's exemplars.
 * Otherwise a new cluster is created with the probe as its first exemplar.
 *
 * Returns the updated clusters array and metadata about what happened.
 * Input clusters are not mutated.
 */
export function addToCluster(
  probe: Uint8Array,
  clusters: Cluster[],
  options: AddOptions = {},
): { clusters: Cluster[]; action: 'merged' | 'created'; clusterId: string } {
  const {
    mergeThreshold = DEFAULT_MERGE_THRESHOLD,
    similarityFn = matchDissimilarity,
  } = options

  const best = findBestCluster(probe, clusters, similarityFn)

  if (best && best.score < mergeThreshold) {
    // Merge: append exemplar to the best-matching cluster
    const updated = clusters.map((c) =>
      c.id === best.cluster.id
        ? { ...c, exemplars: [...c.exemplars, probe], updatedAt: Date.now() }
        : c,
    )
    return { clusters: updated, action: 'merged', clusterId: best.cluster.id }
  }

  // Create a new cluster
  const newCluster: Cluster = {
    id: crypto.randomUUID(),
    pipValue: null,
    exemplars: [probe],
    updatedAt: Date.now(),
  }
  return {
    clusters: [...clusters, newCluster],
    action: 'created',
    clusterId: newCluster.id,
  }
}

/**
 * Assign a pip value (1–6) to a cluster after the labeling step.
 * Returns a new clusters array; input is not mutated.
 */
export function labelCluster(
  clusters: Cluster[],
  clusterId: string,
  pipValue: number,
): Cluster[] {
  return clusters.map((c) => (c.id === clusterId ? { ...c, pipValue } : c))
}
