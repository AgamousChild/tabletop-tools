# apps/content-ingestor/src/review/interactive.ts

> Command-line interactive review UI for draft nodes.

## Prompt

**`findDraftDirs(baseDir)`** — scan for subdirectories containing `.md` files.

**`reviewDrafts(dataDir)`** — interactive CLI: for each draft, display title, source, confidence, summary excerpt, keywords, similarity warnings. Prompt user with `a` (approve), `r` (reject), `s` (skip), `q` (quit). Update file status on disk. Return counts.

## Dependencies

- `fs`, `path`, `readline`
- `../drafts/store` — `loadDrafts`, `updateDraftStatus`
