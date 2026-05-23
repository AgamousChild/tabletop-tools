# apps/content-ingestor/src/review/auto-review.ts

> LLM-based automated review using a different model for cross-validation.

## Prompt

**`reviewDraft(draft, config)`** — send draft source context + extracted content to Ollama reviewer model (gemma2:9b), expect verdict (APPROVE/REJECT/FIX) + reason.

**`autoReviewDrafts(draftDir, config)`** — batch-process all drafts in directory. Approve → approved, reject → rejected, fix → stays draft. Return `{ approved, rejected, needsFix }`.

**`REVIEWER_CONFIG`** — exported constant with gemma2:9b model config (intentionally different from llama3.1 extractor for cross-validation).

## Dependencies

- `../llm/ollama` — `ollamaChat`
- `../drafts/store` — `loadDrafts`, `updateDraftStatus`
