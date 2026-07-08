# D04 — Embeddings model for the local lane

> **Decision.** Which open embedding model the local lane uses for brain RAG
> (and the physics/study semantic-search upgrades) — and whether it must match
> the edge's model exactly.
>
> **Status:** drafted 2026-07-06 (loop iteration 3). Grounded in
> `apps/brain/server/src/lib/retrieve.ts` (read today).

## Forces (grounded)

- The edge embeds with **`@cf/baai/bge-base-en-v1.5`** (768-dim) — verified at
  `retrieve.ts:196` (`env.ai.run('@cf/baai/bge-base-en-v1.5', …)`). ~25 000
  node vectors live in Vectorize under that model.
- Retrieval is **multi-vector**: up to three embeddings per question (stripped
  query, original query when faction-stripping shortened it, keyword string —
  `retrieve.ts:190–207`). Whatever runs locally must be cheap enough to embed
  2–3 texts per query without caring.
- **The iron law of embeddings: query model == index model.** Vectors from
  different models (or even major revisions) are not comparable. Every option
  below is really a statement about *which index exists where*.
- New consumers from the inventory: physics (~30 s transcript chunks) and study
  (slide text) want build-time embeddings for semantic search — small corpora
  (thousands, not millions).
- bge-base-en-v1.5 is MIT-licensed and tiny (~110 M params, ~0.2–0.4 GB) —
  runs on CPU fast; GPU is never required for our volumes.

**Rubric weights:** Stack ×3 (index compatibility is everything) · Quality ×2 ·
Fit ×2 · Effort ×2 · Latency ×1 · Risk ×2.

## Options

### E1 — bge-base-en-v1.5 locally (mirror the edge exactly)

Run the *same weights* locally. Local query vectors are then valid against a
copy of the existing index, and locally-embedded nodes are valid for the edge
index. **Zero re-embedding, zero drift, one embedding space platform-wide.**

- **Runtimes:** sentence-transformers (Python, reference), **transformers.js /
  ONNX** (runs in Node — drops straight into `build-chunks.mjs` /
  `build-slides.mjs` build scripts with no Python dependency), fastembed, or
  Ollama *if* the registry has a faithful bge-base GGUF (**verify at adoption
  — embedding GGUF availability/pooling fidelity varies**; the ONNX path is
  the known-exact one).
- **Score:** Fit 5 · Quality 3 · Latency 5 · Effort 5 · Stack 5 · Risk 5 → weighted **4.53**.

### E2 — bge-large-en-v1.5 (1024-dim upgrade, both sides)

*(est.)* Meaningfully better retrieval than base. Workers AI **also hosts it**,
so edge/local parity survives an upgrade. Cost: **re-embed all ~25 k nodes**
(minutes on the 4060 — trivial) and **rebuild both indexes** (Vectorize
re-index via the existing `/index-vectors` endpoint + local re-index), plus
1024-dim storage everywhere.

- **Score:** Fit 4 · Quality 4 · Latency 4 · Effort 3 · Stack 4 · Risk 4 → weighted **3.88**.

### E3 — nomic-embed-text-v1.5 (long-context, Matryoshka)

8192-token context (vs bge's 512) — attractive for embedding *whole nodes*
instead of truncations; Matryoshka dims (768→64). But **not on Workers AI**:
adopting it forks the embedding space between edge and local, or forces the
edge to call somewhere else. Apache 2.0.

- **Score:** Fit 4 · Quality 4 · Latency 4 · Effort 2 · Stack 2 · Risk 3 → weighted **3.12**.

### E4 — Qwen3-Embedding family (0.6B/4B/8B)

*(est.)* Top of the open leaderboards in-window; instruction-aware; would pair
with the D02 Qwen3 text family. Same fork problem as E3 (not on Workers AI),
heavier, and the platform's corpus is English rules text where bge-base is
already adequate *(est.)*.

- **Score:** Fit 3 · Quality 5 · Latency 3 · Effort 2 · Stack 2 · Risk 3 → weighted **3.12**.

### E5 — mxbai-embed-large / gte / e5 (the field)

Competent alternatives with the same non-parity defect and no decisive quality
case for this corpus. Not scored individually; they lose on Stack for the same
reason as E3/E4.

## Wargame

- **Parity vs quality is the whole game.** E3/E4/E5 all offer *(est.)* better
  MTEB numbers, and all fork the embedding space. A fork means: brain-local
  answers from a *different* index than brain-edge, retrieval bugs stop being
  reproducible across lanes, and every node ingest must embed **twice**. That
  is exactly the "parallel implementations of the same data" the root
  CLAUDE.md Rule 1 bans. Only E1 and E2 preserve one space.
- **E1 vs E2:** E2's quality gain is real *(est.)* but unproven **on this
  corpus**; E1 is free. The platform already has the harness to decide
  honestly: log real queries, build the D02 eval's retrieval slice
  (hit-rate@k on known-answer questions), run both models side by side
  locally, and only then pay E2's coordinated re-index. Upgrading embeddings
  *without* that eval would be a leaderboard-driven migration — the thing this
  wargame exists to prevent.
- **The 512-token truncation question:** bge's short window means long nodes
  are embedded by their head. If the retrieval eval shows misses concentrated
  in long nodes, that's evidence for E3-class long-context embedders — but the
  cheaper first fix is chunked node embedding (multiple vectors per node),
  which stays inside the E1 space. Note it; don't jump.
- **physics/study:** no parity constraint (their indexes are fresh and local-
  only) — but running the same E1 model keeps one embedding stack, and their
  corpora are small enough that model choice barely matters *(est.)*.

## Recommendation

**E1 — mirror `bge-base-en-v1.5` locally** via the ONNX/transformers.js path
for Node build scripts and batch jobs (exact-weights parity, no Python
dependency), **unchanged on the edge**. Adopt for brain-local, physics, and
study. **E2 (bge-large) is the designated upgrade**, gated behind the
retrieval-quality eval, executed as one coordinated re-embed + re-index on
both sides (the `/index-vectors` endpoint already exists for the edge half).

**Flip triggers:** retrieval eval shows bge-base hit-rate materially below
bge-large on logged queries → schedule the E2 coordinated migration; misses
concentrate in >512-token nodes → chunked embedding first, long-context
embedder (E3) only if chunking fails; Workers AI deprecates bge-base → E2
immediately (same event, forced).

## Implementation notes (concrete, this repo)

1. **Provider seam:** `embed(texts: string[])` joins `chat()` on the shared
   LLM provider (D01) — Cloudflare impl calls `env.AI.run('@cf/baai/…')`
   exactly as `retrieve.ts:196` does today; local impl runs ONNX bge-base.
   `retrieve.ts` swaps its two inline `env.ai.run` calls for the provider.
2. **Dims are config:** 768 is asserted in one place (the provider), so an E2
   migration is a config + migration script, not a hunt.
3. **Multi-vector cost:** 3 embeds/query × 110 M params on CPU ≈ milliseconds —
   no GPU reservation needed; never co-tenant it into the LLM's VRAM budget
   (keeps D03's math clean).
4. **physics/study:** add embedding emission to `build-chunks.mjs` /
   `build-slides.mjs` (vectors land beside `chunks.json`/`slides.json`);
   client-side search consumes them per D05's store choice.
5. **Eval hook:** the retrieval slice of the D02 protocol = logged `/ask`
   queries + known-relevant node IDs → hit-rate@10/@50 per model. One script,
   reusable for every future embedding question.
