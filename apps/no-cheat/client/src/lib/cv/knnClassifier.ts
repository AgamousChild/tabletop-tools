/**
 * k-NN classifier for dice pip detection.
 *
 * Classifies a query feature vector against labeled training examples
 * using Euclidean distance and majority vote.
 */

export interface TrainingExample {
  features: number[]
  label: number // 1-6 for pip count
}

export interface KnnResult {
  label: number
  confidence: number // 0-1, fraction of k neighbors agreeing
}

/**
 * Compute Euclidean distance between two feature vectors.
 */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/**
 * Classify a query feature vector using k-nearest neighbors.
 *
 * @param query - Feature vector to classify
 * @param examples - Labeled training examples
 * @param k - Number of neighbors to consider (default 3)
 * @returns Classification result with label and confidence, or null if no examples
 */
export function classifyKnn(
  query: number[],
  examples: TrainingExample[],
  k: number = 3,
): KnnResult | null {
  if (examples.length === 0) return null

  // Compute distances from query to all examples
  const distances = examples.map((ex) => ({
    label: ex.label,
    distance: euclideanDistance(query, ex.features),
  }))

  // Sort by distance (ascending)
  distances.sort((a, b) => a.distance - b.distance)

  // Select k nearest (or all if fewer than k)
  const effectiveK = Math.min(k, distances.length)
  const neighbors = distances.slice(0, effectiveK)

  // Count votes per label and track closest distance per label
  const votes = new Map<number, number>()
  const closestDistance = new Map<number, number>()

  for (const neighbor of neighbors) {
    votes.set(neighbor.label, (votes.get(neighbor.label) ?? 0) + 1)
    if (
      !closestDistance.has(neighbor.label) ||
      neighbor.distance < closestDistance.get(neighbor.label)!
    ) {
      closestDistance.set(neighbor.label, neighbor.distance)
    }
  }

  // Find the winning label: highest vote count, ties broken by closest distance
  let bestLabel = -1
  let bestCount = 0
  let bestDistance = Infinity

  for (const [label, count] of votes) {
    const dist = closestDistance.get(label)!
    if (count > bestCount || (count === bestCount && dist < bestDistance)) {
      bestLabel = label
      bestCount = count
      bestDistance = dist
    }
  }

  return {
    label: bestLabel,
    confidence: bestCount / effectiveK,
  }
}
