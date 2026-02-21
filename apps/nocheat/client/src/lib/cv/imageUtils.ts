/**
 * Pure image-processing utilities for pip detection.
 * All functions operate on raw pixel arrays — no browser APIs, fully testable.
 */

/**
 * Convert RGBA pixel data to grayscale using the luminosity formula.
 * Returns a Uint8Array of length width * height.
 */
export function toGrayscale(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4]!
    const g = rgba[i * 4 + 1]!
    const b = rgba[i * 4 + 2]!
    // ITU-R BT.601 luminosity weights
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return gray
}

/**
 * Binarize a grayscale array.
 * Pixels below threshold → 0 (dark/pip), at or above → 255 (light/background).
 */
export function binarize(gray: Uint8Array, threshold: number): Uint8Array {
  const binary = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i]! < threshold ? 0 : 255
  }
  return binary
}

/**
 * Count distinct dark blobs in a binary image using flood fill (BFS).
 * Only blobs with area >= minSize are counted (filters single-pixel noise).
 *
 * @param binary   Uint8Array of 0 (dark) or 255 (light), length = width * height
 * @param width    Image width in pixels
 * @param height   Image height in pixels
 * @param minSize  Minimum blob area in pixels to count
 */
export function countBlobs(
  binary: Uint8Array,
  width: number,
  height: number,
  minSize: number,
): number {
  const visited = new Uint8Array(width * height)
  let blobCount = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (binary[idx] === 0 && !visited[idx]) {
        // BFS flood fill to measure this blob
        const queue: number[] = [idx]
        visited[idx] = 1
        let size = 0

        while (queue.length > 0) {
          const curr = queue.pop()!
          size++
          const cx = curr % width
          const cy = Math.floor(curr / width)

          const neighbours = [
            cy > 0 ? curr - width : -1,          // up
            cy < height - 1 ? curr + width : -1, // down
            cx > 0 ? curr - 1 : -1,              // left
            cx < width - 1 ? curr + 1 : -1,      // right
          ]

          for (const n of neighbours) {
            if (n >= 0 && !visited[n] && binary[n] === 0) {
              visited[n] = 1
              queue.push(n)
            }
          }
        }

        if (size >= minSize) {
          blobCount++
        }
      }
    }
  }

  return blobCount
}
