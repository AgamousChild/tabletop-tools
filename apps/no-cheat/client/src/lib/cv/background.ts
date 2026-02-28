/**
 * Background calibration and subtraction for the no-cheat CV pipeline.
 *
 * Before the first roll in a session, the user points the camera at the empty
 * rolling surface. One frame is captured and converted to grayscale with
 * Gaussian blur applied. This "background" is subtracted from every subsequent
 * live frame to isolate the dice.
 *
 * All operations are pure TypeScript — no opencv.js dependency.
 */

/**
 * Convert an RGBA ImageData buffer to grayscale.
 * Uses standard luminance coefficients (ITU-R BT.601).
 */
export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const N = width * height
  const out = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    out[i] = Math.round(
      0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!,
    )
  }
  return out
}

/**
 * Apply a 5×5 Gaussian blur to a grayscale image.
 * Uses a separable kernel approximation for performance.
 *
 * Kernel (normalized): [1, 4, 6, 4, 1] / 16 (applied horizontally, then vertically)
 */
export function gaussianBlur(gray: Uint8Array, width: number, height: number): Uint8Array {
  const kernel = [1, 4, 6, 4, 1]
  const kSum = 16

  // Horizontal pass
  const horiz = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -2; k <= 2; k++) {
        const sx = Math.min(Math.max(x + k, 0), width - 1)
        sum += gray[y * width + sx]! * kernel[k + 2]!
      }
      horiz[y * width + x] = Math.round(sum / kSum)
    }
  }

  // Vertical pass
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -2; k <= 2; k++) {
        const sy = Math.min(Math.max(y + k, 0), height - 1)
        sum += horiz[sy * width + x]! * kernel[k + 2]!
      }
      out[y * width + x] = Math.round(sum / kSum)
    }
  }

  return out
}

/**
 * Compute per-pixel absolute difference between two grayscale images.
 */
export function absDiffGray(fg: Uint8Array, bg: Uint8Array): Uint8Array {
  const out = new Uint8Array(fg.length)
  for (let i = 0; i < fg.length; i++) {
    out[i] = Math.abs(fg[i]! - bg[i]!)
  }
  return out
}

/**
 * Apply Otsu's method to compute an optimal threshold for a grayscale image,
 * then return a binary mask (0 or 255 per pixel).
 *
 * A minimum threshold floor is applied to avoid triggering on noise
 * when no dice are present in the frame.
 */
export function otsuThreshold(gray: Uint8Array, minThreshold = 15): Uint8Array {
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

  // Enforce minimum threshold to suppress noise
  threshold = Math.max(threshold, minThreshold)

  // Apply threshold
  const mask = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    mask[i] = gray[i]! > threshold ? 255 : 0
  }
  return mask
}

/**
 * Morphological dilation with a square kernel.
 * A pixel is set to 255 if any pixel in its kernel neighborhood is 255.
 */
export function dilate(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
  iterations = 1,
): Uint8Array {
  let current = new Uint8Array(src)

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(width * height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxVal = 0
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const ny = y + ky
            const nx = x + kx
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const v = current[ny * width + nx]!
              if (v > maxVal) maxVal = v
            }
          }
        }
        next[y * width + x] = maxVal
      }
    }

    current = next
  }

  return current
}

/**
 * Morphological erosion with a square kernel.
 * A pixel stays 255 only if ALL pixels in its kernel neighborhood are 255.
 */
export function erode(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
  iterations = 1,
): Uint8Array {
  let current = new Uint8Array(src)

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(width * height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minVal = 255
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const ny = y + ky
            const nx = x + kx
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const v = current[ny * width + nx]!
              if (v < minVal) minVal = v
            } else {
              minVal = 0
            }
          }
        }
        next[y * width + x] = minVal
      }
    }

    current = next
  }

  return current
}

/**
 * Morphological close: dilate then erode.
 * Fills small gaps between nearby foreground regions.
 */
export function morphClose(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
  iterations = 1,
): Uint8Array {
  const dilated = dilate(src, width, height, radius, iterations)
  return erode(dilated, width, height, radius, iterations)
}
