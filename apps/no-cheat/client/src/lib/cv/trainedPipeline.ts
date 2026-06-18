/**
 * Trained pipeline — wraps the base CV pipeline with k-NN classification
 * and optional ML (YOLO) inference.
 *
 * Detection layers (highest priority first):
 * 1. ML pipeline (YOLO) — if loaded, overrides pip counts with model predictions
 * 2. k-NN classifier — if high confidence, overrides base pipeline
 * 3. Base pipeline — blob detection fallback
 *
 * The ML pipeline runs async (doesn't block frame processing).
 * Traditional pipeline runs every frame for responsive bounding boxes.
 * ML results override pip counts when available.
 */

import { rgbaToGray } from './background'
import { extractFeatures } from './features'
import type { TrainingExample } from './knnClassifier'
import { classifyKnn } from './knnClassifier'
import type { MlPipeline } from './mlPipeline'
import type { Pipeline, PipelineConfig, RoiResult } from './pipeline'
import { createPipeline } from './pipeline'

export interface TrainedPipeline extends Pipeline {
  setExamples(examples: TrainingExample[]): void
  setConfig(config: Partial<PipelineConfig>): void
  /** Set an ML pipeline for YOLO-based detection. */
  setMlPipeline(ml: MlPipeline | null): void
  /** Last ML detection results (async, may be from previous frame). */
  readonly mlResults: RoiResult[] | null
  /** Whether ML pipeline is loaded and ready. */
  readonly mlReady: boolean
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6

/**
 * Extract a grayscale sub-image from a full grayscale buffer.
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
 * Create a trained pipeline that wraps the base pipeline with k-NN classification.
 *
 * @param diceSetId - Dice set identifier passed to the base pipeline
 * @param options - Optional configuration
 * @param options.confidenceThreshold - Minimum k-NN confidence to override detectPips (default 0.6)
 * @param options.pipelineConfig - Initial pipeline config overrides (contrast, centerCrop)
 */
export function createTrainedPipeline(
  diceSetId: string,
  options?: { confidenceThreshold?: number; pipelineConfig?: Partial<PipelineConfig> },
): TrainedPipeline {
  const threshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const base = createPipeline(diceSetId, options?.pipelineConfig)
  let examples: TrainingExample[] = []
  let mlPipeline: MlPipeline | null = null
  let lastMlResults: RoiResult[] | null = null
  let mlRunning = false

  function processFrame(rgba: Uint8ClampedArray, width: number, height: number): RoiResult[] {
    const baseResults = base.processFrame(rgba, width, height)

    // If ML pipeline is available, run it async (non-blocking)
    if (mlPipeline?.ready && !mlRunning) {
      mlRunning = true
      mlPipeline
        .detect(rgba, width, height)
        .then((results) => {
          lastMlResults = results
          mlRunning = false
        })
        .catch(() => {
          mlRunning = false
        })
    }

    // If we have fresh ML results, use them instead of base pipeline
    if (lastMlResults && lastMlResults.length > 0) {
      return lastMlResults
    }

    if (baseResults.length === 0 || examples.length === 0) {
      return baseResults
    }

    // Convert frame to grayscale for feature extraction
    const frameGray = rgbaToGray(rgba, width, height)

    return baseResults.map((result) => {
      const { roi, pipCount } = result
      const roiGray = extractSubImage(frameGray, width, roi.x, roi.y, roi.width, roi.height)
      const features = extractFeatures(roiGray, roi.width, roi.height)
      const knnResult = classifyKnn(features, examples)

      if (knnResult && knnResult.confidence >= threshold) {
        return { roi, pipCount: knnResult.label }
      }

      return { roi, pipCount }
    })
  }

  function setExamples(newExamples: TrainingExample[]): void {
    examples = newExamples
  }

  function setMlPipeline(ml: MlPipeline | null): void {
    mlPipeline = ml
    lastMlResults = null
  }

  return {
    get state() {
      return base.state
    },
    get config() {
      return base.config
    },
    get mlResults() {
      return lastMlResults
    },
    get mlReady() {
      return mlPipeline?.ready ?? false
    },
    captureBackground: base.captureBackground,
    processFrame,
    setExamples,
    setConfig: base.setConfig,
    setMlPipeline,
  }
}
