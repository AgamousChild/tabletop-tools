# Wargame: Local Open-Source LLM/ML Implementation

> **Purpose.** Systematically "wargame" every AI/ML-amenable surface across the
> Tabletop Tools platform and produce documentation on how to accurately
> re-implement that functionality with **open-source models that run on Micah's
> actual hardware** (RTX 4060 8 GB · i7-14700F 20C/28T · 32 GB RAM).
>
> "Wargame" here = decision analysis. For every decision point we enumerate the
> real choices, play each one out against hard constraints (VRAM, latency,
> accuracy, privacy, dev-effort, the Cloudflare-Workers deploy model), score
> them, and land a recommendation **with a fallback**. No hand-waving; every
> claim is anchored to code we read or hardware we measured.

---

## How to read this

Read in order the first time:

1. [`00-methodology.md`](00-methodology.md) — what a "wargame" is here, the scoring rubric, how to read a decision doc.
2. [`01-system-capabilities.md`](01-system-capabilities.md) — the measured hardware and exactly what model sizes fit.
3. [`02-ai-surface-inventory.md`](02-ai-surface-inventory.md) — every app, where AI lives today (grounded in code), what is local-able.
4. [`03-top-level-architecture.md`](03-top-level-architecture.md) — **the** decision: edge vs. local vs. batch/hybrid. Read this before any per-decision doc.

Then the decision register (`decisions/`) and per-app playbooks (`apps/`).

---

## Decision register

Each is a standalone decision doc under `decisions/`. Status board is the
source of truth for what's done vs. pending (the hourly loop works this list
top-to-bottom).

| ID | Decision | Drives | Status |
|----|----------|--------|--------|
| **D01** | LLM serving runtime (Ollama / llama.cpp / vLLM / LM Studio / TGI) | brain, content-ingestor, admin | ✅ **drafted** — [`decisions/D01-serving-runtime.md`](decisions/D01-serving-runtime.md) |
| **D02** | Text model & size (Qwen3 family / Llama 3.1 / Phi-4 / Gemma 3 + eval protocol) | brain Ask, ingestor, judge | ✅ **drafted** — [`decisions/D02-text-model.md`](decisions/D02-text-model.md) |
| **D03** | Quantization & VRAM budget (GGUF Q4_K_M / Q5 / Q8 / AWQ / GPTQ / FP8) | all LLM surfaces | ✅ **drafted** — [`decisions/D03-quantization.md`](decisions/D03-quantization.md) |
| **D04** | Embeddings model (keep `bge-base-en-v1.5` local / bge-large / nomic / gte / e5) | brain RAG | ✅ **drafted** — [`decisions/D04-embeddings.md`](decisions/D04-embeddings.md) |
| **D05** | Vector store (Vectorize → sqlite-vec / LanceDB / Qdrant / Chroma / pgvector) | brain RAG | ✅ **drafted** — [`decisions/D05-vector-store.md`](decisions/D05-vector-store.md) |
| **D06** | **no-cheat dice vision** (CV / YOLOv8·11 / RT-DETR / small VLM / cloud) | no-cheat | ✅ **drafted** — [`decisions/D06-nocheat-vision.md`](decisions/D06-nocheat-vision.md) |
| **D07** | Serving topology (edge-only / local-only / hybrid-batch / self-host / GCP) | platform-wide | ✅ **decided** — [`decisions/D07-serving-topology.md`](decisions/D07-serving-topology.md) (analysis in [`03`](03-top-level-architecture.md)) |
| **D08** | Orchestration & structured output (JSON mode / schema-constrained / grammars / Zod retry ladder) | ingestor, judge, all normalizers | ✅ **drafted** — [`decisions/D08-structured-output.md`](decisions/D08-structured-output.md) |
| **D09** | Ops: VRAM guard, model lifecycle, batch scheduling, monitoring | all | ✅ **drafted** — [`decisions/D09-ops.md`](decisions/D09-ops.md) |
| **D10** | Hosted OSS serving on GCP (Cloud Run GPU: L4 24GB / Blackwell 96GB; scale-to-zero verified) — **unlocked by Micah's GCR access** | brain public `/ask`, any live OSS surface | ✅ **drafted** — [`decisions/D10-gcp-serving.md`](decisions/D10-gcp-serving.md) |
| **D11** | Local media models: ASR (faster-whisper) + OCR adequacy gate + VLM frame captioning | physics, study, game-tracker (latent) | ✅ **drafted** — [`decisions/D11-media-models.md`](decisions/D11-media-models.md) |

