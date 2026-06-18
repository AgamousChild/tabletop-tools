# apps/brain/server/src/upload-graph.ts

> CLI script — upload locally-built graph JSON files to R2 via wrangler.

## Prompt

Reads manifest, iterates all local JSON files, uploads each via `wrangler r2 object put` with application/json MIME type. Prints success/failure counts. User must call `/index-vectors` endpoint separately to embed nodes into Vectorize.
