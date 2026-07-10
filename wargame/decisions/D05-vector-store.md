# D05 — Vector store for the local lane

> **Decision.** What replaces Cloudflare Vectorize when brain retrieval runs
> locally (T2 personal / T4 dev), and what physics/study use for their new
> semantic search — behind one interface so the edge keeps Vectorize untouched.
>
> **Status:** drafted 2026-07-06 (loop iteration 3). Grounded in
> `apps/brain/server/src/lib/retrieve.ts` (read today) + `wrangler.toml`.

## Forces (grounded)

- Edge today: **Vectorize** index `brain-nodes`, 768-dim (D04), ~25 000
  vectors; nodes themselves live in **R2**, fetched after the ANN hit.
- Query shape a local store must reproduce (from `retrieve.ts`):
  - **`topK = 50` always**, `returnMetadata: 'all'` (Vectorize caps topK at 50
    with full metadata — the code leans on that ceiling);
  - **metadata filters**: `layer`, `category`, `factionId`, `phase`, and
    **`edition` is now pushed into the Vectorize query as a pre-filter** with
    post-filtering kept as defence-in-depth (`retrieve.ts:209–217`) — *note:
    `apps/brain/CLAUDE.md` still describes edition as post-filter-only; the
    code has moved on. Doc drift, flagged for the brain playbook.*
  - **up to 3 query vectors per question** (primary / original / keyword),
    results merged — so "one query" = up to 3 ANN calls.
  - IDs may be truncated + hash-suffixed (>64-byte Vectorize ID limit) — a
    local store with no such limit should store full IDs and drop that shim.
- **Scale reality: 25 k × 768-dim f32 ≈ 77 MB.** This is *small*. Every
  candidate below can hold it in RAM; exotic infrastructure has nothing to
  offer at this size.
- Stack: SQLite/Turso/Drizzle everywhere (root CLAUDE.md). Rule 6: data lives
  in datastores. The platform's local artifacts are already SQLite files.

**Rubric weights:** Stack ×3 · Effort ×3 · Fit ×2 · Latency ×1 (25 k is fast
everywhere) · Quality ×1 (recall差 negligible at this scale) · Risk ×2.

## Options

### S0 — Brute-force in process (the honest baseline)

Load all vectors into typed arrays; cosine-scan per query. At 25 k × 768 that
is ~20 M multiply-adds per query vector — **single-digit-to-tens of ms** in
Node/browser. Exact recall (better than any ANN), zero dependencies, metadata
filtering is a JS predicate.

- **Limits:** whole index in memory (77 MB — fine on the dev box, heavy for a
  phone browser tab); no persistence semantics of its own.
- **Score:** Fit 5 · Quality 5 · Latency 4 · Effort 5 · Stack 4 · Risk 4 → weighted **4.42**.

### S1 — SQLite-native vectors (sqlite-vec, or libSQL's built-in vector search)

Vectors as a column in the same SQLite file as everything else. Two flavors to
verify at adoption: **sqlite-vec** (SQLite extension, loads into better-sqlite3
/ libsql clients) and **libSQL/Turso native vector search** (F32_BLOB column +
top-k function — no extension, and it also runs on hosted Turso). Either way:
node content, metadata, and vectors in **one file**, queried with SQL WHERE
clauses for the filter set, Drizzle-adjacent.

- **Plays out:** this is the maximal stack-fit answer. A personal offline brain
  (T2) becomes literally *one .db file* — nodes (today in R2) + vectors (today
  in Vectorize) + cross-refs, downloadable as an artifact of the T1 build.
  Filters map to indexed columns instead of Vectorize metadata. At 25 k rows
  even a full-scan vector query is fine (S0 speed), and both flavors offer ANN
  when the corpus grows.
- **Score:** Fit 5 · Quality 4 · Latency 4 · Effort 4 · Stack 5 · Risk 4 → weighted **4.38**.

### S2 — LanceDB (embedded columnar vector DB, TS SDK)

Excellent embedded DX, real ANN, versioned datasets. But it's a **second
datastore format** living beside SQLite for no capability we need at 25 k.

- **Score:** Fit 4 · Quality 4 · Latency 4 · Effort 3 · Stack 2 · Risk 3 → weighted **3.19**.

### S3 — Qdrant / Chroma / pgvector (server-class)

A service to run, back up, and secure — for 77 MB of vectors on a single-user
box. Qdrant earns its keep at millions of vectors and concurrent clients;
pgvector drags a Postgres into a SQLite platform. **Overkill, rejected.**

- **Score:** Fit 3 · Quality 4 · Latency 4 · Effort 1 · Stack 1 · Risk 3 → weighted **2.42**.

