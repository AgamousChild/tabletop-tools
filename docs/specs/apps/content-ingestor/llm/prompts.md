# apps/content-ingestor/src/llm/prompts.ts

> System prompts and 40K terminology glossary for LLM operations.

## Prompt

Five exported prompt constants with embedded 40K terminology:

**`GLOSSARY`** — comprehensive 40K faction names, unit names, rules abbreviations, common speech-to-text mishearing corrections.

**`RELEVANCE_PROMPT`** — determine if content is relevant to competitive 40K.

**`CLEANUP_PROMPT`** — fix 40K terminology errors in transcripts using the glossary.

**`EXTRACTION_PROMPT`** — extract tactical concepts as JSON array with title/summary/content/keywords/confidence/category. Expects specific categories: tactic, ruling, worked-example.

**`TIMESTAMP_PROMPT`** — identify timestamps of visual demonstrations (deployment, movement, terrain, board diagrams, live footage).

## Dependencies

None (pure string constants).
