# apps/no-cheat/client/src/lib/cv/knnClassifier.ts

> k-Nearest Neighbors classifier for dice pip counting.

## Prompt

Write a simple k-NN classifier. Pure TypeScript, no ML framework.

### Types

**`TrainingExample`**: `{ features: number[], label: number }` (label 1-6 for pip count)

**`KnnResult`**: `{ label: number, confidence: number }` (confidence = fraction of k neighbors agreeing, 0-1)

### Function: `classifyKnn(query, examples, k=3): KnnResult | null`

1. If no examples, return null
2. Compute Euclidean distance from query to every example
3. Sort by distance ascending
4. Take `min(k, examples.length)` nearest neighbors
5. Majority vote: count votes per label. Ties broken by closest distance (the label with the nearest single neighbor wins).
6. Return `{ label: winningLabel, confidence: bestCount / effectiveK }`

### Euclidean distance

`sqrt(Σ(a[i] - b[i])²)` — handles different-length vectors by treating missing elements as 0.

## Dependencies

None — pure math.
