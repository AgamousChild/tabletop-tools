# apps/content-ingestor/src/transcript/fetch.ts

> Download YouTube auto-generated captions as transcript segments via yt-dlp.

## Prompt

Export `fetchTranscript(videoUrl, ytdlpPath, outputDir)`.

Spawns yt-dlp with `--write-auto-sub --sub-lang en --sub-format json3 --skip-download` to fetch subtitle file without video. Parses the `.en.json3` file: extracts events with segments, maps to `TranscriptSegment` objects (start/end converted from ms to seconds), filters empty segments. Returns `Transcript` with `original` segments and `cleaned` undefined.

## Dependencies

- `child_process` — `execFile`
- `fs`, `path`
- `../types` — `Transcript`, `TranscriptSegment`
