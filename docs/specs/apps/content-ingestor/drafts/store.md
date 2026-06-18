# apps/content-ingestor/src/drafts/store.ts

> Serialize/deserialize DraftNode objects to/from markdown with YAML frontmatter.

## Prompt

**`draftToMarkdown(draft)`** — serialize DraftNode to markdown string with hand-rolled YAML frontmatter (title, status, category, keywords, confidence, source metadata, screenshots array). Body contains Summary, Content, and Source Context sections.

**`markdownToDraft(markdown)`** — parse markdown back to DraftNode. Hand-rolled YAML parser (no library dependency) with special handling for screenshots array and optional fields.

**`saveDraft(draft, outDir, index)`** — write draft as `node-{index}-{slug}.md`.

**`loadDrafts(dir)`** — read all `.md` files, parse each, return `Array<{ draft, filePath }>`.

**`updateDraftStatus(filePath, status)`** — read, modify status in frontmatter, write back.

## Dependencies

- `fs`, `path`
- `../types` — `DraftNode`, `DraftStatus`
