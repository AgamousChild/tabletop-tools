# apps/no-cheat/client/src/lib/cv/isolate.ts

> Die face isolation — extract per-die ROI bounding boxes from a binary foreground mask.

## Prompt

Write a die isolation module that takes a binary mask (from morphological close) and returns square bounding boxes for each detected die.

### Roi type

```typescript
{ x, y, width, height, cx, cy, angle: number }
```

Width and height are always equal (square bounding box). Angle is computed from second-order image moments for rotation estimation.

### Algorithm: `extractRois(binary, width, height): Roi[]`

1. **Connected components** — 4-connectivity BFS on the binary mask
2. **Area filter** — reject components below a scale-dependent minimum (eliminates noise)
3. **Centroid merge** — components whose centroids are within a proximity threshold are merged (handles fragmented die outlines where the contour breaks into multiple pieces)
4. **Aspect ratio filter** — reject merged regions with extreme aspect ratios (dice are roughly square)
5. **Compute orientation** — second-order central moments → angle via `0.5 * atan2(2 * μ11, μ20 - μ02)`
6. **Square bounding box** — center on centroid, use max(bbox width, bbox height) as side length, clamp to image bounds

### Scale-dependent parameters

All thresholds scale with image dimensions so detection works at any camera resolution. Min component area, merge distance, etc. are all proportional to `sqrt(width * height)`.

## Dependencies

None — pure TypeScript.
