# apps/brain/server/src/worker.ts

> Hono REST API serving the 40K knowledge graph — search, browse, Q&A, vector indexing.

## Prompt

Hono app (NOT tRPC) with module-scope caching for nodes, errata, and entity index. Endpoints:

`GET /health`, `GET /manifest.json` (from R2, cached 300s), `GET /data/:file` (R2, cached 1h), `GET /pages/:pdf/:page` (R2 images, cached 1d).

`GET /search?q=&faction=&limit=` — unified retrieval: embed query → Vectorize → R2 node fetch → enriched results with connected nodes and record aggregation.

`GET /browse?layer=&faction=&category=` — filter browse-worthy nodes (exclude child categories like weapons/abilities).

`GET /factions` — list all factions with node counts.

`GET /ask?q=` — orchestrates parallel Gemini + Brain retrieval. Caches Gemini responses 24h. Falls back to keyword relevance filtering when Gemini unavailable. Returns conversational answer + source nodes.

`POST /index-vectors` — auth-gated. Embed all nodes via Workers AI → upsert to Vectorize.

`POST /sync` — auth-gated. Full R2 sync pipeline.

Env: `BRAIN_BUCKET` (R2), `BRAIN_INDEX` (Vectorize), `AI` (Workers AI), `ANTHROPIC_API_KEY?`, `GEMINI_API_KEY?`, `SYNC_SECRET?`, `CORS_ORIGIN?`.

## Dependencies

- `hono`, `hono/cors`
- `./lib/retrieve`, `./lib/browse`, `./lib/sync`, `./lib/fetch-nodes`, `./lib/entity-linker`, `./lib/errata-linker`, `./lib/records`, `./lib/format`, `./lib/cross-refs`
