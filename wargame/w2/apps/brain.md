# brain — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day. LLM specifics owned by W1.

## Purpose

Knowledge graph / RAG backend + React SPA for 40K rules, units, and strategy
(10th/11th ed), serving browse, semantic search, Q&A, and force-graph
visualization over ~25k parsed nodes.

## Architecture

- Standalone CF Worker, **no tRPC/server-core** (confirmed zero hits). Entry
  `server/src/worker.ts:93` (Hono), exported at `worker.ts:1432-1434`.
- Module-scope in-isolate caches for all nodes/errata/entity-index, keyed by
  manifest content hash (`worker.ts:22-71`).
- Retrieval pipeline `lib/retrieve.ts` (906 lines): query parse → faction/
  keyword detect → embed → Vectorize with metadata filters → fetch nodes from
  R2 → optional expansion/aggregation.
- Data build is a local Node CLI, not the Worker: `build-graph.ts` (1668
  lines; parses GW markdown, Wahapedia JSON, BSData/MFM, community output
  into `.local/brain/`) + `upload-graph.ts` (pushes to R2 via wrangler).
- Client: `main.tsx` → `renderApp`; `BrainScreen.tsx` (1842 lines) drives
  Search/Browse/Ask/Graph tabs; Zustand store (302 lines); force graph via
  `@xyflow/react` (753 lines).
- Server-driven card layout prototype: `buildDatasheetLayout`
  (`lib/card-layout.ts`, 372 lines) emits generic `CardLayout` JSON rendered
  by `client/.../Renderer.tsx` — **only `datasheet` migrated**; other card
  types still per-category TSX.

## Data model

- **No DB at runtime.** `wrangler.toml` binds only R2 (`BRAIN_BUCKET`),
  Vectorize (`BRAIN_INDEX`), Workers AI. `@tabletop-tools/db` imported only
  by build-time code (`build-graph.ts:10`, `lib/faction-codes.ts:7-8`,
  scripts, tests). Chapter→parent lookups pre-snapshotted into
  `dim/subfactions.json` (R2).
- R2 topology: `manifest.json`, `nodes/*.json` (~40 files / ~32MB),
  `refs/{forward,reverse}-index.json`, `dim/subfactions.json`,
  `cache/gemini/*` (24h TTL), `pages/*.png`.
- Vectorize `brain-nodes` (768-dim bge-base) with metadata incl. `edition`
  (`worker.ts:1374-1391`); IDs >64 bytes truncated+hashed (`worker.ts:79-89`).
- Node schema: single wide polymorphic Zod schema (`lib/model.ts:144-285`,
  ~30 optional structured fields); `NodeRef` edges with closed `RefType` enum
  (`model.ts:68-93`).
- **Rule 6-style content-as-code:** `data/primary-missions.ts` (490 lines,
  hand-transcribed CA2025 cards, "source of truth — NOT parsed"),
  `data/challenger-cards.ts` (219 lines), deprecated
  `data/11th-edition-detachments.ts` (82 lines, self-marked "DO NOT add",
  still executed each build for one node).
- The whole node model is a JSON blob-of-blobs in R2 rather than normalized
  tables — by design, but a design decision worth wargaming.

## API surface

No tRPC/crons/queues. Hono routes in `worker.ts`: `/version`,
`/browse/{layers,nodes,node/:id,unit/:id,detachment/:id,army-rule/:id}`,
`/manifest.json`, `/data/:path`, `/pages/:path`, `POST /search`, `POST /ask`
(RAG; Gemini grounding via `Promise.allSettled`; Llama 3.3 70B default,
`?model=claude` hardcodes `claude-sonnet-4-20250514` at :1046), `POST
/graph-data`, `POST /index-vectors` (Bearer `SYNC_SECRET`, batch 50, explicit
`?file=&offset=&limit=` chunking), `POST /sync` (**placeholder stub**).
Public via gateway binding `BRAIN_API` under `/brain/api/*`.

## Deploy

- Worker + R2 + Vectorize + Workers AI; secrets `SYNC_SECRET`,
  `ANTHROPIC_API_KEY`.
- Deploy dance (CLAUDE.md:220-244): local rebuild → per-file `wrangler r2
  object put` loop → `wrangler deploy` → authenticated re-index POST →
  separate client build via gateway. Fully manual, no CI.
- **Rule 9 risks:** `getAllNodes` (`worker.ts:46-65`) fetches + parses ~25k
  nodes on any cache miss — hit by nearly every endpoint. `/index-vectors`
  chunking is an acknowledged workaround ("too many for one invocation",
  worker.ts:1324-1325), not a solved design. `/ask` chains retrieval +
  Gemini + ~150k-char LLM call + combo scan + optional manifest scan in one
  request.

## Shared-package usage

- Client: only `@tabletop-tools/ui`. Server runtime: none; build-time: `db`,
  `game-content` (faction-pack parser). No server-core (matches docs).
- Rule 3 watch: edition-filter model (`edition.ts`) and faction expansion
  (`factions.ts`) conceptually parallel to logic in data-import — cross-app
  grep worth a follow-up.

## CLAUDE.md drift

- `MAX_LLM_CONTEXT` documented as 40 000 (CLAUDE.md:136-141); code is
  **150 000** (`worker.ts:1066-1072`, comment says 40k was stale).
- `?model=claude` doc says "Claude Sonnet" generically; code pins a dated
  snapshot — vague doc hiding a pinned model ID.
- Everything else checked (endpoints, bindings, edition table, caching,
  no-auth policy) matches.

## Health signals

- 52 server + 43 client test files — largest coverage in the repo. Zero
  TODO/FIXME in non-test source.
- Error handling is deliberately fail-open (combo lookup, faction lists,
  Gemini all swallow) — good for a public read surface, but partial pipeline
  failures (e.g. corrupt forward-index) are invisible; `retrieveError`/
  `geminiError` are surfaced in responses but nothing consumes/alerts.

## Candidate design decision points

1. **R2-as-database topology** — full-scan-then-cache of ~25k nodes vs a
   light D1 index / lazy per-category fetch; cold-start CPU + latency.
2. **Edition filtering post-Vectorize** — in-memory filter vs re-index with
   `$eq` metadata filter (metadata already captured); fork grows with corpus.
3. **Hand-transcribed content-as-code** (~700 lines missions/cards) vs
   parsed/OCR pipeline — maintenance liability every CA revision.
4. **Manual build+upload+reindex dance** vs CI/scheduled rebuild.
5. **Server-driven card layout** — finish migrating all card types to
   `LayoutRenderer` or keep dual rendering paths indefinitely.
6. **`/index-vectors` chunk params vs a real queue** (CF Queues / DO batch).
