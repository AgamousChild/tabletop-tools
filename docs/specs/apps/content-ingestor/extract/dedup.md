# apps/content-ingestor/src/extract/dedup.ts

> Load existing brain nodes and find duplicates via title/keyword matching.

## Prompt

**`loadExistingNodes(brainNodesDir)`** — reads `community.json`, extracts `{ id, title, keywords }` for each node.

**`findSimilar(draft, existing)`** — bidirectional title substring match (case-insensitive) and keyword overlap check (>50% of draft keywords found in existing node). Returns matching node ID or undefined.

## Dependencies

- `fs` — `readFileSync`, `existsSync`
- `path`
