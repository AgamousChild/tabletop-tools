# apps/content-ingestor/server/src/lib/nodes.ts

> Write community nodes to R2 brain bucket and index in Vectorize.

## Prompt

Export `writeNodesToBrain(opts)`.

**Flow:**
1. Read existing `nodes/community.json` from R2 bucket.
2. Convert `ExtractedNode[]` to `BrainNode[]` with `toBrainNode()` — adds `community:` prefixed slugified ID, layer=community, source metadata (type based on URL containing "youtube"), version=1.
3. Deduplicate by ID against existing nodes.
4. Append new nodes to community.json, write back to R2.
5. Update `manifest.json` in R2 with timestamp for community.json.
6. Generate embeddings via Workers AI (`@cf/baai/bge-base-en-v1.5`) using `title. summary. keywords` as text.
7. Upsert embedding vectors to Vectorize in batches of 50. Each vector gets metadata: originalId, title, summary (truncated to 500 chars), layer, category, factionId.

Helper: `vectorizeId(nodeId)` — truncates IDs >64 chars with hash suffix (Vectorize ID length limit). `slugify(title)` — lowercase, non-alphanumeric to hyphens.

## Dependencies

- `./extract` — `ExtractedNode`

## Contracts

- R2 keys: `nodes/community.json`, `manifest.json`
- BrainNode shape: id, layer, category, title, content, summary, sources[], refs[], version, keywords, factionId?, edition?
- Embedding model: bge-base-en-v1.5 via Workers AI binding
- Vectorize batch size: 50
