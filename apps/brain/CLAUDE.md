# CLAUDE.md — 40K Brain

> Knowledge graph for Warhammer 40,000 10th Edition rules, units, and competitive strategy.

---

## Architecture

Brain does NOT use tRPC or server-core. It's a standalone Hono Worker with R2 + Vectorize + Workers AI.

```
apps/brain/
  server/
    src/
      worker.ts          ← Hono app (all endpoints)
      types.ts           ← Env bindings (R2, Vectorize, AI, API keys)
      build-graph.ts     ← CLI: parse all sources → .local/brain/ JSON
      upload-graph.ts    ← CLI: push .local/brain/ → R2
      lib/
        model.ts         ← Node, NodeRef types
        retrieve.ts      ← Unified retrieval: query → Vectorize → R2 → enriched results
        fetch-nodes.ts   ← R2 node fetching + connected node expansion
        records.ts       ← Aggregation: nodes → AggregatedRecord (parent+children)
        faction-detect.ts← Query parsing: detect factions, strip from query, extract keywords
        browse.ts        ← Browse filtering (top-level records only)
        cross-refs.ts    ← Forward/reverse index loading + cross-ref building
        entity-linker.ts ← Entity detection in content → clickable links
        errata-linker.ts ← Match nodes to their errata/FAQ entries
        format.ts        ← Assemble LLM context + deterministic answer formatting
        combat-knowledge.ts ← Community node builder (from content-ingestor output)
        merge-sources.ts ← Deduplicate nodes across sources
        massage.ts       ← Post-merge cleanup (title normalization, keyword enrichment)
        parsers/         ← One parser per source type (core-rules, faction-pack, etc.)
        normalize/       ← Markdown normalization
  client/
    src/
      pages/BrainScreen.tsx  ← Main page: Search, Browse, Ask, Graph tabs
      components/
        cards/           ← Type-specific display: UnitCard, StratagemCard, etc.
        ResultCard.tsx   ← Search result wrapper
        Overlay.tsx      ← Full-screen card overlay
        FactionBanner.tsx← Faction header display
        ForceGraph.tsx   ← D3 force-directed graph visualization
      lib/
        store.ts         ← Zustand state (query, results, filters, history)
        hooks.ts         ← React hooks for API calls
        card-display.ts  ← Node → card type routing
        entity-linker.ts ← Client-side entity link rendering
        faction-names.ts ← Faction ID → display name mapping
  shared/
    derive-unit-type.ts  ← Shared between server build + client display
```

---

## Env Bindings (Worker)

```typescript
interface Env {
  BRAIN_BUCKET: R2Bucket        // tabletop-tools-brain — nodes, refs, manifest, cache
  BRAIN_INDEX: VectorizeIndex   // bge-base-en-v1.5 embeddings (768-dim)
  AI: Ai                        // Workers AI (embedding + LLM)
  SYNC_SECRET?: string          // Bearer token for /index-vectors, /sync
  CORS_ORIGIN?: string          // Default: https://tabletop-tools.net
  ANTHROPIC_API_KEY?: string    // Claude for /ask (optional, ?model=claude)
  GEMINI_API_KEY?: string       // Gemini with Google Search grounding (optional)
  BUILD_VERSION?: string        // Injected at deploy time
}
```

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | /version | Build version |
| GET | /browse/layers | Category list with counts |
| GET | /browse/nodes?layer=&page=&pageSize= | Paginated browse |
| GET | /browse/node/:id | Single node by ID |
| GET | /browse/unit/:id | Unit + weapons + abilities |
| GET | /browse/detachment/:id | Detachment + stratagems + enhancements |
| GET | /manifest.json | R2 manifest (node file list + hashes) |
| GET | /data/:path | Raw node JSON from R2 |
| GET | /pages/:path | PDF page images (PNG) from R2 |
| POST | /search | Vectorize semantic search → aggregated records |
| POST | /ask | RAG: Vectorize → R2 → Gemini + Brain context → LLM answer |
| POST | /graph-data | Search + connected nodes + edges for force graph |
| POST | /index-vectors | Re-index all nodes into Vectorize (auth required) |
| POST | /sync | Placeholder (build locally, upload to R2) |

---

## Data Pipeline

```
Source files (local)
  ├── GW markdown (C:/R/sync-data/tools/gw-sync/.local/gw/markdown/)
  ├── Wahapedia JSON (apps/data-import/client/public/wahapedia/)
  └── Community nodes (apps/content-ingestor/.local/ingest/)
        ↓
  build-graph.ts (parse + merge + massage + partition)
        ↓
  .local/brain/ (nodes/*.json, refs/*.json, manifest.json)
        ↓
  upload-graph.ts OR manual wrangler r2 commands
        ↓
  R2 bucket: tabletop-tools-brain
        ↓
  /index-vectors endpoint (embed + upsert to Vectorize)
```

**Node count:** ~25,000 (datasheets, weapons, abilities, stratagems, enhancements, rules, errata, community)

---

## Retrieval Pipeline (retrieve.ts)

1. Parse query → detect factions, strip faction tokens, extract mechanic keywords
2. Embed stripped query via Workers AI (bge-base-en-v1.5)
3. Query Vectorize with metadata filters (layer, category, factionId, phase)
4. Fetch matched nodes from R2
5. Optionally: dual embedding (semantic + keyword), connected node expansion, record aggregation
6. Return enriched results with scores, parent maps, cross-refs

---

## Key Patterns

- **Module-scope caching**: allNodes, errataNodes, entityIndex persist across requests in same isolate
- **Manifest hash invalidation**: cache busts when manifest.json content changes
- **Vectorize ID truncation**: node IDs > 64 bytes get truncated + hash suffix
- **Browse categories**: defined as filter functions in worker.ts (not DB queries)
- **Entity linking**: both server-side (in /ask answers) and client-side (in card content)
- **No auth**: Brain is public (read-only). Only /index-vectors and /sync require SYNC_SECRET.

---

## Deploy

```bash
export BUILD_VERSION="$(date +%Y%m%d-%H%M%S)"

# 1. Rebuild graph (if sources changed)
cd apps/brain/server && npx tsx src/build-graph.ts

# 2. Upload to R2
npx wrangler r2 object put tabletop-tools-brain/manifest.json --file .local/brain/manifest.json
for f in .local/brain/nodes/*.json; do npx wrangler r2 object put "tabletop-tools-brain/nodes/$(basename $f)" --file "$f"; done
for f in .local/brain/refs/*.json; do npx wrangler r2 object put "tabletop-tools-brain/refs/$(basename $f)" --file "$f"; done

# 3. Deploy Worker
npx wrangler deploy --var BUILD_VERSION:"$BUILD_VERSION"

# 4. Re-index vectors (if node content changed)
curl -X POST https://tabletop-tools.net/brain/api/index-vectors -H "Authorization: Bearer $SYNC_SECRET"

# 5. Build + deploy client (via gateway)
cd ../client && rm -f tsconfig.tsbuildinfo && rm -rf node_modules/.vite dist
BUILD_VERSION=$BUILD_VERSION npx vite build
cd ../../gateway && rm -rf dist && bash build.sh
npx wrangler pages deploy dist --project-name tabletop-tools --branch main --commit-dirty=true
```

---

## Testing

```bash
cd apps/brain/server && pnpm test    # Server lib tests
cd apps/brain/client && pnpm test    # Client component + lib tests
```

Tests use vitest. Server tests mock R2/Vectorize/AI. Client tests use vitest + jsdom.
