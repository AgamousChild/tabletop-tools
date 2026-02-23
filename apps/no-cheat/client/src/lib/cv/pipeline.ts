/**
 * CV pipeline — composes all stages into a single function.
 *
 * Stages:
 *   1. rgbaToLab         — convert RGBA frame to LAB color space
 *   2. absDiffLab        — subtract background → difference image
 *   3. otsuThreshold     — produce binary foreground mask
 *   4. extractRois       — find per-die bounding rectangles
 *   5. (per ROI) extractGray → resizeTo64 → dilate → cluster / detectBlobs
 *
 * The pipeline holds mutable state (background frame, cluster set) between
 * calls. State is keyed by diceSetId to keep it conceptually associated with
 * the calibrated dice set.
 *
 * No opencv.js dependency — all operations are pure TypeScript.
 */

import { absDiffLab, otsuThreshold, rgbaToLab } from './background'
import { addToCluster, labelCluster as doLabelCluster } from './cluster'
import type { Cluster } from './cluster'
import { detectBlobs } from './blobDetector'
import { extractRois } from './isolate'
import { dilate, resizeTo64 } from './normalize'

export interface RoiResult {
  /** Internal cluster identifier (maps to a pip value after labeling) */
  clusterId: string
  /** Pip count from the SimpleBlobDetector (null if detection failed) */
  blobCount: number | null
  /** The normalized 64×64 grayscale image for this die face */
  normalized: Uint8Array
}

export interface PipelineState {
  diceSetId: string
  backgroundLab: Uint8Array | null
  clusters: Cluster[]
}

export interface Pipeline {
  state: PipelineState
  captureBackground(rgba: Uint8ClampedArray, width: number, height: number): void
  processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[]
  labelCluster(clusterId: string, pipValue: number): void
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
 * Convert an RGBA buffer to a grayscale buffer (luminance channel).
 */
function rgbaToGray(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < out.length; i++) {
    // Standard luminance coefficients
    out[i] = Math.round(
      0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!,
    )
  }
  return out
}

/**
 * Create a CV pipeline instance for a given dice set.
 * Holds background and cluster state in memory.
 */
export function createPipeline(diceSetId: string): Pipeline {
  const state: PipelineState = {
    diceSetId,
    backgroundLab: null,
    clusters: [],
  }

  function captureBackground(rgba: Uint8ClampedArray, width: number, height: number): void {
    state.backgroundLab = rgbaToLab(rgba, width, height)
  }

  function processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[] {
    if (!state.backgroundLab) return []

    // Stage 1–3: LAB absdiff → binary mask
    const frameLab = rgbaToLab(rgba, width, height)
    const diff = absDiffLab(frameLab, state.backgroundLab, width, height)
    const mask = otsuThreshold(diff)

    // Stage 4: Find die face ROIs
    const rois = extractRois(mask, width, height)
    if (rois.length === 0) return []

    // Stage 5: Process each ROI
    const frameGray = rgbaToGray(rgba)
    const results: RoiResult[] = []

    for (const roi of rois) {
      // Extract, resize, dilate
      const roiGray = extractSubImage(frameGray, width, roi.x, roi.y, roi.width, roi.height)
      const resized = resizeTo64(roiGray, roi.width, roi.height)
      const normalized = dilate(resized, 64, 64, 2)

      // Cluster assignment
      const { clusters: updated, clusterId } = addToCluster(normalized, state.clusters)
      state.clusters = updated

      const blobCount = detectBlobs(normalized)

      results.push({ clusterId, blobCount, normalized })
    }

    return results
  }

  function labelCluster(clusterId: string, pipValue: number): void {
    state.clusters = doLabelCluster(state.clusters, clusterId, pipValue)
  }

  return { state, captureBackground, processFrame, labelCluster }
}
