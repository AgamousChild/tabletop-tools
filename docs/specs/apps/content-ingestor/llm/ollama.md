# apps/content-ingestor/src/llm/ollama.ts

> Ollama API client — chat, relevance checking, transcript cleanup, concept extraction, timestamp identification.

## Prompt

**`ollamaChat(system, user, config)`** — POST to Ollama `/api/chat` endpoint with system/user messages. Returns response text.

**`checkRelevance(text, config)`** — send text with `RELEVANCE_PROMPT`, return boolean (YES regex test on response).

**`cleanTranscript(text, config)`** — send transcript text with `CLEANUP_PROMPT`, return cleaned text.

**`extractConcepts(source, text, config)`** — chunks long content (>8000 chars), sends each chunk with `EXTRACTION_PROMPT`, parses JSON `ExtractedConcept` arrays, maps to `DraftNode[]` with metadata from source.

**`identifyTimestamps(text, config)`** — send with `TIMESTAMP_PROMPT`, parse JSON array of `{ timestamp, description }`.

## Dependencies

- `../types` — `ContentSource`, `DraftNode`, `IngestConfig`
- `./prompts` — all prompt constants
