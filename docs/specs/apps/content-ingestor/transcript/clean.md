# apps/content-ingestor/src/transcript/clean.ts

> Clean 40K terminology errors in transcripts via LLM.

## Prompt

Export `cleanTranscriptText(transcript, config)`. Joins all transcript segments into a single string, sends to Ollama LLM with terminology cleanup prompt (`CLEANUP_PROMPT`), returns transcript with `cleaned` field populated.

## Dependencies

- `../llm/ollama` — `cleanTranscript`
- `../types` — `Transcript`, `IngestConfig`
