# apps/no-cheat/client/src/lib/cv/mlPipeline.ts

> YOLO object detection via ONNX Runtime Web — detects dice and classifies pip counts in one pass.

## Prompt

Write an ML inference pipeline that loads a trained YOLOv8n model via ONNX Runtime Web and runs detection on video frames.

### Interface: `MlPipeline`

```typescript
{
  readonly ready: boolean
  load(): Promise<void>
  detect(rgba, w, h): Promise<RoiResult[]>
  dispose(): void
}
```

### Constants

- Model path: `/models/dice-yolov8n.onnx`
- Input size: 640×640
- Confidence threshold: 0.25
- NMS IoU threshold: 0.45
- 6 classes (pip values 1-6)

### Factory: `createMlPipeline(modelPath?): MlPipeline`

Dynamic import of `onnxruntime-web` inside `load()` to avoid bundling it when the model doesn't exist.

### Detection flow

1. Resize input to 640×640 via bilinear interpolation (`resizeBilinear`)
2. Convert RGBA → RGB CHW float32 tensor (`rgbaToRgbChw`)
3. Run ONNX inference session
4. Parse YOLO output: [1, 10, 8400] → transpose to [8400, 10] → extract boxes + class scores
5. Apply confidence threshold
6. Run non-maximum suppression
7. Map detections back to original image coordinates
8. Return as `RoiResult[]`

## Dependencies

- `./pipeline` — `RoiResult` (type)
- `./mlPreprocess` — `resizeBilinear`, `rgbaToRgbChw`, `nonMaxSuppression`, `Detection`
- `onnxruntime-web` — dynamic import