### S4 — Static JSON + client-side brute force (physics/study only)

Vectors shipped as a static asset beside `chunks.json`/`slides.json`; the SPA
scans them in a worker thread. For corpora of a few thousand chunks this is
tens of ms in the browser with typed arrays. No server (physics/study have
none — grounded in their CLAUDE.mds), no infra.

- **Score (for that use):** Fit 5 · Quality 5 · Latency 4 · Effort 5 · Stack 5 · Risk 5 → weighted **4.77** (unopposed for static SPAs).

## Wargame

- **S0 vs S1 — the real local contest.** S0 is *faster to build today*; S1 is
  where the data should *live* (Rule 6: datastores, not ad-hoc memory blobs).
  They compose: S1 as storage, with the query path free to scan brute-force
  (S0) under the hood at this scale. The synthesis is "SQLite file as the
  artifact, exact scan as the algorithm, ANN indexes when scale demands."
- **Vectorize parity trap:** topK=50-with-metadata and 64-byte IDs are
  *Vectorize's* quirks. The local interface must not enshrine them — expose
  `topK` uncapped and full IDs; let the Cloudflare impl clamp/truncate. Then
  local retrieval can actually *exceed* edge behavior (e.g. topK=200 candidate
  pools for better re-ranking in the personal brain).
- **Edition filter as first-class column:** the edge index couldn't filter on
  `edition` until recently because re-indexing 25 k nodes was a chore (brain
  CLAUDE.md documents that debt). A fresh local store indexes **all** filter
  keys as columns from day one — the local lane gets the *correct* schema
  Vectorize accreted toward.
- **Do physics/study need S1?** No — they have no server and no cross-session
  write path; S4's static-asset scan is exactly their shape. Forcing them into
  a DB would add moving parts to two personal static SPAs (root rule: stop
  when it works).

## Recommendation

- **brain local lanes (T2 personal / T4 dev / T1 batch build): S1 —
  vectors-in-SQLite, libSQL-native flavor** — **verified live (hardening
  pass 2, 2026-07-06)**: with the repo's own `@libsql/client ^0.14.0` in
  local-file mode, `F32_BLOB` columns, `vector32()`, `vector_distance_cos()`,
  `libsql_vector_idx()` index creation, and `vector_top_k()` ANN queries all
  work. No sqlite-vec extension needed; the existing Turso/Drizzle stack
  round-trips as-is. Built as an artifact of the same T1 pipeline that
  uploads to R2/Vectorize today. Query via a `VectorStore` interface (below); exact scan
  is an acceptable engine at 25 k.
- **physics/study: S4** — embeddings as static assets + worker-thread scan.
- **Edge: Vectorize, untouched.**
- **Rejected:** LanceDB (second format, no need), server-class stores (overkill).

**Flip triggers:** corpus grows past ~250 k vectors or scan latency shows up in
the personal brain UX → enable the ANN index inside S1 (same file, same
interface); Turso-hosted vector search matures into the platform's hosted DB
plans → S1 becomes the *hosted* store too and Vectorize's role shrinks to
edge-cache (revisit in D07's next pass).

## Implementation notes (concrete, this repo)

1. **Interface (the seam, mirroring D01):**
   ```ts
   interface VectorStore {
     query(vector: number[], opts: {
       topK: number
       filter?: { layer?: string; category?: string; factionId?: string; phase?: string; edition?: string }
     }): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>>
     upsert(items: Array<{ id: string; vector: number[]; metadata: … }>): Promise<void>
   }
   ```
   `retrieve.ts` takes a `VectorStore` instead of the raw `vectorize` binding
   (its `RetrieveEnv` already isolates the binding as `any` — clean cut point,
   `retrieve.ts:96–102`). Cloudflare impl wraps `BRAIN_INDEX.query` with the
   topK-50 clamp + ID truncation shim; SQLite impl has neither.
2. **Build integration:** `build-graph.ts` (T1) gains an "emit local store"
   step — same nodes that upload to R2, embedded via D04's provider, written
   to `brain.db`. The personal brain is then *a file you copy*.
3. **Multi-vector merge** (3 queries/question) stays in `retrieve.ts` — it's
   retrieval logic, not store logic; don't push it into the interface.
4. **Doc-drift fix for the brain playbook:** update `apps/brain/CLAUDE.md`'s
   edition-filter paragraph to match `retrieve.ts` (pre-filter + defence-in-
   depth post-filter).
5. **physics/study:** `build-chunks.mjs`/`build-slides.mjs` emit
   `embeddings.bin` (Float32Array, row-aligned with the JSON) — the SPA loads
   it lazily on first semantic query; minisearch stays as the instant keyword
   path (hybrid: keyword first paint, semantic re-rank).
