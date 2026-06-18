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
import type { Roi } from './isolate'
import { extractRois } from './isolate'

export type { Roi }

export interface RoiResult {
  /** Bounding box of this die in the original frame */
  roi: Roi
  /** Pip count detected via blob analysis (null if detection failed) */
  pipCount: number | null
}

/** Configurable detection parameters (adjustable by user at runtime). */
export interface PipelineConfig {
  /** Adaptive threshold contrast (C value). Higher = fewer detections. Default: 10 */
  contrast: number
  /** Center-crop: fraction of each edge to trim before pip detection (0-0.3). Default: 0.15 */
  centerCrop: number
}

export const DEFAULT_CONFIG: PipelineConfig = {
  contrast: 10,
  centerCrop: 0,
}

export interface PipelineState {
  diceSetId: string
  ready: boolean
  width: number
  height: number
}

export interface Pipeline {
  state: PipelineState
  config: PipelineConfig
  captureBackground(rgba: Uint8ClampedArray, width: number, height: number): void
  processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[]
  setConfig(config: Partial<PipelineConfig>): void
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
 * Center-crop a grayscale sub-image: trim `ratio` fraction from each edge.
 * Inspired by ordovas/dice-scores-recognition which trims outer 20% to
 * eliminate table surface bleed at ROI boundaries.
 */
function centerCropSubImage(
  gray: Uint8Array,
  w: number,
  h: number,
  ratio: number,
): { cropped: Uint8Array; cw: number; ch: number } {
  if (ratio <= 0 || ratio >= 0.5) return { cropped: gray, cw: w, ch: h }

  const marginX = Math.floor(w * ratio)
  const marginY = Math.floor(h * ratio)
  const cw = w - 2 * marginX
  const ch = h - 2 * marginY
  if (cw < 4 || ch < 4) return { cropped: gray, cw: w, ch: h }

  const cropped = new Uint8Array(cw * ch)
  for (let row = 0; row < ch; row++) {
    for (let col = 0; col < cw; col++) {
      cropped[row * cw + col] = gray[(row + marginY) * w + (col + marginX)]!
    }
  }
  return { cropped, cw, ch }
}

/**
 * Create a CV pipeline instance for a given dice set.
 * Call captureBackground() to set the ready flag and store dimensions.
 * No background frame is stored — adaptive thresholding works from single frames.
 *
 * @param diceSetId - Dice set identifier
 * @param initialConfig - Optional initial configuration overrides
 */
export function createPipeline(
  diceSetId: string,
  initialConfig?: Partial<PipelineConfig>,
): Pipeline {
  const state: PipelineState = {
    diceSetId,
    ready: false,
    width: 0,
    height: 0,
  }

  const config: PipelineConfig = { ...DEFAULT_CONFIG, ...initialConfig }

  function captureBackground(_rgba: Uint8ClampedArray, width: number, height: number): void {
    state.ready = true
    state.width = width
    state.height = height
  }

  function setConfig(updates: Partial<PipelineConfig>): void {
    Object.assign(config, updates)
  }

  function processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[] {
    if (!state.ready) return []
    if (width !== state.width || height !== state.height) return []

    // Stage 1-2: Grayscale + blur
    const frameGray = rgbaToGray(rgba, width, height)
    const frameBlurred = gaussianBlur(frameGray, width, height)

    // Stage 3: Adaptive threshold — detects local contrast features (edges, pips)
    // Contrast C is configurable by user for different dice/surface combinations
    const mask = adaptiveThreshold(frameBlurred, width, height, undefined, config.contrast)

    // Stage 4: Morphological open (erode) — removes noise speckles
    const openRadius = Math.max(1, Math.floor(Math.min(width, height) * 0.005))
    const cleaned = erode(mask, width, height, openRadius, 1)

    // Stage 5: Morphological close — fills gaps between pip detections
    // to create solid die shapes. Single iteration to avoid merging adjacent dice.
    const closeRadius = Math.max(2, Math.floor(Math.min(width, height) * 0.012))
    const closed = morphClose(cleaned, width, height, closeRadius, 1)

    // Stage 6: Find die ROIs
    const rois = extractRois(closed, width, height)
    if (rois.length === 0) return []

    // Stage 7: Count pips in each die ROI using the ORIGINAL (un-blurred) grayscale.
    // Center-crop each ROI before analysis (inspired by ordovas/dice-scores-recognition)
    // to remove table surface bleed at bounding box edges.
    const results: RoiResult[] = []
    for (const roi of rois) {
      const roiGray = extractSubImage(frameGray, width, roi.x, roi.y, roi.width, roi.height)
      const { cropped, cw, ch } = centerCropSubImage(
        roiGray,
        roi.width,
        roi.height,
        config.centerCrop,
      )
      const pipCount = detectPips(cropped, cw, ch)
      // Post-filter: reject ROIs where pip detection failed (non-dice edges)
      if (pipCount !== null) {
        results.push({ roi, pipCount })
      }
    }

    return results
  }

  return { state, config, captureBackground, processFrame, setConfig }
}
