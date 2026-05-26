/**
 * Preprocessing utilities for YOLO inference via ONNX Runtime Web.
 *
 * Handles:
 * - RGBA → RGB CHW tensor conversion
 * - Bilinear resize to model input size (640×640)
 * - Non-maximum suppression (greedy NMS)
 */

/**
 * Convert RGBA pixels to RGB CHW float32 tensor normalized to [0, 1].
 * Output shape: [3, height, width] — channel-first layout for YOLO.
 */
export function rgbaToRgbChw(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const pixels = width * height
  const out = new Float32Array(3 * pixels)

  for (let i = 0; i < pixels; i++) {
    const rgbaIdx = i * 4
    out[i] = rgba[rgbaIdx]! / 255 // R channel
    out[pixels + i] = rgba[rgbaIdx + 1]! / 255 // G channel
    out[2 * pixels + i] = rgba[rgbaIdx + 2]! / 255 // B channel
  }

  return out
}

/**
 * Bilinear resize of an RGBA image to target dimensions.
 * Returns a new Uint8ClampedArray with RGBA pixels.
 */
export function resizeBilinear(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4)
  const xRatio = srcW / dstW
  const yRatio = srcH / dstH

  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio
    const y0 = Math.floor(srcY)
    const y1 = Math.min(y0 + 1, srcH - 1)
    const yFrac = srcY - y0

    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio
      const x0 = Math.floor(srcX)
      const x1 = Math.min(x0 + 1, srcW - 1)
      const xFrac = srcX - x0

      const dstIdx = (y * dstW + x) * 4

      for (let c = 0; c < 4; c++) {
        const topLeft = src[(y0 * srcW + x0) * 4 + c]!
        const topRight = src[(y0 * srcW + x1) * 4 + c]!
        const bottomLeft = src[(y1 * srcW + x0) * 4 + c]!
        const bottomRight = src[(y1 * srcW + x1) * 4 + c]!

        const top = topLeft + (topRight - topLeft) * xFrac
        const bottom = bottomLeft + (bottomRight - bottomLeft) * xFrac
        dst[dstIdx + c] = Math.round(top + (bottom - top) * yFrac)
      }
    }
  }

  return dst
}

/** A detected bounding box with confidence and class. */
export interface Detection {
  x: number // center x (pixel coords in model input space)
  y: number // center y
  w: number // width
  h: number // height
  confidence: number
  classId: number
}

/**
 * Greedy non-maximum suppression.
 *
 * Filters overlapping detections by IoU threshold, keeping highest confidence first.
 * Standard YOLO post-processing step.
 */
export function nonMaxSuppression(
  detections: Detection[],
  iouThreshold: number = 0.5,
): Detection[] {
  if (detections.length === 0) return []

  // Sort by confidence descending
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence)
  const kept: Detection[] = []

  const suppressed = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue
    const a = sorted[i]!
    kept.push(a)

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue
      const b = sorted[j]!
      if (computeIoU(a, b) >= iouThreshold) {
        suppressed.add(j)
      }
    }
  }

  return kept
}

/**
 * Compute intersection-over-union between two boxes.
 * Boxes are in center format (cx, cy, w, h).
 */
function computeIoU(a: Detection, b: Detection): number {
  const ax1 = a.x - a.w / 2,
    ay1 = a.y - a.h / 2
  const ax2 = a.x + a.w / 2,
    ay2 = a.y + a.h / 2
  const bx1 = b.x - b.w / 2,
    by1 = b.y - b.h / 2
  const bx2 = b.x + b.w / 2,
    by2 = b.y + b.h / 2

  const ix1 = Math.max(ax1, bx1),
    iy1 = Math.max(ay1, by1)
  const ix2 = Math.min(ax2, bx2),
    iy2 = Math.min(ay2, by2)

  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const intersection = iw * ih

  const areaA = a.w * a.h
  const areaB = b.w * b.h
  const union = areaA + areaB - intersection

  return union > 0 ? intersection / union : 0
}