## Per-app playbooks — all 16 apps

Grounding for every row: [`02-ai-surface-inventory.md`](02-ai-surface-inventory.md).
"No-fit" rows are wargamed conclusions (documented in `02`), not omissions.

| App | AI surface (grounded) | Status |
|-----|------------------------|--------|
| no-cheat | dice-face vision + loaded-dice stats coupling | ✅ **playbook** — [`apps/no-cheat.md`](apps/no-cheat.md) (D06 = model choice; playbook = build path) |
| brain | RAG Ask, embeddings, vector search | ✅ **playbook** — [`apps/brain.md`](apps/brain.md) |
| content-ingestor | relevance / cleanup / extraction / timestamps (already Ollama) | ✅ **playbook** — [`apps/content-ingestor.md`](apps/content-ingestor.md) |
| admin | LLM-as-judge evaluator → platform grader | ✅ **playbook** — [`apps/admin.md`](apps/admin.md) |
| physics | **local ASR (Whisper) + VLM captions + semantic search** | ✅ **playbook** — [`apps/physics.md`](apps/physics.md) |
| study | **OCR adequacy gate + semantic search** (OCR already ships) | ✅ **playbook** — [`apps/study.md`](apps/study.md) |
| versus | ability text → typed `WeaponAbility[]` compile (batch + review + shared data) | ✅ **playbook** — [`apps/versus.md`](apps/versus.md) |
| list-builder | list import (reuse `parseList`) + explanation cache | ✅ **playbook** — [`apps/list-builder.md`](apps/list-builder.md) |
| new-meta | parse-tail normalization + whitelisted NL queries | ✅ **playbook** — [`apps/new-meta.md`](apps/new-meta.md) |
| bcp-scraper | scraper stays deterministic; tail runs local (thin by design) | ✅ **playbook** — [`apps/bcp-scraper.md`](apps/bcp-scraper.md) |
| data-import | measurement-gated mapping-tail proposals | ✅ **playbook** — [`apps/data-import.md`](apps/data-import.md) |
| game-tracker | **parked with explicit unpark conditions** | ✅ **playbook** — [`apps/game-tracker.md`](apps/game-tracker.md) |
| tournament | no-fit by design (pairings must be deterministic/auditable) | ✅ documented in `02` |
| gateway | no model — routes providers (D07/D10 config) | ✅ documented in `02` |
| auth-server | no model, affirmatively (security surface) | ✅ documented in `02` |
| widget-lab | no model (local UI lab) | ✅ documented in `02` |

---

## Status board (loop-maintained)

