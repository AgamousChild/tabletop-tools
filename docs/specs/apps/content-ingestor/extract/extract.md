# apps/content-ingestor/src/extract/extract.ts

> Full extraction pipeline — relevance check, concept extraction, dedup, screenshots.

## Prompt

Two exports:

**`processContent(source, content, config, existingNodes)`** — checks content relevance via LLM, extracts concepts, validates each draft, deduplicates against existing brain nodes (title substring match or >50% keyword overlap). Returns `DraftNode[]`.

**`processYouTubeVideo(videoUrl, title, config, existingNodes, outputDir)`** — end-to-end YouTube processing: fetch transcript → clean with LLM → extract concepts → identify visual timestamps → capture screenshots via yt-dlp → attach screenshots to drafts. Returns `DraftNode[]`.

## Dependencies

- `../crawlers/youtube` (via transcript fetch)
- `../transcript/fetch`, `../transcript/clean`
- `../llm/ollama` — `checkRelevance`, `extractConcepts`, `identifyTimestamps`
- `./dedup` — `findSimilar`
- `./validate` — `validateDraft`
- `../screenshots/capture` — `captureMultipleFrames`
- `../types`
