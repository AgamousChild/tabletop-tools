/**
 * CV pipeline — composes all stages for dice detection and pip counting.
 *
 * Stages:
 *   1. rgbaToGray      — convert RGBA frame to grayscale
 *   2. gaussianBlur     — smooth to reduce noise
 *   3. absDiffGray      — subtract background → difference image
 *   4. otsuThreshold    — produce binary foreground mask
 *   5. morphClose       — fill gaps → merge pip blobs into solid die shapes
 *   6. extractRois      — find per-die bounding rectangles
 *   7. (per ROI) detectPips — count pips directly via blob detection
 *
 * No calibration-time face labeling is needed — pips are counted directly
 * from the die face image. Only a background capture step is required.
 *
 * No opencv.js dependency — all operations are pure TypeScript.
 */

import { absDiffGray, gaussianBlur, morphClose, otsuThreshold, rgbaToGray } from './background'
import { detectPips } from './blobDetector'
import { extractRois } from './isolate'
import type { Roi } from './isolate'

export type { Roi }

export interface RoiResult {
  /** Bounding box of this die in the original frame */
  roi: Roi
  /** Pip count detected via blob analysis (null if detection failed) */
  pipCount: number | null
}

export interface PipelineState {
  diceSetId: string
  backgroundGray: Uint8Array | null
  bgWidth: number
  bgHeight: number
}

export interface Pipeline {
  state: PipelineState
  captureBackground(rgba: Uint8ClampedArray, width: number, height: number): void
  processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[]
}

/**
 * Extract a grayscale sub-image from a full-image grayscale buffer.
 */
function extractSubImage(
  gray: Uint8Array,
  imgWidth: number,
  x: number,
  y: number,
  w: number,
  h: number,
): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      out[row * w + col] = gray[(y + row) * imgWidth + (x + col)]!
    }
  }
  return out
}

/**
 * Create a CV pipeline instance for a given dice set.
 * Holds background state in memory. No cluster/template state needed.
 */
export function createPipeline(diceSetId: string): Pipeline {
  const state: PipelineState = {
    diceSetId,
    backgroundGray: null,
    bgWidth: 0,
    bgHeight: 0,
  }

  function captureBackground(rgba: Uint8ClampedArray, width: number, height: number): void {
    const gray = rgbaToGray(rgba, width, height)
    state.backgroundGray = gaussianBlur(gray, width, height)
    state.bgWidth = width
    state.bgHeight = height
  }

  function processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[] {
    if (!state.backgroundGray) return []
    if (width !== state.bgWidth || height !== state.bgHeight) return []

    // Stage 1-2: Grayscale + blur
    const frameGray = rgbaToGray(rgba, width, height)
    const frameBlurred = gaussianBlur(frameGray, width, height)

    // Stage 3: Absolute difference
    const diff = absDiffGray(frameBlurred, state.backgroundGray)

    // Stage 4: Otsu threshold (with min floor to suppress noise)
    const mask = otsuThreshold(diff, 15)

    // Stage 5: Morphological close — fills gaps between pip detections
    // to create solid die shapes. Kernel radius scales with image size.
    const closeRadius = Math.max(2, Math.floor(Math.min(width, height) * 0.015))
    const closed = morphClose(mask, width, height, closeRadius, 2)

    // Stage 6: Find die ROIs
    const rois = extractRois(closed, width, height)
    if (rois.length === 0) return []

    // Stage 7: Count pips in each die ROI using the ORIGINAL (un-blurred) grayscale
    const results: RoiResult[] = []
    for (const roi of rois) {
      const roiGray = extractSubImage(frameGray, width, roi.x, roi.y, roi.width, roi.height)
      const pipCount = detectPips(roiGray, roi.width, roi.height)
      results.push({ roi, pipCount })
    }

    return results
  }

  return { state, captureBackground, processFrame }
}
