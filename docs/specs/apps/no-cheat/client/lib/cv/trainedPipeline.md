# apps/no-cheat/client/src/lib/cv/trainedPipeline.ts

> Enhanced pipeline — wraps base pipeline with k-NN classification and optional YOLO ML inference.

## Prompt

Write a trained pipeline that layers k-NN and ML detection on top of the base CV pipeline.

### Detection priority (highest to lowest)

1. **ML pipeline (YOLO)** — if loaded, overrides pip counts with model predictions
2. **k-NN classifier** — if high confidence (≥ 0.6), overrides base pipeline
3. **Base pipeline** — blob detection fallback

### Interface: `TrainedPipeline extends Pipeline`

Additional methods:
- `setExamples(examples: TrainingExample[])` — update k-NN training data
- `setMlPipeline(ml: MlPipeline | null)` — attach/detach YOLO model
- `readonly mlResults: RoiResult[] | null` — last async ML detection results
- `readonly mlReady: boolean`

### Factory: `createTrainedPipeline(diceSetId): TrainedPipeline`

### Processing flow per frame

1. Run base pipeline synchronously → get ROI bounding boxes
2. For each ROI, extract grayscale sub-image
3. Extract 13-element feature vector via `extractFeatures()`
4. Classify via `classifyKnn(features, examples, k=3)`
5. If k-NN confidence ≥ 0.6, use k-NN label instead of blob detection result
6. If ML pipeline is ready, fire async detection (doesn't block frame rendering) — when results arrive, override pip counts for matching ROIs

### Key design decisions

- ML runs async so the UI stays responsive at 30fps
- Base pipeline runs every frame for bounding box display even when ML is handling classification
- k-NN uses a confidence threshold to avoid overriding blob detection with low-quality classifications

## Dependencies

- `./pipeline` — `createPipeline`, `Pipeline`, `PipelineConfig`, `RoiResult`
- `./features` — `extractFeatures`
- `./knnClassifier` — `classifyKnn`, `TrainingExample`
- `./background` — `rgbaToGray`
- `./mlPipeline` — `MlPipeline` (type)
