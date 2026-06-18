# apps/content-ingestor/server/src/lib/gladia.ts

> Gladia transcription API client — submit YouTube URLs and parse webhooks.

## Prompt

Two exports:

**`submitTranscription(opts)`** — POST to `https://api.gladia.io/v2/pre-recorded` with YouTube URL, callback URL, and English language config. Returns `{ gladiaJobId }`. Uses `x-gladia-key` header for auth.

**`parseGladiaCallback(body)`** — parse webhook payload. Validates `id` field exists. If status is `done`, extracts transcript from `result.transcription.full_transcript`. Otherwise returns error. Returns `{ id, status, transcript, error }`.

## Dependencies

None (uses global `fetch`).
