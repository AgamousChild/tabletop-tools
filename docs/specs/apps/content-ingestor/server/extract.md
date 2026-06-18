# apps/content-ingestor/server/src/lib/extract.ts

> Claude-powered node extraction — streams Claude Haiku to extract 40K knowledge nodes from text.

## Prompt

Export `extractNodes(opts)` and `ExtractedNode` interface.

**`ExtractedNode`**: `{ title, category, content, summary, keywords[], factionId?, edition? }`.

**`extractNodes(opts)`**: sends text to Claude streaming API (`claude-haiku-4-5-20251001`, max_tokens=4096, stream=true) with a structured prompt asking it to extract rules, abilities, tactics, etc. Uses streaming to keep connection alive (Workers kill idle connections).

Prompt template instructs Claude to:
- Create nodes for each distinct rule/ability/tactic with specific categories (detachment, stratagem, enhancement, army-rule, tactic, ruling, worked-example, etc.)
- Include factionId as slug if faction-specific
- Detect edition (10th vs 11th) from context clues (detachment points, cleave, multi-detachment = 11th)

Response parsing: read entire SSE stream as text, extract `content_block_delta` events to accumulate text, then `parseJsonArray()` — strips markdown fences, finds JSON array in text, parses. Validate each node with `isValidNode()` (requires title, category, content, summary, keywords).

## Dependencies

None (uses global `fetch` and Anthropic API directly).

## Contracts

- Uses streaming API specifically to avoid Worker idle timeout
- Tolerant JSON parsing: handles markdown-fenced responses
- Invalid nodes are silently filtered out
