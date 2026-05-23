# apps/no-cheat/client/src/components/Camera.tsx

> Video element wrapper that provides camera stream and frame capture via canvas.

## Prompt

Write a camera component that opens a video stream and provides a callback for processing frames.

### Props

`stream: MediaStream | null`, `onFrame?(rgba: Uint8ClampedArray, width: number, height: number)`, `canvasRef?: RefObject<HTMLCanvasElement>`

### Behavior

Attach the stream to a `<video>` element. If `onFrame` provided, set up a `requestAnimationFrame` loop that draws the video to an offscreen canvas, reads `getImageData`, and calls `onFrame` with the RGBA pixel buffer. The canvas overlay (if `canvasRef` provided) is positioned absolutely over the video for drawing bounding boxes.

### Cleanup

Stop all tracks when stream changes or component unmounts.
