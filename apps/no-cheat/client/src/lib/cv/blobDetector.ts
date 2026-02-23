/**
 * SimpleBlobDetector fallback for d6 pip counting.
 *
 * Used before cluster calibration stabilizes, or as a cross-check for d6.
 * Operates on a 64×64 binary (0/255) Uint8Array.
 *
 * Algorithm:
 *   1. Find all connected components (4-connectivity BFS)
 *   2. Filter by area [20, 600] and circularity ≥ 0.5
 *   3. Count remaining blobs → pip value
 *   4. If count > 6 → null (false detection, reject)
 *
 * All operations are pure TypeScript — no opencv.js dependency.
 */

const SIZE = 64

// Filter parameters (matching CLAUDE.md SimpleBlobDetector spec)
const MIN_AREA = 20
const MAX_AREA = 600
const MIN_CIRCULARITY = 0.5

interface BlobInfo {
  area: number
  perimeter: number
  circularity: number
}

/**
 * Find all 4-connected blob regions in a binary image via BFS.
 * Returns an array of BlobInfo for each blob found.
 */
function findBlobInfo(binary: Uint8Array, width: number, height: number): BlobInfo[] {
  const visited = new Uint8Array(width * height)
  const blobs: BlobInfo[] = []

  for (let startIdx = 0; startIdx < width * height; startIdx++) {
    if (binary[startIdx] !== 255 || visited[startIdx]) continue

    // BFS from this pixel
    const queue: number[] = [startIdx]
    visited[startIdx] = 1
    let area = 0
    let perimeter = 0

    while (queue.length > 0) {
      const idx = queue.shift()!
      area++

      const x = idx % width
      const y = Math.floor(idx / width)

      const neighbors: [number, number][] = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ]

      let isEdge = false
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          isEdge = true
          continue
        }
        const ni = ny * width + nx
        if (binary[ni] !== 255) {
          isEdge = true
        } else if (!visited[ni]) {
          visited[ni] = 1
          queue.push(ni)
        }
      }

      if (isEdge) perimeter++
    }

    if (perimeter === 0) perimeter = 1  // avoid division by zero for 1-pixel blobs
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter)

    blobs.push({ area, perimeter, circularity })
  }

  return blobs
}

/**
 * Count the number of pip dots in a 64×64 binary die face image.
 *
 * Returns the pip count (1–6), or null if no valid pips are found or
 * if more than 6 blobs are detected (likely a false detection).
 */
export function detectBlobs(binary: Uint8Array): number | null {
  const blobs = findBlobInfo(binary, SIZE, SIZE)

  const pips = blobs.filter(
    (b) => b.area >= MIN_AREA && b.area <= MAX_AREA && b.circularity >= MIN_CIRCULARITY,
  )

  if (pips.length === 0) return 0
  if (pips.length > 6) return null  // false detection

  return pips.length
}
