# Playbook — brain: local RAG (Ask, embeddings, vector search)

> **Deliverable.** The implementation path that makes brain's retrieval + Ask
> runnable fully locally (dev and personal-offline lanes) while the public edge
> stays untouched — per D01–D05, D07, D10.
>
> **Status:** drafted 2026-07-06 (loop iteration 7). Grounded: brain CLAUDE.md,
> `wrangler.toml`, `lib/retrieve.ts` (embedding + Vectorize call sites),
> `worker.ts` routing branch (`:1033–1077`) — read this session.

## Current state (grounded, two drift finds)

- **Flow:** `/ask` → `retrieve()` (embed via `env.ai.run('@cf/baai/bge-base-en-v1.5')`,
  Vectorize `topK=50` + metadata filters incl. edition pre-filter, R2 node
  fetch) → context assembly (`format.ts`) → **routing** (`worker.ts:1033–1077`):
  `?model=claude` + key → Claude; else context ≤ **150 000 chars** →
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; else / on error → deterministic
  formatter. Optional Gemini web-grounding runs in parallel.
- **Drift find 1:** brain CLAUDE.md says the LLM cutoff is 40 000 chars; code
  says `MAX_LLM_CONTEXT = 150000` (`worker.ts:1072`).
- **Drift find 2 (from D05):** CLAUDE.md describes the edition filter as
  post-Vectorize only; `retrieve.ts:209–217` now pushes it into the query.
- ~25 000 nodes; no auth (public read-only); build lane is
  `build-graph.ts` → `.local/brain/` → `upload-graph.ts`/wrangler → R2 →
  `/index-vectors`.

## Target architecture (decided; this is the wiring order)

Two seams, four providers, zero public-behavior change:

```
retrieve.ts / worker.ts
  ├─ LLMProvider.chat/embed   ← cloudflare (today) | anthropic (today) | ollama (NEW) | gcp (D10, later)
  └─ VectorStore.query/upsert ← vectorize (today) | sqlite "brain.db" (NEW)
build-graph.ts additionally emits brain.db  (nodes + vectors + filter columns)
```

## Implementation plan

### Phase A — Cut the seams (mechanical, no behavior change)

1. `RetrieveEnv` (`retrieve.ts:96–102`) already isolates `ai`/`vectorize` as
   `any` — replace with `LLMProvider`/`VectorStore` interfaces (D01/D05 shapes).
   The two inline `env.ai.run(...)` embed calls (`:196`, `:203`) become
   `provider.embed(texts)`.
2. `worker.ts` routing branch: add `?model=local` → Ollama provider (dev only
   at first — gate on env `LLM_LOCAL_ENDPOINT` being set so prod can't route
   to localhost).
3. **Proof:** existing server tests pass unchanged with the Cloudflare
   implementations; a snapshot test pins `/ask` output pre/post refactor.
4. While in there: fix CLAUDE.md's two drift points (150k cutoff, edition
   pre-filter) — cheap, prevents the next person re-deriving.

### Phase B — Embedding parity check (the go/no-go for everything local)

Local bge-base (ONNX/transformers.js, D04) must produce vectors compatible
with the Vectorize index built by Workers AI. Same weights ≠ guaranteed same
output — **pooling and normalization must match**.

1. Embed ~20 diverse node texts both ways; compare cosine similarity per pair
   (expect ≈ 0.999+) **and** top-10 retrieval overlap on ~10 real queries
   against the same index.
2. Pass → one embedding space platform-wide (D04's premise holds). Fail →
   adjust pooling (CLS vs mean) / normalization flags until parity, or accept
   a local-only index (weaker; documented fallback).

### Phase C — Emit `brain.db` from the build (T1)

1. `build-graph.ts` gains an emit step: nodes + metadata (layer, category,
   factionId, phase, **edition as a real column**) + 768-dim vectors (local
   embed, ~25k texts ≈ minutes on CPU/GPU) into one SQLite file via the D05
   store (sqlite-vec / libSQL-native — verify at adoption).
2. **Proof:** row count == manifest node count; spot-check 5 nodes byte-equal
   to R2 copies; file size sanity (~vectors 77 MB + text).

### Phase D — Local retrieval parity (T4 dev lane)

1. SQLite `VectorStore` impl; `retrieve()` against `brain.db` behind
   `VECTOR_STORE=sqlite`.
2. **Proof — parity harness:** for ~20 logged queries, compare local top-10
   vs Vectorize top-10 (allow rank jitter, require ≥8/10 overlap); edition/
   faction filter tests reuse existing retrieve fixtures.

### Phase E — Local Ask (the visible payoff)

1. `?model=local` end-to-end: retrieve (local store) → context (unchanged
   `format.ts`) → Ollama Tier I (`qwen3:8b-q4_K_M`, `num_ctx 16384` per D03;
   contexts beyond ~60k chars → deterministic formatter exactly as today —
   the 150k cloud cutoff does NOT carry over to a 16k local window; compute
   the local cutoff from token estimate, not chars).
2. Wire the **D02 eval**: same questions → local 8B vs Workers-AI 70B vs
   Claude; judge-graded; results recorded in D02. This is the evidence that
   decides how far the local lane can be trusted.
3. Gemini grounding hop: skip in local mode (it's optional today; absence is
   a documented difference, not a break).

### Phase F — Personal offline brain (T2)

1. Small Hono node server (reuses the Worker app — Hono runs on node) serving
   the existing client + `/ask|/search|/browse` against `brain.db` + Ollama.
   No R2, no Vectorize, no network.
2. **Proof:** airplane-mode demo — clone, copy `brain.db`, `ollama serve`,
   ask a rules question, get a cited answer.

## Verification checklist

- [ ] A: tests green + `/ask` snapshot unchanged; CLAUDE.md drift fixed.
- [ ] B: parity numbers recorded in D04 (cosine + overlap).
- [ ] C: `brain.db` emitted, counts match manifest.
- [ ] D: ≥8/10 top-10 overlap on the query set.
- [ ] E: eval table (8B vs 70B vs Claude) recorded in D02.
- [ ] F: offline demo performed.

## Risks / notes

- Pooling mismatch in B is the only real technical risk — everything after is
  plumbing. Test it *first*.
- Public default stays Workers-AI 70B until D07's two flip conditions hold
  (eval parity + D10 hosting probe) — this playbook deliberately does not
  touch the public route.
- Module-scope caches in the Worker (allNodes, entityIndex) are isolate-lifetime;
  the node server should mirror the manifest-hash invalidation, not TTLs.
