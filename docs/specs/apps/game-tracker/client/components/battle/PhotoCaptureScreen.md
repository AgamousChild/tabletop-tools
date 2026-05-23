# apps/game-tracker/client/src/components/battle/PhotoCaptureScreen.tsx

> Capture or upload a board photo for the current turn.

## Prompt

Write a photo capture/upload screen. Props: `onCapture(dataUrl: string | null)`, `required: boolean`, optional `label` (default "Board Photo").

### Behavior

1. Show a file input for image upload (hidden, triggered by button)
2. On file select, read as data URL via `FileReader.readAsDataURL`
3. Show preview image once loaded
4. "Use Photo" button calls `onCapture(dataUrl)`
5. "Retake" button clears preview
6. If `!required`, show "Skip" button that calls `onCapture(null)`

## Dependencies

- `react` — `useRef`, `useState`
