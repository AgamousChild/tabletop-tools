/**
 * ML inference pipeline using ONNX Runtime Web + YOLOv8.
 *
 * Loads a trained YOLO model from /models/dice-yolov8n.onnx and runs
 * inference to detect dice and classify pip counts in a single pass.
 *
 * Returns results in the same RoiResult format as the traditional pipeline,
 * allowing seamless integration with the existing detection flow.
 */

import type { RoiResult } from './pipeline'
import { resizeBilinear, rgbaToRgbChw, nonMaxSuppression } from './mlPreprocess'
import type { Detection } from './mlPreprocess'

export interface MlPipeline {
  readonly ready: boolean
  load(): Promise<void>
  detect(rgba: Uint8ClampedArray, w: number, h: number): Promise<RoiResult[]>
  dispose(): void
}

const MODEL_PATH = '/models/dice-yolov8n.onnx'
const MODEL_INPUT_SIZE = 640
const CONFIDENCE_THRESHOLD = 0.25
const NMS_IOU_THRESHOLD = 0.45
const NUM_CLASSES = 6 // pip values 1-6

/**
 * Create an ML pipeline instance.
 * Call load() to initialize the ONNX session.
 * If the model file doesn't exist, load() will throw.
 */
export function createMlPipeline(modelPath?: string): MlPipeline {
  // Dynamic import to avoid pulling onnxruntime-web into bundles
  // where the model doesn't exist
  let session: any = null  // ort.InferenceSession
  let isReady = false

  async function load(): Promise<void> {
    const ort = await import('onnxruntime-web')

    // Configure WASM paths
    ort.env.wasm.numThreads = 1
    ort.env.wasm.simd = true

    const path = modelPath ?? MODEL_PATH
    session = await ort.InferenceSession.create(path, {
      executionProviders: ['wasm'],
    })
    isReady = true
  }

  async function detect(
    rgba: Uint8ClampedArray,
    w: number,
    h: number,
  ): Promise<RoiResult[]> {
    if (!session) return []

    const ort = await import('onnxruntime-web')

    // Preprocess: resize to 640x640, convert to RGB CHW float32
    const resized = resizeBilinear(rgba, w, h, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
    const tensor = rgbaToRgbChw(resized, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)

    // Create input tensor: [1, 3, 640, 640]
    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])

    // Run inference
    const inputName = session.inputNames[0]
    const feeds: Record<string, any> = { [inputName]: inputTensor }
    const results = await session.run(feeds)

    // Parse YOLOv8 output
    // Output shape: [1, 4+numClasses, numDetections] (transposed format)
    const outputName = session.outputNames[0]
    const output = results[outputName]
    const detections = parseYoloOutput(output.data as Float32Array, output.dims as number[])

    // Apply NMS
    const filtered = nonMaxSuppression(detections, NMS_IOU_THRESHOLD)

    // Scale back to original image coordinates
    const scaleX = w / MODEL_INPUT_SIZE
    const scaleY = h / MODEL_INPUT_SIZE

    return filtered.map((det) => ({
      roi: {
        x: Math.round((det.x - det.w / 2) * scaleX),
        y: Math.round((det.y - det.h / 2) * scaleY),
        cx: Math.round(det.x * scaleX),
        cy: Math.round(det.y * scaleY),
        width: Math.round(det.w * scaleX),
        height: Math.round(det.h * scaleY),
        angle: 0,
        area: Math.round(det.w * scaleX * det.h * scaleY),
      },
      pipCount: det.classId + 1, // class 0 → pip 1, class 5 → pip 6
    }))
  }

  function dispose(): void {
    session?.release?.()
    session = null
    isReady = false
  }

  return {
    get ready() { return isReady },
    load,
    detect,
    dispose,
  }
}

/**
 * Parse YOLOv8 raw output tensor into Detection objects.
 *
 * YOLOv8 output format: [1, 4+numClasses, numDetections]
 * - Rows 0-3: cx, cy, w, h (in model input pixel coords)
 * - Rows 4+: class confidence scores
 */
function parseYoloOutput(data: Float32Array, dims: number[]): Detection[] {
  const detections: Detection[] = []

  // dims: [1, 4+numClasses, numDetections]
  const numDetections = dims[2]!

  for (let i = 0; i < numDetections; i++) {
    // Extract box coordinates
    const cx = data[i]!
    const cy = data[1 * numDetections + i]!
    const w = data[2 * numDetections + i]!
    const h = data[3 * numDetections + i]!

    // Find best class
    let bestClassId = 0
    let bestClassConf = 0
    for (let c = 0; c < NUM_CLASSES; c++) {
      const conf = data[(4 + c) * numDetections + i]!
      if (conf > bestClassConf) {
        bestClassConf = conf
        bestClassId = c
      }
    }

    if (bestClassConf >= CONFIDENCE_THRESHOLD) {
      detections.push({
        x: cx,
        y: cy,
        w,
        h,
        confidence: bestClassConf,
        classId: bestClassId,
      })
    }
  }

  return detections
}
