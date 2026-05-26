/**
 * Die face isolation: extract per-die ROIs from a binary foreground mask.
 *
 * Takes the binary mask produced by the pipeline (after morphological close)
 * and returns square bounding boxes with rotation angle for each detected die.
 *
 * Algorithm:
 *   1. Find all connected components (4-connectivity BFS)
 *   2. Filter by minimum area (scale-dependent — rejects noise)
 *   3. Merge components whose centroids are within proximity threshold
 *      (scale-dependent — handles fragmented die-face contours)
 *   4. Filter by aspect ratio of axis-aligned bbox (dice are roughly square)
 *   5. Compute orientation angle from second moments
 *   6. Output square bounding box centered on centroid, clamped to image bounds
 *
 * All parameters scale with image dimensions so detection works at any
 * camera resolution (320×240 to 1920×1080+).
 *
 * All operations are pure TypeScript — no opencv.js dependency.
 */

export interface Roi {
  /** Top-left x of axis-aligned bounding square (clamped to image) */
  x: number
  /** Top-left y of axis-aligned bounding square (clamped to image) */
  y: number
  /** Side length (always square: width === height) */
  width: number
  /** Side length (always square: width === height) */
  height: number
  /** Center x */
  cx: number
  /** Center y */
  cy: number
  /** Orientation angle in radians (from image moments) */
  angle: number
}

interface BlobRegion {
  minX: number
  maxX: number
  minY: number
  maxY: number
  area: number
  sumX: number
  sumY: number
  sumXX: number
  sumYY: number
  sumXY: number
}

function findRegions(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea: number,
): BlobRegion[] {
  const visited = new Uint8Array(width * height)
  const regions: BlobRegion[] = []

  for (let startIdx = 0; startIdx < width * height; startIdx++) {
    if (binary[startIdx] !== 255 || visited[startIdx]) continue

    // BFS to collect all pixels in this connected component
    const queue: number[] = [startIdx]
    visited[startIdx] = 1

    let minX = width,
      maxX = 0
    let minY = height,
      maxY = 0
    let area = 0
    let sumX = 0,
      sumY = 0
    let sumXX = 0,
      sumYY = 0,
      sumXY = 0

    while (queue.length > 0) {
      const idx = queue.shift()!
      const x = idx % width
      const y = Math.floor(idx / width)

      area++
      sumX += x
      sumY += y
      sumXX += x * x
      sumYY += y * y
      sumXY += x * y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      // 4-connected neighbors
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
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

    if (area >= minArea) {
      regions.push({
        minX,
        maxX,
        minY,
        maxY,
        area,
        sumX,
        sumY,
        sumXX,
        sumYY,
        sumXY,
      })
    }
  }

  return regions
}

function mergeRegions(regions: BlobRegion[], mergeDistance: number): BlobRegion[] {
  if (regions.length === 0) return []

  // Union-find: merge regions whose centroids are within mergeDistance
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
      const cxI = regions[i]!.sumX / regions[i]!.area
      const cyI = regions[i]!.sumY / regions[i]!.area
      const cxJ = regions[j]!.sumX / regions[j]!.area
      const cyJ = regions[j]!.sumY / regions[j]!.area
      const dx = cxI - cxJ
      const dy = cyI - cyJ
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= mergeDistance) {
        union(i, j)
      }
    }
  }

  // Aggregate by group — sum raw moments for correct angle computation
  const groups = new Map<number, BlobRegion[]>()
  for (let i = 0; i < regions.length; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(regions[i]!)
  }

  return Array.from(groups.values()).map((group) => {
    const minX = Math.min(...group.map((r) => r.minX))
    const maxX = Math.max(...group.map((r) => r.maxX))
    const minY = Math.min(...group.map((r) => r.minY))
    const maxY = Math.max(...group.map((r) => r.maxY))
    const area = group.reduce((s, r) => s + r.area, 0)
    const sumX = group.reduce((s, r) => s + r.sumX, 0)
    const sumY = group.reduce((s, r) => s + r.sumY, 0)
    const sumXX = group.reduce((s, r) => s + r.sumXX, 0)
    const sumYY = group.reduce((s, r) => s + r.sumYY, 0)
    const sumXY = group.reduce((s, r) => s + r.sumXY, 0)
    return {
      minX,
      maxX,
      minY,
      maxY,
      area,
      sumX,
      sumY,
      sumXX,
      sumYY,
      sumXY,
    }
  })
}

/**
 * Compute the orientation angle of a region from its second moments.
 * Returns angle in radians in [-PI/2, PI/2].
 */
function computeAngle(region: BlobRegion): number {
  const cx = region.sumX / region.area
  const cy = region.sumY / region.area

  // Central moments
  const mu20 = region.sumXX / region.area - cx * cx
  const mu02 = region.sumYY / region.area - cy * cy
  const mu11 = region.sumXY / region.area - cx * cy

  return 0.5 * Math.atan2(2 * mu11, mu20 - mu02)
}

/**
 * Extract die face ROIs from a binary foreground mask.
 * Returns an array of square bounding boxes with rotation angle,
 * one per detected die in the scene.
 *
 * Parameters scale with image dimensions:
 * - minArea: 0.5% of image pixels (rejects noise)
 * - mergeDistance: 3% of shorter dimension (merges pip blobs without merging adjacent dice)
 * - aspectRatio: 0.5 to 2.0 (dice are roughly square)
 * - maxArea: 15% of image pixels (rejects huge background regions)
 */
export function extractRois(binary: Uint8Array, width: number, height: number): Roi[] {
  const imageArea = width * height
  const shortDim = Math.min(width, height)

  const minArea = Math.max(200, Math.floor(imageArea * 0.005))
  const maxArea = Math.floor(imageArea * 0.15)
  const mergeDistance = Math.max(10, Math.floor(shortDim * 0.03))

  const regions = findRegions(binary, width, height, minArea)
  const merged = mergeRegions(regions, mergeDistance)

  return merged
    .filter((r) => {
      const w = r.maxX - r.minX + 1
      const h = r.maxY - r.minY + 1
      const aspect = w / h

      // Filter by aspect ratio (dice are roughly square)
      if (aspect < 0.5 || aspect > 2.0) return false

      // Filter by area (too small = noise, too large = background)
      if (r.area < minArea || r.area > maxArea) return false

      return true
    })
    .map((region) => {
      const bboxW = region.maxX - region.minX + 1
      const bboxH = region.maxY - region.minY + 1
      const size = Math.max(bboxW, bboxH)

      const cx = region.sumX / region.area
      const cy = region.sumY / region.area
      const angle = computeAngle(region)

      // Square bounding box centered on centroid, clamped to image bounds
      let x = Math.round(cx - size / 2)
      let y = Math.round(cy - size / 2)

      // Clamp to image bounds
      if (x < 0) x = 0
      if (y < 0) y = 0
      if (x + size > width) x = width - size
      if (y + size > height) y = height - size
      // Final safety clamp
      if (x < 0) x = 0
      if (y < 0) y = 0
      const clampedSize = Math.min(size, width - x, height - y)

      return {
        x,
        y,
        width: clampedSize,
        height: clampedSize,
        cx: Math.round(cx),
        cy: Math.round(cy),
        angle,
      }
    })
}
