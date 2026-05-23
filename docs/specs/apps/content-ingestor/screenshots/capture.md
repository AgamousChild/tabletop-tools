# apps/content-ingestor/src/screenshots/capture.ts

> Capture video frames at specific timestamps using yt-dlp.

## Prompt

**`parseTimestamp(ts)`** — convert "MM:SS" or "HH:MM:SS" to seconds.

**`captureFrame(videoUrl, timestampSec, outputDir, ytdlpPath)`** — download 2-second clip at timestamp with keyframe forcing, falls back to thumbnail if clip download fails.

**`captureMultipleFrames(videoUrl, timestamps, outputDir, ytdlpPath)`** — batch-process array of `{ timestamp, description }`, return `Screenshot[]` with file/timestamp/timestampSec/caption.

## Dependencies

- `child_process` — `execFile`
- `fs`, `path`
- `../types` — `Screenshot`
