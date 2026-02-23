/**
 * Die face isolation: extract per-die ROIs from a binary foreground mask.
 *
 * Takes the binary mask produced by background.ts (otsuThreshold) and returns
 * bounding rectangles for each detected die face in the scene.
 *
 * Algorithm:
 *   1. Find all connected components (4-connectivity BFS)
 *   2. Filter by minimum area (removes noise pixels)
 *   3. Merge components whose bounding-box centroids are within the
 *      proximity threshold (handles fragmented die-face contours)
 *   4. Compute final bounding box for each merged group
 *
 * All operations are pure TypeScript — no opencv.js dependency.
 */

export interface Roi {
  x: number
  y: number
  width: number
  height: number
}

// Minimum area (pixels) for a blob to be considered a die face
const MIN_BLOB_AREA = 100

// Maximum centroid distance (pixels) at which two blobs are merged
const MERGE_DISTANCE = 20

interface BlobRegion {
  minX: number
  maxX: number
  minY: number
  maxY: number
  area: number
  centroidX: number
  centroidY: number
}

function findRegions(binary: Uint8Array, width: number, height: number): BlobRegion[] {
  const visited = new Uint8Array(width * height)
  const regions: BlobRegion[] = []

  for (let startIdx = 0; startIdx < width * height; startIdx++) {
    if (binary[startIdx] !== 255 || visited[startIdx]) continue

    // BFS to collect all pixels in this connected component
    const queue: number[] = [startIdx]
    visited[startIdx] = 1

    let minX = width, maxX = 0
    let minY = height, maxY = 0
    let area = 0
    let sumX = 0, sumY = 0

    while (queue.length > 0) {
      const idx = queue.shift()!
      const x = idx % width
      const y = Math.floor(idx / width)

      area++
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      // 4-connected neighbors
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const ni = ny * width + nx
          if (binary[ni] === 255 && !visited[ni]) {
            visited[ni] = 1
            queue.push(ni)
          }
        }
      }
    }

    if (area >= MIN_BLOB_AREA) {
      regions.push({
        minX, maxX, minY, maxY, area,
        centroidX: sumX / area,
        centroidY: sumY / area,
      })
    }
  }

  return regions
}

function mergeRegions(regions: BlobRegion[]): BlobRegion[] {
  // Union-find: merge regions whose centroids are within MERGE_DISTANCE
  const parent = regions.map((_, i) => i)

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }

  function union(a: number, b: number): void {
    parent[find(a)] = find(b)
  }

  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const dx = regions[i]!.centroidX - regions[j]!.centroidX
      const dy = regions[i]!.centroidY - regions[j]!.centroidY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= MERGE_DISTANCE) {
        union(i, j)
      }
    }
  }

  // Aggregate by group
  const groups = new Map<number, BlobRegion[]>()
  for (let i = 0; i < regions.length; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(regions[i]!)
  }

  // Compute merged bounding box for each group
  return Array.from(groups.values()).map((group) => {
    const minX = Math.min(...group.map((r) => r.minX))
    const maxX = Math.max(...group.map((r) => r.maxX))
    const minY = Math.min(...group.map((r) => r.minY))
    const maxY = Math.max(...group.map((r) => r.maxY))
    const area = group.reduce((s, r) => s + r.area, 0)
    return {
      minX, maxX, minY, maxY, area,
      centroidX: (minX + maxX) / 2,
      centroidY: (minY + maxY) / 2,
    }
  })
}

/**
 * Extract die face ROIs from a binary foreground mask.
 * Returns an array of bounding rectangles, one per detected die in the scene.
 */
export function extractRois(binary: Uint8Array, width: number, height: number): Roi[] {
  const regions = findRegions(binary, width, height)
  const merged = mergeRegions(regions)

  return merged.map(({ minX, maxX, minY, maxY }) => ({
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }))
}
