# apps/no-cheat/client/src/lib/cv/blobDetector.ts

> Pip counting via blob detection — find circular dots on a die face image.

## Prompt

Write a blob-based pip detector for dice faces. Operates on grayscale images of any size.

### Types

**`BlobInfo`**: `area`, `perimeter`, `circularity`, `cx`, `cy` (centroid coordinates).

### Algorithm: `detectPips(gray, width, height, config?): number | null`

1. **Otsu binarization** — automatically determine threshold to separate pips from die surface
2. **Connected components** — 4-connectivity BFS to find all blob regions
3. **Filter blobs** — by area (scale-relative: 0.5%-15% of image area) and circularity ≥ 0.4
4. **Try both polarities** — pips may be darker (black dots on white) or lighter (white dots on black) than the surface. Run blob detection on both foreground and background pixel groups.
5. Return pip count from whichever polarity gives a valid 1-6 count. Return null if neither works.

### Supporting functions

**`otsuBinarize(gray, width, height): { binary: Uint8Array, threshold: number }`** — Otsu's method: histogram the grayscale values, find the threshold that minimizes intra-class variance.

**`findBlobInfo(binary, width, height, target=255): BlobInfo[]`** — BFS flood fill to find all connected components of `target` pixel value. For each blob, compute area, perimeter (count boundary pixels), circularity (`4π × area / perimeter²`), and centroid.

### Design decisions

- Circularity threshold of 0.4 is intentionally loose — dice pips are circles but camera angle/blur can make them elliptical
- Scale-relative area filter means detection works from 320×240 to 1920×1080+ without tuning
- Both-polarity check handles different dice colors (dark pips on light dice and light pips on dark dice)

## Dependencies

None — pure TypeScript.
