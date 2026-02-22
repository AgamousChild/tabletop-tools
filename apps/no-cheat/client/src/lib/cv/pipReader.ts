import { binarize, countBlobs, toGrayscale } from './imageUtils'

/**
 * Detect the pip count from a die face captured on a canvas.
 *
 * The image is expected to show a single die face filling most of the frame.
 * Returns a number 0–6.
 *
 * Current implementation: classical CV (grayscale → threshold → blob count).
 * Designed so a TensorFlow.js model can be slotted in as a drop-in replacement
 * once training data is available — the interface stays the same.
 *
 * Assumptions for reliable detection:
 *  - Good lighting, die face roughly centred
 *  - High contrast: dark pips on a light-coloured die face
 *  - Minimum canvas dimension ~100px
 */
export async function detectPips(canvas: HTMLCanvasElement): Promise<number> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context from canvas')

  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)

  const gray = toGrayscale(imageData.data, width, height)
  const binary = binarize(gray, 128)

  // Minimum 2 connected pixels — filters isolated single-pixel noise.
  // Real camera frames produce pips of hundreds of pixels; this threshold
  // is intentionally low so the function works at any resolution.
  const minBlobSize = 2

  return countBlobs(binary, width, height, minBlobSize)
}
