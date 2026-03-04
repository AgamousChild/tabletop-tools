/**
 * CV pipeline — composes all stages for dice detection and pip counting.
 *
 * Stages:
 *   1. rgbaToGray      — convert RGBA frame to grayscale
 *   2. gaussianBlur     — smooth to reduce noise
 *   3. adaptiveThreshold — local contrast detection (replaces background subtraction)
 *   4. erode            — remove noise speckles
 *   5. morphClose       — fill gaps → merge pip blobs into solid die shapes
 *   6. extractRois      — find per-die bounding rectangles
 *   7. (per ROI) detectPips — count pips directly via blob detection
 *
 * No background reference frame is needed — adaptive thresholding detects dice
 * via local contrast, immune to auto-exposure shifts on phone cameras.
 *
 * No opencv.js dependency — all operations are pure TypeScript.
 */

import { adaptiveThreshold, erode, gaussianBlur, morphClose, rgbaToGray } from './background'
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
  ready: boolean
  width: number
  height: number
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
 * Call captureBackground() to set the ready flag and store dimensions.
 * No background frame is stored — adaptive thresholding works from single frames.
 */
export function createPipeline(diceSetId: string): Pipeline {
  const state: PipelineState = {
    diceSetId,
    ready: false,
    width: 0,
    height: 0,
  }

  function captureBackground(_rgba: Uint8ClampedArray, width: number, height: number): void {
    state.ready = true
    state.width = width
    state.height = height
  }

  function processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[] {
    if (!state.ready) return []
    if (width !== state.width || height !== state.height) return []

    // Stage 1-2: Grayscale + blur
    const frameGray = rgbaToGray(rgba, width, height)
    const frameBlurred = gaussianBlur(frameGray, width, height)

    // Stage 3: Adaptive threshold — detects local contrast features (edges, pips)
    // C=10 for better sensitivity to low-contrast dice (lighter dice on light surfaces)
    const mask = adaptiveThreshold(frameBlurred, width, height, undefined, 10)

    // Stage 4: Morphological open (erode) — removes noise speckles
    // Single iteration preserves more features while still cleaning noise
    const openRadius = Math.max(1, Math.floor(Math.min(width, height) * 0.005))
    const cleaned = erode(mask, width, height, openRadius, 1)

    // Stage 5: Morphological close — fills gaps between pip detections
    // to create solid die shapes. Single iteration to avoid merging adjacent dice.
    const closeRadius = Math.max(2, Math.floor(Math.min(width, height) * 0.012))
    const closed = morphClose(cleaned, width, height, closeRadius, 1)

    // Stage 6: Find die ROIs
    const rois = extractRois(closed, width, height)
    if (rois.length === 0) return []

    // Stage 7: Count pips in each die ROI using the ORIGINAL (un-blurred) grayscale
    const results: RoiResult[] = []
    for (const roi of rois) {
      const roiGray = extractSubImage(frameGray, width, roi.x, roi.y, roi.width, roi.height)
      const pipCount = detectPips(roiGray, roi.width, roi.height)
      // Post-filter: reject ROIs where pip detection failed (non-dice edges)
      if (pipCount !== null) {
        results.push({ roi, pipCount })
      }
    }

    return results
  }

  return { state, captureBackground, processFrame }
}
