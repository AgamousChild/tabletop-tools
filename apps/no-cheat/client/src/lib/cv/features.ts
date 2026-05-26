/**
 * Feature extraction for k-NN dice pip classification.
 *
 * Extracts a 13-element feature vector from a grayscale die ROI:
 *   [0-3]  Blob counts at 4 threshold levels
 *   [4-6]  Aggregate blob geometry (area ratio, mean circularity, area variance)
 *   [7-9]  Intensity stats (mean, stddev, dark pixel ratio)
 *   [10-11] Shape (aspect ratio, normalized ROI size)
 *   [12]   Center intensity (mean of central 33% — inspired by Artefact2/autodice)
 *
 * All operations are pure TypeScript — no external CV dependencies.
 */

import { findBlobInfo, otsuBinarize, type BlobInfo } from './blobDetector'

/**
 * Filter blobs by area and circularity constraints.
 * Area must be between 0.5% and 15% of ROI area, circularity >= 0.4.
 */
function filterValidBlobs(blobs: BlobInfo[], roiArea: number): BlobInfo[] {
  const minArea = Math.max(1, Math.floor(roiArea * 0.005))
  const maxArea = Math.floor(roiArea * 0.15)
  return blobs.filter(
    (b) => b.area >= minArea && b.area <= maxArea && b.circularity >= 0.4,
  )
}

/**
 * Compute the percentile value of a grayscale image.
 * @param sorted - sorted pixel values
 * @param p - percentile (0-1)
 */
function percentile(sorted: Uint8Array, p: number): number {
  if (sorted.length === 0) return 128
  const idx = Math.min(Math.floor(p * sorted.length), sorted.length - 1)
  return sorted[idx]!
}

/**
 * Binarize a grayscale image at a manual threshold.
 * Pixels > threshold become 255, otherwise 0.
 */
function manualBinarize(gray: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i]! > threshold ? 255 : 0
  }
  return out
}

/**
 * Extract a 13-element feature vector from a grayscale die ROI.
 *
 * @param roiGray - Grayscale pixel values for the ROI
 * @param w - ROI width
 * @param h - ROI height
 * @returns 13-element feature vector
 */
export function extractFeatures(roiGray: Uint8Array, w: number, h: number): number[] {
  const roiArea = w * h
  if (roiArea === 0) {
    return Array.from<number>({ length: 13 }).fill(0)
  }

  // --- Threshold levels ---

  // Otsu binarize
  const otsuBinary = otsuBinarize(roiGray)

  // Dark pips (target=0 in Otsu binary)
  const otsuDarkBlobs = filterValidBlobs(
    findBlobInfo(otsuBinary, w, h, 0),
    roiArea,
  )
  const blobCountOtsuDark = otsuDarkBlobs.length

  // Light pips (target=255 in Otsu binary)
  const otsuLightBlobs = filterValidBlobs(
    findBlobInfo(otsuBinary, w, h, 255),
    roiArea,
  )
  const blobCountOtsuLight = otsuLightBlobs.length

  // Sorted pixel values for percentile thresholds
  const sorted = new Uint8Array(roiGray)
  sorted.sort()

  // Percentile-25 threshold
  const p25 = percentile(sorted, 0.25)
  const p25Binary = manualBinarize(roiGray, p25)
  const p25Blobs = filterValidBlobs(
    findBlobInfo(p25Binary, w, h, 0),
    roiArea,
  )
  const blobCountP25 = p25Blobs.length

  // Percentile-75 threshold
  const p75 = percentile(sorted, 0.75)
  const p75Binary = manualBinarize(roiGray, p75)
  const p75Blobs = filterValidBlobs(
    findBlobInfo(p75Binary, w, h, 255),
    roiArea,
  )
  const blobCountP75 = p75Blobs.length

  // --- Aggregate blob geometry (from Otsu-dark blobs) ---
  const allBlobs = otsuDarkBlobs

  let totalBlobArea = 0
  let meanCircularity = 0
  let areaVariance = 0

  if (allBlobs.length > 0) {
    for (const b of allBlobs) {
      totalBlobArea += b.area
      meanCircularity += b.circularity
    }
    meanCircularity /= allBlobs.length

    const meanArea = totalBlobArea / allBlobs.length
    for (const b of allBlobs) {
      areaVariance += (b.area - meanArea) ** 2
    }
    areaVariance /= allBlobs.length
  }

  const totalAreaRatio = totalBlobArea / roiArea

  // --- Intensity stats ---
  let sum = 0
  let sumSq = 0
  let darkCount = 0

  for (let i = 0; i < roiArea; i++) {
    const v = roiGray[i]!
    sum += v
    sumSq += v * v
    if (v < 128) darkCount++
  }

  const meanIntensity = sum / roiArea / 255
  const varianceRaw = sumSq / roiArea - (sum / roiArea) ** 2
  const stddevIntensity = Math.sqrt(Math.max(0, varianceRaw)) / 255
  const darkPixelRatio = darkCount / roiArea

  // --- Shape ---
  const aspectRatio = h > 0 ? w / h : 1
  const normalizedSize = Math.sqrt(roiArea) / 100

  // --- Center intensity (inspired by Artefact2/autodice scoreCenterDiff) ---
  // Mean intensity of the central 33% of the ROI.
  // Die faces with more pips have darker centers; fewer pips have lighter centers.
  const cropMargin = Math.floor(Math.min(w, h) / 3)
  let centerSum = 0
  let centerCount = 0
  for (let row = cropMargin; row < h - cropMargin; row++) {
    for (let col = cropMargin; col < w - cropMargin; col++) {
      centerSum += roiGray[row * w + col]!
      centerCount++
    }
  }
  const centerIntensity = centerCount > 0 ? centerSum / centerCount / 255 : meanIntensity

  return [
    blobCountOtsuDark,   // [0]
    blobCountOtsuLight,  // [1]
    blobCountP25,        // [2]
    blobCountP75,        // [3]
    totalAreaRatio,      // [4]
    meanCircularity,     // [5]
    areaVariance,        // [6]
    meanIntensity,       // [7]
    stddevIntensity,     // [8]
    darkPixelRatio,      // [9]
    aspectRatio,         // [10]
    normalizedSize,      // [11]
    centerIntensity,     // [12] — center 33% mean intensity
  ]
}
