# 02 — AI/ML surface inventory (grounded in code)

Every claim here was read from the repository on 2026-07-06, not recalled. File
paths are clickable. **All 16 apps are in the wargame** — including the ones
where the wargamed decision is "should an LLM be involved at all" (that is a
decision, and it gets played out like any other, not hand-waved).

Apps are grouped by the strength of the local-model fit:
**A. live AI surfaces** (AI runs today) → **B. latent surfaces** (no AI today,
but a real, code-visible place a local model would implement/upgrade
functionality) → **C. no-fit** (deterministic/infra by design; the wargamed
recommendation is to keep models out).

---

## A. Live AI/ML surfaces (AI in the code today)

### 1. brain — RAG "Ask" (the big one)

- **Where:** `apps/brain/server/src/worker.ts` (`/ask`, `/search`), `lib/retrieve.ts`, `lib/format.ts`.
- **Config read from `apps/brain/server/wrangler.toml` + `apps/brain/CLAUDE.md`:**
  - Embeddings: **Workers AI `bge-base-en-v1.5`, 768-dim** → **Cloudflare Vectorize** index `brain-nodes`.
  - Answering model routing (`/ask?model=`):
    - `?model=claude` + key → **Anthropic Claude Sonnet** (cloud).
    - default, context ≤ 40 000 chars → **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`** (Workers AI).
    - context > 40 000 chars OR Llama throws → **deterministic** `formatConversationalAnswer` (no LLM).
  - Optional **Gemini** web-search grounding runs in parallel, appended as `WEB SEARCH RESULTS`.
- **Scale:** ~25 000 nodes indexed.
- **Local-model implications:**
  - **LLM** — replace the 70B cloud default with a local 7–14B (D02), a
    GCP-hosted OSS model (D10), or keep 70B as an optional cloud tier (D07).
  - **Embeddings** — `bge-base-en-v1.5` is an **open model**; the exact same
    weights run locally → **zero re-embedding**, vectors stay 768-dim (D04).
  - **Vector store** — Vectorize is Cloudflare-only; local swap needs a local ANN
    store (D05); sqlite-vec is the natural fit for the SQLite/Turso stack.
- **Tension:** live interactive edge traffic — the surface that forces the
  topology decision in [`03-top-level-architecture.md`](03-top-level-architecture.md).

### 2. content-ingestor — the existing local-LLM precedent

- **Where:** `apps/content-ingestor/src/llm/ollama.ts` (+ `extract/`, `transcript/`, `review/`).
- **What it does (read from code):** talks to **Ollama** `/api/chat`,
  `stream:false`, `num_ctx: 8192`, `num_predict: 4096`. Four operations:
  `checkRelevance` (YES/NO on first 2000 chars), `cleanTranscript` (40K
  terminology fixes, chunked at 3000 chars), `extractConcepts` (tactics/rulings
  as JSON, lenient fence-stripping parse), `identifyTimestamps`.
- **Local-model implications:** the **reference architecture** — local model does
  batch work, uploads artifacts that brain serves. Open questions: which model
  best fits 8 GB (D02), robust JSON at 7–8B (D08).

### 3. admin — LLM-as-judge

- **Where:** `apps/admin/server/src/lib/llm-evaluator.ts` (+ `.test.ts`), surfaced in `routers/stats.ts`.
- **What it does:** evaluates answer quality (LLM grading brain's outputs).
- **Local-model implications:** batch-tolerant → can use the higher-quality 14B
  tier (D02); structured verdicts (D08); removes per-eval cloud cost.

### 4. no-cheat — dice vision + loaded-dice statistics (the flagged headline)

- **Where:** stats `apps/no-cheat/server/src/lib/stats/analyze.ts` (chi² df 5 crit
  11.07 @ p .05, per-face |z| ≥ 2.5 ⇒ loaded); classic CV
  `client/src/lib/cv/pipeline.ts`; **scaffolded ML** `client/src/lib/cv/mlPipeline.ts`
  (ONNX Runtime Web + YOLOv8n, 640², 6 classes — **model file absent from repo**);
  trainer `scripts/train-dice-model.py`; plan
  `docs/superpowers/plans/2026-04-30-no-cheat-vision.md` ("Blocked by Micah").
- **Local-model implications:** a **vision-model** problem, the strongest local
  fit on the platform: privacy contract forbids cloud-by-default; the 4060 trains
  and runs YOLO; vision errors couple into the loaded-dice statistics (biased
  misreads manufacture false verdicts). Full treatment:
  **[`decisions/D06-nocheat-vision.md`](decisions/D06-nocheat-vision.md)**.

---

## B. Latent surfaces (no AI today; a local model would implement or upgrade real functionality)

### 5. physics — video lecture search (**high-value local fit**)

- **What it is (`apps/physics/CLAUDE.md`):** personal-use video search. Build
  pipeline (`client/scripts/build-chunks.mjs`, runs locally with ffmpeg): walk
  `.mp4`s → parse sibling transcript (`.vtt`/`.srt`, or **`.txt` approximated by
  spreading sentences uniformly across the duration**) → ~30 s chunks → one frame
  per chunk → static `chunks.json`. SPA searches with **minisearch (keyword)**.
  No server, no auth — pure static.
- **Local-model wargame (three concrete upgrades, all build-time/T1):**
  1. **Local ASR** — the `.txt` uniform-spread fallback is a *guess* at
     timestamps; **Whisper (whisper.cpp / faster-whisper) on the 4060** produces
     real word-level timestamps for every `.mp4`, even those with no transcript
     at all. Direct accuracy upgrade to existing functionality → **D11**.
  2. **Local embeddings → semantic search** — replace/augment minisearch with
     build-time embeddings (bge-base, D04) + a client-side vector search over
     static data. "What did he say about entropy?" beats keyword match → D04/D05.
  3. (Optional) **frame captioning** by a small local VLM for visual search.
- **Topology:** personal app, local build pipeline already — **fully local is
  trivially correct** (T1). No cloud anywhere.

### 6. study — slide search (same shape as physics)

- **What it is (`apps/study/CLAUDE.md`):** personal-use `.pptx` slide search.
  Build pipeline (`build-slides.mjs`, local, LibreOffice): pptx → PDF → per-block
  text + coordinates via `unpdf` → PNGs → static `slides.json`; **minisearch**
  in the SPA. An untracked `client/scripts/ocr-slides.mjs` shows OCR work has
  already started.
- **Local-model wargame:** **local OCR** (image-only/scanned slides — the gap the
  in-progress `ocr-slides.mjs` implies) via PaddleOCR/Tesseract/TrOCR → D11; and
  the same **build-time local embeddings → semantic search** upgrade as physics
  (D04/D05). All T1, all offline.

### 7. versus — combat simulator: the special-rules gap

- **What it is (`apps/versus/CLAUDE.md`):** unit-vs-unit combat math; simulation
  is **pure client-side math** (modifier pipeline); unit data from IndexedDB;
  results cached server-side (feature 10).
- **Keep deterministic:** the simulation itself. An LLM computing probabilities
  would be strictly worse (Rule: don't add layers).
- **Local-model wargame:** features 6–8 require special rules to be "addressed"
  and "applied correctly," with users allowed to add them free-text. Mapping
  **free-text 40K special rules → modifier-pipeline configuration** is a
  translation task an LLM is genuinely good at. Wargame shape: **batch/offline
  compilation** — LLM (local, D02) proposes `rule text → modifier config`
  mappings once per rule, human-reviewable, cached in the DB (Rule 6: data in
  datastores) — **never** at simulation time. Playbook decides: curated table
  only vs. LLM-assisted curation vs. on-demand compile.

### 8. list-builder — ratings explainability + list import

- **What it is (`apps/list-builder/CLAUDE.md`):** army builder with live
  performance ratings from GT+ data; suggests higher-rated alternatives at same
  points; exports plain text.
- **Keep deterministic:** legality rules, points math, rating computation.
- **Local-model wargame:** (a) **import**: parsing arbitrary pasted list text
  (every app exports a different format) into structured lists — classic LLM
  normalization, batch or on-paste, local tier fine; (b) **explain**: "why is X
  rated above Y" natural-language rationale from the rating features — routes
  through the **one** brain LLM provider (Rule 1/3: no second model per app).

### 9. new-meta — list normalization + natural-language meta queries

- **What it is (`apps/new-meta/CLAUDE.md`):** meta analytics (faction tables,
  matchup matrix, **Glicko-2** ratings, CSV import, radical transparency).
- **Keep deterministic:** Glicko-2, matchup math, standings.
- **Local-model wargame:** (a) imported tournament results carry **free-text army
  lists** — normalizing them to faction/detachment/units (feeding
  `faction_entity_id` etc.) is batch LLM work shared with bcp-scraper; (b) a
  natural-language query layer ("which detachment beats Bridgehead?") compiles
  NL → structured queries over existing tables — through the shared provider,
  latency-tolerant, optional.

### 10. bcp-scraper — scraped-list normalization

- **What it is:** scrapes major-event data from BCP into new-meta (per
  `MEMORY.md`; no top-level CLAUDE.md — **ground the code before its playbook**).
- **Local-model wargame:** scraped army lists/faction names are messy free text →
  same batch normalization lane as new-meta (a). Deterministic scraping stays
  deterministic; the LLM only touches the fuzzy text→entity step (T1 batch, D02/D08).

### 11. data-import — fuzzy ID reconciliation (LLM-optional)

- **What it is (`apps/data-import/CLAUDE.md`):** weekly-cron Worker fetches
  BSData XML + Wahapedia CSV → JSON in R2; client syncs to IndexedDB;
  `lib/id-mapping.ts` maps **Wahapedia names ↔ BSData unit IDs**.
- **Keep deterministic:** parsers (they work; LLM parsing of structured XML/CSV
  would be a regression).
- **Local-model wargame:** the name↔ID mapping is exactly the fuzzy-matching
  chore where a **batch local LLM pass proposes matches for the tail** that exact/
  normalized matching misses, emitting a reviewable mapping table (Rule 6). Low
  priority; only if the current mapping's miss-rate justifies it (measure first).

### 12. game-tracker — mostly no-fit, one latent vision surface

- **What it is (`apps/game-tracker/CLAUDE.md`):** live match companion (setup →
  mission → pre-game → per-round VP/CP tracking → summary), photos to R2, feeds
  list-builder ratings.
- **Keep deterministic:** all tracking/scoring flows (they're button presses, not
  language).
- **Latent (park it):** score-sheet/battlefield **photo → structured data** (a
  small local VLM/OCR reading a paper score sheet) — same model family as D11.
  Only worth wargaming if Micah actually wants photo-entry; otherwise no-fit.

---

## C. No-fit by design (wargamed conclusion: keep models out)

### 13. tournament
Swiss pairings, standings/tiebreakers, ELO, registration, cards/awards
(`apps/tournament/CLAUDE.md`). Pairing/standings **must** be deterministic,
auditable, and contestable — an LLM anywhere in that path is a correctness and
trust regression. Peripheral niceties (drafting event descriptions) don't justify
a model dependency. **Verdict: no model.**

### 14. gateway
Deployment infrastructure — Pages project, service-binding proxies
(`apps/gateway/CLAUDE.md`). Nothing to model. **Verdict: no model** (it will,
however, *route* to whatever serving endpoint D07/D10 picks — config, not AI).

### 15. auth-server
Better Auth Worker, CORS-locked (`apps/auth-server/CLAUDE.md`). Security surface:
deterministic by requirement; adding model-generated anything here would be a
vulnerability, not a feature. **Verdict: no model, affirmatively.**

### 16. widget-lab
Local-only PrimeReact evaluation SPA, ships nothing to prod
(`apps/widget-lab/CLAUDE.md`). **Verdict: no model.**

> Consistency (root CLAUDE.md Rules 1/3/6): every "latent" surface above that
> wants text generation routes through the **one shared LLM provider** (see `03`)
> — no app grows a private model; every LLM-proposed mapping/config lands in a
> **database table**, reviewable, not in source code.

---

## Summary map

| # | App | Surface | Kind | Latency | Lane (from `03`) | Decisions |
|---|-----|---------|------|---------|------------------|-----------|
| 1 | brain | Ask (RAG) + embeddings + ANN | text gen | interactive | cloud default; T4 dev; T2 personal; **T5 GCP candidate** | D01–D05, D07, D10 |
| 2 | content-ingestor | extract/clean/relevance | text | batch | T1 (already) | D02, D08 |
| 3 | admin | LLM judge | text eval | batch | T1 | D02, D08 |
| 4 | **no-cheat** | **dice vision** | **vision** | near-real-time | **T2 on-device** | **D06** |
| 5 | physics | ASR + semantic search | ASR/embed | build-time | T1 | D11, D04/D05 |
| 6 | study | OCR + semantic search | OCR/embed | build-time | T1 | D11, D04/D05 |
| 7 | versus | rules→modifier compile | text→config | batch | T1 | D02, D08 |
| 8 | list-builder | list import parse; explain | text | on-paste / batch | T1 / provider | D02, D08 |
| 9 | new-meta | list normalize; NL query | text | batch / interactive-tolerant | T1 / provider | D02, D08 |
| 10 | bcp-scraper | scraped-list normalize | text | batch | T1 | D02, D08 |
| 11 | data-import | fuzzy ID reconcile | text | batch | T1 (measure first) | D02, D08 |
| 12 | game-tracker | (latent) sheet-photo OCR | vision | on-capture | parked | D11 (if wanted) |
| 13 | tournament | — | — | — | no model | — |
| 14 | gateway | — (routes providers) | — | — | no model | D07/D10 config |
| 15 | auth-server | — | — | — | no model (security) | — |
| 16 | widget-lab | — | — | — | no model | — |
