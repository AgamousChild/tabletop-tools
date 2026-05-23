# apps/no-cheat/client/src/lib/cv/features.ts

> Feature extraction for k-NN dice pip classification — 13-element feature vector.

## Prompt

Write a feature extraction module that produces a fixed-length vector from a grayscale die face ROI. Used for k-NN classification as an alternative to blob detection.

### Feature vector (13 elements)

| Index | Feature | Description |
|-------|---------|-------------|
| 0-3 | Blob counts at 4 threshold levels | Number of valid blobs at percentile-based thresholds |
| 4 | Area ratio | Total blob area / ROI area |
| 5 | Mean circularity | Average circularity of detected blobs |
| 6 | Area variance | Variance of blob areas (normalized) |
| 7 | Mean intensity | Average pixel value in ROI |
| 8 | Intensity stddev | Standard deviation of pixel values |
| 9 | Dark pixel ratio | Fraction of pixels below median intensity |
| 10 | Aspect ratio | Width/height of bounding box (should be ~1 for dice) |
| 11 | Normalized ROI size | ROI area relative to image size |
| 12 | Center intensity | Mean of central 33% of the ROI (inspired by Artefact2/autodice) |

### Function: `extractFeatures(gray, width, height): number[]`

For blob counts at multiple thresholds: binarize at 4 different thresholds (25th, 40th, 50th, 75th percentile of pixel values), find blobs at each, filter by area (0.5%-15% of ROI) and circularity (≥0.4). Use the best threshold's blobs for geometry features.

### Helper: `filterValidBlobs(blobs, roiArea): BlobInfo[]`

Filter by area range and circularity ≥ 0.4.

## Dependencies

- `./blobDetector` — `findBlobInfo`, `otsuBinarize`, `BlobInfo` (type)
