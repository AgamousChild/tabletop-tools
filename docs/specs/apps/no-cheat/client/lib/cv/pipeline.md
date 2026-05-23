# apps/no-cheat/client/src/lib/cv/pipeline.ts

> Base CV pipeline — composes all stages for dice detection and pip counting.

## Prompt

Write the composable computer vision pipeline that processes video frames to detect dice and count pips. All operations are pure TypeScript — no opencv.js.

### Pipeline stages

1. `rgbaToGray` — convert camera frame to grayscale
2. `gaussianBlur` — smooth to reduce noise
3. `adaptiveThreshold` — local contrast detection (immune to auto-exposure shifts)
4. `erode` — remove noise speckles
5. `morphClose` — fill gaps to merge pip blobs into solid die shapes
6. `extractRois` — find per-die bounding rectangles
7. Per ROI: `detectPips` — count pips via blob detection

### Types

**`RoiResult`**: `{ roi: Roi, pipCount: number | null }`

**`PipelineConfig`**: `{ contrast: number (default 10), centerCrop: number (default 0, range 0-0.3) }`

**`PipelineState`**: `{ diceSetId, ready, width, height }`

**`Pipeline` interface**: `{ state, config, captureBackground(rgba, w, h), processFrame(rgba, w, h): RoiResult[], setConfig(partial) }`

### Factory: `createPipeline(diceSetId): Pipeline`

Create a pipeline instance bound to a dice set. `captureBackground` stores the background reference frame. `processFrame` runs the full pipeline and returns detected dice with pip counts.

### Design decisions

- No background reference frame needed — adaptive thresholding detects dice via local contrast, which is immune to phone camera auto-exposure shifts
- `centerCrop` trims edges of each ROI before pip detection to reduce false positives from die edges
- Config is adjustable at runtime so the user can tune detection sensitivity

## Dependencies

- `./background` — `rgbaToGray`, `gaussianBlur`, `adaptiveThreshold`, `erode`, `morphClose`
- `./blobDetector` — `detectPips`
- `./isolate` — `extractRois`, `Roi` (type)
