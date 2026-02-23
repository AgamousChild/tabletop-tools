/**
 * Background calibration and subtraction for the no-cheat CV pipeline.
 *
 * Before the first roll in a session, the user points the camera at the empty
 * rolling surface. One frame is captured and converted to LAB color space.
 * This "background" is subtracted from every subsequent live frame to isolate
 * the dice.
 *
 * All operations are pure TypeScript — no opencv.js dependency. The integration
 * layer (pipeline.ts) converts ImageData → Uint8Array before passing it here.
 *
 * LAB storage format: flat Uint8Array, 3 bytes per pixel [L, a, b].
 * Values are in the OpenCV convention: L ∈ [0, 255], a ∈ [0, 255], b ∈ [0, 255]
 * (where 128 = neutral for a and b channels).
 */

/**
 * Convert an RGBA ImageData buffer to LAB color space.
 *
 * Uses the sRGB → XYZ → D65 LAB conversion. Output is a flat Uint8Array
 * with 3 bytes per pixel [L, a, b] in OpenCV scale:
 *   L = [0, 255]  (CIE L* / 100 × 255)
 *   a = [0, 255]  (CIE a* + 128, clamped)
 *   b = [0, 255]  (CIE b* + 128, clamped)
 */
export function rgbaToLab(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 3)

  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4]! / 255
    const g = rgba[i * 4 + 1]! / 255
    const b = rgba[i * 4 + 2]! / 255

    // sRGB → linear RGB
    const rl = r <= 0.04045 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4
    const gl = g <= 0.04045 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4
    const bl = b <= 0.04045 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4

    // Linear RGB → XYZ (D65)
    const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375
    const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750
    const z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041

    // XYZ → LAB (D65 reference white)
    const fx = f(x / 0.95047)
    const fy = f(y / 1.00000)
    const fz = f(z / 1.08883)

    const L = Math.max(0, 116 * fy - 16)
    const aVal = 500 * (fx - fy) + 128
    const bVal = 200 * (fy - fz) + 128

    out[i * 3] = Math.round(Math.min(255, (L / 100) * 255))
    out[i * 3 + 1] = Math.round(Math.min(255, Math.max(0, aVal)))
    out[i * 3 + 2] = Math.round(Math.min(255, Math.max(0, bVal)))
  }

  return out
}

function f(t: number): number {
  return t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116
}

/**
 * Compute per-pixel absolute difference between two LAB images.
 * Returns a single-channel Uint8Array (one value per pixel) using the
 * maximum channel difference as the combined distance metric.
 *
 * Input format: flat [L, a, b, L, a, b, ...] Uint8Array (3 bytes/pixel).
 */
export function absDiffLab(
  fg: Uint8Array,
  bg: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const dL = Math.abs(fg[i * 3]! - bg[i * 3]!)
    const dA = Math.abs(fg[i * 3 + 1]! - bg[i * 3 + 1]!)
    const dB = Math.abs(fg[i * 3 + 2]! - bg[i * 3 + 2]!)
    out[i] = Math.max(dL, dA, dB)
  }
  return out
}

/**
 * Apply Otsu's method to compute an optimal threshold for a grayscale image,
 * then return a binary mask (0 or 255 per pixel).
 *
 * Otsu's method minimizes the intra-class variance of the two pixel groups
 * produced by the threshold. Works well for bimodal histograms (dice on a
 * distinct background).
 */
export function otsuThreshold(gray: Uint8Array): Uint8Array {
  const N = gray.length

  // Build histogram
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < N; i++) hist[gray[i]!]++

  // Compute cumulative sums
  let totalMean = 0
  for (let i = 0; i < 256; i++) totalMean += i * hist[i]!

  let sumB = 0
  let wB = 0
  let maxVariance = 0
  let threshold = 0

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

  // Apply threshold
  const mask = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    mask[i] = gray[i]! > threshold ? 255 : 0
  }
  return mask
}
