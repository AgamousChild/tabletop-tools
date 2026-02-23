/**
 * Die face ROI normalization: resize to 64×64, then apply morphological dilation.
 *
 * All operations are pure TypeScript — no opencv.js dependency.
 *
 * Inputs and outputs are single-channel Uint8Array (grayscale, 0–255).
 */

export const SIZE = 64

/**
 * Resize a grayscale image to 64×64 using nearest-neighbor interpolation.
 * Returns a new Uint8Array of length 64×64.
 */
export function resizeTo64(src: Uint8Array, srcWidth: number, srcHeight: number): Uint8Array {
  if (srcWidth === SIZE && srcHeight === SIZE) {
    return new Uint8Array(src)
  }

  const out = new Uint8Array(SIZE * SIZE)
  const xScale = srcWidth / SIZE
  const yScale = srcHeight / SIZE

  for (let y = 0; y < SIZE; y++) {
    const srcY = Math.min(Math.floor(y * yScale), srcHeight - 1)
    for (let x = 0; x < SIZE; x++) {
      const srcX = Math.min(Math.floor(x * xScale), srcWidth - 1)
      out[y * SIZE + x] = src[srcY * srcWidth + srcX]!
    }
  }

  return out
}

/**
 * Apply morphological dilation with a 3×3 square kernel for `iterations` passes.
 * A pixel is set to 255 if any pixel in its 3×3 neighborhood is 255.
 *
 * Used to normalize pip appearance after thresholding — makes pip blobs more
 * solid and robust to small gaps from the binary mask.
 *
 * Default: 3×3 kernel, 2 iterations (as specified in CLAUDE.md).
 */
export function dilate(
  src: Uint8Array,
  width: number,
  height: number,
  iterations = 2,
): Uint8Array {
  let current = new Uint8Array(src)

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(width * height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxVal = 0

        // 3×3 neighborhood
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
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
