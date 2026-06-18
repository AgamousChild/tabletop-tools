# apps/no-cheat/client/src/lib/cv/mlPreprocess.ts

> Preprocessing utilities for YOLO inference — tensor conversion, resize, NMS.

## Prompt

Write preprocessing functions for feeding camera frames into a YOLO model via ONNX Runtime Web.

### Functions

**`rgbaToRgbChw(rgba, width, height): Float32Array`** — Convert RGBA pixel buffer to RGB channel-first (CHW) float32 tensor normalized to [0,1]. Output shape: `[3, height, width]`. R channel at `[0..pixels]`, G at `[pixels..2*pixels]`, B at `[2*pixels..3*pixels]`.

**`resizeBilinear(src, srcW, srcH, dstW, dstH): Uint8ClampedArray`** — Bilinear interpolation resize of RGBA image. Returns new RGBA buffer at target dimensions.

**`nonMaxSuppression(detections, iouThreshold): Detection[]`** — Greedy NMS: sort by confidence descending, suppress overlapping detections where IoU > threshold. IoU computed from `(x1, y1, x2, y2)` bounding boxes.

### Detection type

```typescript
{ x1, y1, x2, y2, confidence, classId }
```

## Dependencies

None — pure TypeScript math.
