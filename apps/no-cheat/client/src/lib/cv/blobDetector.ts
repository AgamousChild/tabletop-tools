/**
 * Pip counting via blob detection.
 *
 * Detects circular pip dots on a die face image. Operates on a grayscale
 * image of any size (not restricted to 64×64).
 *
 * Algorithm:
 *   1. Apply Otsu threshold to separate pips from die surface
 *   2. Find all connected components (4-connectivity BFS)
 *   3. Filter by area (scale-relative) and circularity ≥ 0.4
 *   4. Try both foreground and background pixel groups
 *   5. Return pip count from whichever group gives a valid 1–6 count
 *
 * All operations are pure TypeScript — no opencv.js dependency.
 */

export interface BlobInfo {
  area: number
  perimeter: number
  circularity: number
  /** Centroid x within the image */
  cx: number
  /** Centroid y within the image */
  cy: number
}

/**
 * Find all 4-connected blob regions in a binary image via BFS.
 * target = the pixel value to search for (0 or 255).
 */
export function findBlobInfo(binary: Uint8Array, width: number, height: number, target = 255): BlobInfo[] {
  const visited = new Uint8Array(width * height)
  const blobs: BlobInfo[] = []

  for (let startIdx = 0; startIdx < width * height; startIdx++) {
    if (binary[startIdx] !== target || visited[startIdx]) continue

    const queue: number[] = [startIdx]
    visited[startIdx] = 1
    let area = 0
    let perimeter = 0
    let sumX = 0
    let sumY = 0

    while (queue.length > 0) {
      const idx = queue.shift()!
      area++

      const x = idx % width
      const y = Math.floor(idx / width)
      sumX += x
      sumY += y

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
        if (binary[ni] !== target) {
          isEdge = true
        } else if (!visited[ni]) {
          visited[ni] = 1
          queue.push(ni)
        }
      }

      if (isEdge) perimeter++
    }

    if (perimeter === 0) perimeter = 1
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter)

    blobs.push({ area, perimeter, circularity, cx: sumX / area, cy: sumY / area })
  }

  return blobs
}

/**
 * Apply Otsu threshold to a grayscale image and return binary mask.
 */
export function otsuBinarize(gray: Uint8Array): Uint8Array {
  const N = gray.length
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < N; i++) hist[gray[i]!]++

  let totalMean = 0
  for (let i = 0; i < 256; i++) totalMean += i * hist[i]!

  let sumB = 0
  let wB = 0
  let maxVariance = 0
  let threshold = 128

  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (wB === 0) continue
    const wF = N - wB
    if (wF === 0) break
    sumB += t * hist[t]!
    const meanB = sumB / wB
    const meanF = (totalMean - sumB) / wF
    const variance = wB * wF * (meanB - meanF) ** 2
    if (variance > maxVariance) {
      maxVariance = variance
      threshold = t
    }
  }

  const mask = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    mask[i] = gray[i]! > threshold ? 255 : 0
  }
  return mask
}

/**
 * Filter blobs by area, circularity, and center proximity, return count.
 *
 * Center-weighting (inspired by Artefact2/autodice): pips near the die center
 * are more reliable than edge features. Blobs whose centroid is beyond 85% of
 * half-width from center are rejected as likely table noise bleeding in.
 *
 * circularity threshold at 0.3 for better detection of pips viewed at angles.
 */
function countValidBlobs(
  blobs: BlobInfo[],
  minArea: number,
  maxArea: number,
  roiWidth?: number,
  roiHeight?: number,
): number {
  const centerX = roiWidth ? roiWidth / 2 : undefined
  const centerY = roiHeight ? roiHeight / 2 : undefined
  const maxDist = centerX && centerY
    ? Math.sqrt(centerX * centerX + centerY * centerY) * 0.85
    : undefined

  const pips = blobs.filter((b) => {
    if (b.area < minArea || b.area > maxArea || b.circularity < 0.3) return false

    // Center-weighting: reject blobs too far from ROI center
    if (centerX !== undefined && centerY !== undefined && maxDist !== undefined) {
      const dx = b.cx - centerX
      const dy = b.cy - centerY
      if (Math.sqrt(dx * dx + dy * dy) > maxDist) return false
    }

    return true
  })
  return pips.length
}

/**
 * Binarize using a fixed threshold (median of image values).
 * Fallback for when Otsu gives poor separation.
 */
function medianBinarize(gray: Uint8Array): Uint8Array {
  const sorted = Array.from(gray).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  const mask = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    mask[i] = gray[i]! > median ? 255 : 0
  }
  return mask
}

/**
 * Count the number of pip dots in a die face image.
 *
 * Uses multi-threshold consensus (inspired by ordovas/dice-scores-recognition):
 * tries multiple binarization methods and uses the most-agreed-upon count.
 * This is more robust than the previous sequential fallback approach.
 *
 * @param gray - Grayscale image of a single die face
 * @param width - Image width
 * @param height - Image height
 * @returns pip count (1–6), or null if detection failed
 */
export function detectPips(gray: Uint8Array, width: number, height: number): number | null {
  const imageArea = width * height

  // Scale area thresholds to image size
  // Pips are typically 1-8% of the die face area each
  const minArea = Math.max(3, Math.floor(imageArea * 0.005))
  const maxArea = Math.floor(imageArea * 0.15)

  // Collect pip counts from multiple threshold methods
  const candidates: number[] = []

  const binary = otsuBinarize(gray)

  // Otsu dark pips
  const darkBlobs = findBlobInfo(binary, width, height, 0)
  const darkCount = countValidBlobs(darkBlobs, minArea, maxArea, width, height)
  if (darkCount >= 1 && darkCount <= 6) candidates.push(darkCount)

  // Otsu light pips
  const lightBlobs = findBlobInfo(binary, width, height, 255)
  const lightCount = countValidBlobs(lightBlobs, minArea, maxArea, width, height)
  if (lightCount >= 1 && lightCount <= 6) candidates.push(lightCount)

  // Median-based binarization
  const medBinary = medianBinarize(gray)
  const medDarkBlobs = findBlobInfo(medBinary, width, height, 0)
  const medDarkCount = countValidBlobs(medDarkBlobs, minArea, maxArea, width, height)
  if (medDarkCount >= 1 && medDarkCount <= 6) candidates.push(medDarkCount)

  const medLightBlobs = findBlobInfo(medBinary, width, height, 255)
  const medLightCount = countValidBlobs(medLightBlobs, minArea, maxArea, width, height)
  if (medLightCount >= 1 && medLightCount <= 6) candidates.push(medLightCount)

  if (candidates.length === 0) return null

  // Multi-threshold consensus: use the count that appears most frequently
  const freq = new Map<number, number>()
  for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1)

  let bestCount = 0
  let bestValue = candidates[0]!
  for (const [val, count] of freq) {
    if (count > bestCount) {
      bestCount = count
      bestValue = val
    }
  }

  return bestValue
}

/**
 * Legacy API: count blobs in a pre-binarized 64×64 image.
 * Kept for backward compatibility with existing tests.
 */
export function detectBlobs(binary: Uint8Array, size = 64): number | null {
  const minArea = Math.max(3, Math.floor(size * size * 0.005))
  const maxArea = Math.floor(size * size * 0.15)

  const blobs = findBlobInfo(binary, size, size, 255)
  const pips = blobs.filter(
    (b) => b.area >= minArea && b.area <= maxArea && b.circularity >= 0.3,
  )

  if (pips.length === 0) return 0
  if (pips.length > 6) return null

  return pips.length
}
