/**
 * Rotation-invariant template matching for 64×64 grayscale die face ROIs.
 *
 * Algorithm (from Reichler — Dicer):
 *   1. Coarse rotation search: rotate exemplar 0°, 10°, ..., 350° and compute
 *      average pixel difference vs probe image at each angle.
 *   2. Fine rotation search: ±15° around best coarse angle in 1° steps.
 *   3. Dissimilarity = best (minimum) average pixel difference found.
 *
 * All operations are pure TypeScript — no opencv.js dependency. Inputs are
 * 64×64 Uint8Array (grayscale, values 0–255).
 */

export const SIZE = 64
const CENTER = SIZE / 2  // 32

/**
 * Rotate a 64×64 grayscale image by angleDeg degrees (counter-clockwise).
 * Uses nearest-neighbor interpolation. Out-of-bounds pixels become 0.
 */
export function rotateImage(img: Uint8Array, angleDeg: number): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE)
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = CENTER
  const cy = CENTER

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Inverse mapping: output (x, y) → source (sx, sy)
      const dx = x - cx
      const dy = y - cy
      const sx = Math.round(cos * dx + sin * dy + cx)
      const sy = Math.round(-sin * dx + cos * dy + cy)

      if (sx >= 0 && sx < SIZE && sy >= 0 && sy < SIZE) {
        out[y * SIZE + x] = img[sy * SIZE + sx]!
      }
      // else: 0 (black — already initialized)
    }
  }

  return out
}

/**
 * Average absolute pixel difference between two 64×64 grayscale images,
 * normalized to [0, 1] (0 = identical, 1 = fully inverted).
 */
export function avgPixelDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i]! - b[i]!)
  }
  return sum / (a.length * 255)
}

/**
 * Compute the rotation-invariant dissimilarity score between a probe image
 * and an exemplar image. Lower score = more similar.
 *
 * Runs a coarse search (36 angles at 10° intervals) then a fine search
 * (±15° around the best coarse angle at 1° intervals).
 *
 * Returns a value in [0, 1].
 */
export function matchDissimilarity(probe: Uint8Array, exemplar: Uint8Array): number {
  let bestScore = Infinity
  let bestCoarseAngle = 0

  // Coarse search: 0°, 10°, ..., 350°
  for (let angle = 0; angle < 360; angle += 10) {
    const rotated = rotateImage(exemplar, angle)
    const score = avgPixelDiff(probe, rotated)
    if (score < bestScore) {
      bestScore = score
      bestCoarseAngle = angle
    }
  }

  // Fine search: ±15° around best coarse angle, 1° steps
  for (let angle = bestCoarseAngle - 15; angle <= bestCoarseAngle + 15; angle++) {
    const rotated = rotateImage(exemplar, angle)
    const score = avgPixelDiff(probe, rotated)
    if (score < bestScore) {
      bestScore = score
    }
  }

  return bestScore
}
