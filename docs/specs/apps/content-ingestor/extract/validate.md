# apps/content-ingestor/src/extract/validate.ts

> Validate draft nodes for completeness and truncation.

## Prompt

Export `validateDraft(draft): { valid: boolean, issues: string[] }`.

Checks: summary ≥10 chars (not truncated), content ≥100 chars (not truncated), keywords present, title ≥3 chars, no incomplete bullet points. Truncation detection: ends mid-word without sentence punctuation, unmatched bold/italic markers, unmatched brackets/parentheses.

## Dependencies

- `../types` — `DraftNode`