- **2026-07-06** — Framework established. Grounded hardware profile, AI-surface inventory (read code, not memory), top-level architecture tension. **D06 (no-cheat vision) drafted first** per Micah's explicit interest.
- **2026-07-06 (2)** — **All 16 apps added to the wargame** (Micah's correction). Read every app's CLAUDE.md; inventory rewritten as a full census: 4 live AI surfaces, 8 latent surfaces (incl. physics **local-Whisper** + study **local-OCR** — high-value fully-local wins), 4 wargamed no-fits. **GCR access registered** → new topology **T5 (GCP Cloud Run GPU)** in `03` + new decision **D10**; new decision **D11** (local ASR/OCR media models).
- **2026-07-06 (3)** — Hourly loop **scheduled** (job `dd7b93f6`, fires at :07, session-bound, 7-day auto-expiry). Micah provided [nell-byler/dice_detection](https://github.com/nell-byler/dice_detection) + Kaggle [`nellbyler/d6-dice`](https://www.kaggle.com/datasets/nellbyler/d6-dice) (250 labeled d6 images, YOLO-format labels, BSD-3) → folded into **D06** as seed data + existence proof. **D01 (serving runtime) drafted**: Ollama primary / llama-server escalation / vLLM designated for the GCP T5 lane; unify on OpenAI-compat wire protocol.
- **2026-07-06 (4)** — **D02 (text model) drafted** on Micah's "run the loop now". Grounding found **five-model sprawl** in production paths (`llama3.1:8b` + `gemma2:9b` local, stale `llama-3-8b` in the admin judge, 70B for brain, claude-haiku in Worker extract). Recommendation: consolidate on the **Qwen3 family** — 8B Q4_K_M Tier I default, 14B Tier II batch, 4B Tier III degraded/bulk — with `llama3.1:8b` as instant rollback, and a platform-real **eval protocol** (not leaderboards) as the actual decider before any tier flip ships.
- **2026-07-06 (5)** — "keep going": **D03, D04, D05 drafted** back-to-back. D03: Q4_K_M pinned default, KV-cache policy (q8_0 for brain-16k via llama-server; q4 KV banned for RAG), per-tier VRAM budget table, AWQ/FP8 for the GCP lane. D04: mirror `bge-base-en-v1.5` locally via ONNX (exact edge parity, zero re-embed; bge-large as eval-gated upgrade). D05: vectors-in-SQLite for brain local lanes behind a `VectorStore` seam (Vectorize untouched at edge); static-asset brute-force for physics/study; found + flagged brain CLAUDE.md edition-filter **doc drift** vs `retrieve.ts` (pre-filter now pushed into Vectorize).
- **2026-07-06 (6)** — **D07, D08, D09 drafted.** D07 formalizes the topology (routing table now authoritative). D08 found a real defect while grounding: `extractConcepts` **silently drops** chunks whose JSON fails to parse (`ollama.ts` continue-on-null — no log, no retry, no metric); recommendation is a layered ladder (shared Zod schemas → schema-constrained decoding → validate-retry-with-error → GBNF escalation → review-queue table). D09: `checkVramBudget()` guard (refuse-loudly policy for Quest-link contention), keep_alive/residency policy, resumable chunked batches via Task Scheduler, run-log monitoring, failure playbook.
- **2026-07-06 (7)** — **D10 + D11 drafted → the decision register is COMPLETE (11/11).** D10 grounded against live Google docs: L4 24GB + scale-to-zero + ~5s instance cold-start verified; **RTX PRO 6000 Blackwell 96GB** discovered → a real "our own 70B publicly served" endgame exists (behind two triggers); recommendation stays G0 (Workers AI default) + one-day L4 probe spec. D11 grounded in the scripts: physics now uses **scene-detection** (CLAUDE.md stale) and study **already ships tesseract.js OCR** (CLAUDE.md silent) — recommendation: faster-whisper large-v3 for missing/mis-timed transcripts, keep tesseract behind a measurement gate, VLM captioning for equation-heavy physics frames.
- **2026-07-06 (8)** — Loop retimed to **every 10 minutes** (job `240a581e`, :03/:13/:23/:33/:43/:53). **no-cheat playbook drafted**: 5-phase build path (dataset w/ val split → 4060 training w/ confusion matrix → WebGPU browser integration → 3 acceptance gates protecting the statistics → custom-dice symbol maps + per-set fine-tune). Grounding find: **PLAN.md Phase 4 claims a server `vision` router that does not exist** (grep = 0 hits) — vision is fully client-side, which is correct per the privacy contract; PLAN.md drift flagged.
- **2026-07-06 (9)** — **brain, content-ingestor, admin playbooks drafted** (4/12 playbooks done). New drift find: brain `MAX_LLM_CONTEXT` is **150 000** chars in `worker.ts:1072` — CLAUDE.md says 40 000. brain playbook: 6 phases (seams → embedding-parity go/no-go → `brain.db` emit → retrieval parity → local Ask + eval → airplane-mode offline brain). content-ingestor: 5 phases hardening the existing lane (shared provider, silent-drop fix, eval-gated model flip, D09 runner, cloud-lane reconcile). admin: judge → Tier II local + promotion to the platform's reusable `grade()` harness; flagged 16 pre-existing red crosswalk tests as Phase 0 (no refactor on red); flagged judge-grades-own-family bias for the D02 eval.
- **2026-07-06 (10)** — **physics + study playbooks drafted** (6/12). physics: Whisper lane with source priority (Zoom HTML → Whisper → txt), VLM caption bake-off for equation frames, hybrid keyword+semantic search via static `embeddings.bin`, OneDrive-placeholder pre-flight gotcha. study: OCR **measurement gate first** (keep tesseract if <~15% search-relevant miss rate), shared embed util with physics (Rule 3), VLM pass default-skipped pending data.
- **2026-07-06 (11)** — **versus playbook drafted** (7/12). Grounding upgraded the premise: special rules are already a **closed 24-variant typed union** (`game-content/src/types.ts:19–43`) — so the LLM surface is a constrained-vocabulary compile (ability text → `WeaponAbility[]`), ideal for D08 schema-constrained decoding. Plan: inventory → batch compile w/ review flags → `ability_rule_mappings` shipped via data-import (Rule 1; **IDs + typed effects only, never GW text** in committed artifacts) → deterministic runtime pre-population + "not simulated" honesty chip → coverage loop on sync diffs.
- **2026-07-06 (12)** — **Final five playbooks drafted → ALL 12 PLAYBOOKS + 11 DECISIONS COMPLETE.** Grounding unified them: the platform already instruments its fuzzy edges with counters — bcp-scraper `parseList` returns ok/partial/failed, data-import `buildIdMapping` returns matched/unmatched/ambiguous, new-meta stores `list_text`→`list_ttt` with regex-first extraction. So the normalization family shares one pattern: **deterministic-first, LLM-for-the-counted-tail, proposals-never-bindings, measure the tail before building** (data-import and new-meta both gate on the actual numbers). list-builder reuses `parseList` rather than growing a second parser (Rule 3); game-tracker is parked with three explicit unpark conditions (its one real feature — a brain Ask panel — is a UI ticket, not an AI surface).
- **2026-07-06 (13)** — **Hardening pass 2** (interrupted by a power outage mid-burst; probe results recovered from the session transcript, libsql test re-run in the recovery session). Three queue items closed: **D05 settled** — libSQL-native vectors verified live in local-file mode with the repo's own `@libsql/client 0.14` (`F32_BLOB`/`vector32`/`vector_distance_cos`/`libsql_vector_idx`/`vector_top_k` all ✅, no sqlite-vec needed); **Qwen3 tags verified** against the live registry exactly as the docs spell them; **`gemma4:latest` identity pinned** — 8.0B Q4_K_M, 131k ctx, Apache 2.0, vision+audio+tools+thinking → Tier I-sized and the roster's only multimodal candidate (D11 overlap flagged). Hardening queue is down to 3 items (WebGPU EP runtime check, Cloud Run pricing, bge-base ONNX parity). ⚠️ The 10-minute cron job (`240a581e`) **did not survive the outage** — reschedule if the loop should continue unattended.
- _Loop mode → HARDENING:_ every register + playbook item is ✅. Per the loop protocol (`00-methodology.md`), each fire now re-verifies one existing doc's claims against code/benchmarks and records corrections; when nothing remains to harden, the loop deletes its cron job and reports completion.

---

## Queued follow-on wargames (Micah-requested)

| # | Wargame | Scope | Status |
|---|---------|-------|--------|
| W2 | **Technical-design wargame** (2026-07-06, Micah) | Same decision-analysis method, applied to the *technical design and implementation* of the site's apps — architecture, data model, API shape, deploy topology, failure modes — **explicitly excluding LLM usage** (covered by this wargame) and **skipping the physics and study apps** (Micah, 2026-07-06 — personal apps, out of scope). Per app: enumerate the real design alternatives, play them out against the platform rules (one data source, DRY across apps, bounded Workers, skinnable UI), score, recommend with fallback. Grounded in code reads, not memory. | 🚀 **started 2026-07-06** — [`w2/README.md`](w2/README.md) |

> The hourly `/loop` advances exactly one register/playbook item per iteration,
> updates its Status to ✅ with a link, and appends a dated line here. See the
> loop protocol at the bottom of [`00-methodology.md`](00-methodology.md).
