/**
 * Trained pipeline — wraps the base CV pipeline with k-NN classification.
 *
 * For each ROI detected by the base pipeline, extracts features from the
 * grayscale sub-image and classifies via k-NN against stored training examples.
 * When k-NN confidence is high enough, the k-NN label overrides the base
 * pipeline's detectPips result.
 */

import { createPipeline } from './pipeline'
import type { Pipeline, PipelineConfig, RoiResult } from './pipeline'
import { extractFeatures } from './features'
import { classifyKnn } from './knnClassifier'
import type { TrainingExample } from './knnClassifier'
import { rgbaToGray } from './background'

export interface TrainedPipeline extends Pipeline {
  setExamples(examples: TrainingExample[]): void
  setConfig(config: Partial<PipelineConfig>): void
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

  function processFrame(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
  ): RoiResult[] {
    const baseResults = base.processFrame(rgba, width, height)
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

  return {
    get state() {
      return base.state
    },
    get config() {
      return base.config
    },
    captureBackground: base.captureBackground,
    processFrame,
    setExamples,
    setConfig: base.setConfig,
  }
}
