# apps/no-cheat/client/src/lib/cv/background.ts

> Image processing primitives — grayscale conversion, blur, threshold, morphological ops.

## Prompt

Write pure TypeScript image processing functions. No opencv.js, no WASM — these operate on flat `Uint8Array` buffers representing grayscale images.

### Functions

**`rgbaToGray(rgba, width, height): Uint8Array`** — Convert RGBA to grayscale using ITU-R BT.601 luminance: `0.299*R + 0.587*G + 0.114*B`. Input is `Uint8ClampedArray` (from canvas `getImageData`).

**`gaussianBlur(gray, width, height): Uint8Array`** — 5x5 separable Gaussian blur. Kernel: `[1, 4, 6, 4, 1] / 16`. Apply horizontally then vertically. Clamp at edges (repeat border pixels).

**`adaptiveThreshold(gray, width, height, blockSize?, C?): Uint8Array`** — Mean adaptive threshold. For each pixel, compute local mean in a `blockSize × blockSize` window (default 15). If pixel > localMean - C (default 10), output 255 (foreground), else 0. Uses integral image for O(1) per-pixel mean computation.

**`erode(binary, width, height, kernelSize?): Uint8Array`** — Morphological erosion with a square kernel (default 3). A pixel stays 255 only if all neighbors in the kernel are 255.

**`morphClose(binary, width, height, kernelSize?): Uint8Array`** — Morphological close = dilate then erode. Fills gaps between pip dots to form solid die shapes.

**`dilate(binary, width, height, kernelSize?): Uint8Array`** — A pixel becomes 255 if ANY neighbor in the kernel is 255. Used internally by `morphClose`.

### Performance considerations

These functions process every pixel of every video frame at 15-30fps. Tight inner loops, no allocation inside pixel loops, use `Uint8Array` (not regular arrays) for typed memory access.

## Dependencies

None — pure TypeScript math on pixel buffers.
