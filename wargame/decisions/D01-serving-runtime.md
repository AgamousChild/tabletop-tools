# D01 — LLM serving runtime for the local lane

> **Decision.** Which open-source serving runtime hosts local text models on
> Micah's box (Windows 11, RTX 4060 8 GB, i7-14700F, 32 GB RAM) for the T1
> batch lane and the T4 dev lane — and which runtime is designated for the T5
> GCP lane so the two don't diverge.
>
> **Status:** drafted 2026-07-06 (first loop iteration).

## Forces

- `apps/content-ingestor/src/llm/ollama.ts` **already targets Ollama**
  (`/api/chat`, `stream:false`, `num_ctx 8192`, `num_predict 4096`). The
  platform has a working integration; switching runtimes must beat "keep what
  works," not tie it.
- Host is **Windows** — several serving stacks are Linux-first (vLLM, TGI);
  "runs great in a Linux container" means WSL2/Docker overhead and ops friction
  here.
- 8 GB VRAM (7.5 usable, sometimes 3 — see
  [`../01-system-capabilities.md`](../01-system-capabilities.md)) punishes
  runtimes that pre-allocate VRAM or assume batch-serving headroom.
- D08 (structured output) will lean on runtime features: JSON-schema
  enforcement, grammars, logit constraints. The runtime choice caps what D08
  can do.
- The T5/GCP lane (D10) wants max **throughput** on an L4 in a container —
  a different optimum than a single-user Windows box.

**Rubric weights** (runtime = plumbing; integration cost dominates):
Fit ×2 · Capability ×2 · Latency ×1 · Effort ×3 · Stack ×3 · Risk ×2.
("Quality" axis here = capability surface: structured output, embeddings
endpoint, model management, quant control.)

## Options

### R1 — Ollama (incumbent)

llama.cpp wrapped in a model manager + HTTP server. Windows-native installer,
runs as a background service, pulls quantized GGUF models from its registry
(`ollama pull qwen2.5:7b-instruct-q4_K_M`), loads/unloads on demand with
`keep_alive`, exposes native `/api/chat` **and an OpenAI-compatible `/v1`**
endpoint, serves embeddings models, supports JSON-schema **structured outputs**
via the `format` parameter *(verify exact behavior on the installed version —
this landed late 2024 and has evolved)*.

- **Plays out here:** zero migration — the code already speaks to it. Model
  management is the killer feature for an 8 GB card: automatic layer-offload
  split when a model doesn't fully fit, automatic unload after idle, one
  `ollama ps` to see VRAM placement. Multi-app sharing (ingestor + brain-dev +
  judge hitting one daemon) is what it's built for.
- **Limits:** exposes only a curated slice of llama.cpp's flags — no GBNF
  grammars, no KV-cache-quant control (`--ctk/--ctv`), no speculative decoding
  config. If D08 needs those, Ollama can't provide them today.
- **Score:** Fit 5 · Cap 4 · Lat 4 · Effort 5 · Stack 5 · Risk 4 → **weighted 4.69** (highest).

### R2 — llama.cpp `llama-server` (the control tier)

The engine underneath Ollama, driven directly. Single CUDA-build binary on
Windows, OpenAI-compatible endpoint, and the **full flag surface**: GBNF
grammars (hard-constrained output), KV-cache quantization (q8_0/q4_0 → roughly
halves/quarters KV VRAM, buying context on 8 GB), speculative decoding, exact
quant/offload control.

- **Plays out here:** everything Ollama does per-request, plus the knobs — but
  *you* manage model files, startup, service supervision (Task Scheduler /
  NSSM), and one-model-per-process. Fine for a deliberate batch run; friction
  as the always-on daemon three apps share.
- **Score:** Fit 5 · Cap 5 · Lat 4 · Effort 3 · Stack 4 · Risk 4 → weighted 4.15.

### R3 — vLLM (the datacenter optimum, wrong box)

PagedAttention + continuous batching; the throughput king for concurrent
serving. Linux-first — Windows means WSL2/Docker; default behavior
**pre-allocates** most of the GPU (`gpu_memory_utilization`), which collides
with an 8 GB card shared with a desktop and sometimes a Quest link.

- **Plays out here:** wrong optimum locally — its wins (batched concurrent
  throughput) don't apply to a one-user box; its costs (Linux layer, VRAM
  appetite, AWQ/GPTQ model wrangling) all do. **But it is the right runtime
  for T5**: on a GCP L4 24 GB in a container serving public `/ask` traffic,
  continuous batching is exactly what you want.
- **Score (local):** Fit 2 · Cap 4 · Lat 5 · Effort 2 · Stack 3 · Risk 3 → weighted 2.85.
- **Verdict:** rejected locally, **designated for the T5/GCP lane** (D10).

### R4 — LM Studio

Polished GUI + OpenAI-compatible local server + `lms` CLI. Easiest on-ramp.

- **Plays out here:** the app itself is **proprietary** (free, not open source)
  — a poor fit for a mandate that says *open source*, and a second
  model-manager fighting Ollama for disk/VRAM. Nothing it offers that R1+R2
  don't.
- **Score:** Fit 4 · Cap 3 · Lat 4 · Effort 4 · Stack 2 · Risk 3 → weighted 3.23.

### R5 — HF Text Generation Inference (TGI)

Hugging Face's production server. Container/Linux-first, geared to fp16/AWQ on
big cards and HF-hub deployment.

- **Plays out here:** heaviest ops for the least local fit; on GCP it competes
  with vLLM and (for our purposes) loses on ecosystem momentum for quantized
  single-GPU serving.
- **Score:** Fit 1 · Cap 3 · Lat 4 · Effort 2 · Stack 2 · Risk 3 → weighted 2.15.

### Honorable mention — ExLlamaV2 / TabbyAPI

EXL2 quantization is exceptionally VRAM-efficient and fast on Ada cards; a
plausible way to squeeze a 14B into 8 GB at better quality than GGUF Q3.
Smaller community, Python service, another quant format to manage. Not scored;
revisit in D03 only if the 14B-on-8GB case becomes load-bearing.

## Wargame (head-to-head)

- **R1 vs R2 — the real contest.** Same engine; the trade is *management vs
  control*. The platform needs an always-on daemon that multiple apps share and
  that survives VRAM contention gracefully — that's R1. The moments that need
  GBNF or KV-quant are *specific batch jobs* — spawning a dedicated
  `llama-server` for those jobs costs nothing and doesn't displace the daemon.
  So this isn't either/or; it's default/escalation.
- **R1 vs R3 — locality of optimum.** vLLM's advantages require concurrency the
  local box never sees, and its Linux-first posture taxes every local
  interaction. But refusing vLLM *everywhere* would leave T5 on a
  wrapper-around-llama.cpp when the L4 wants real batching. Split the decision
  by lane.
- **The unifier — OpenAI-compat as the wire protocol.** R1, R2, and R3 all
  expose OpenAI-compatible endpoints. If the shared provider (the seam in
  [`../03-top-level-architecture.md`](../03-top-level-architecture.md)) speaks
  `chat/completions` instead of Ollama-native `/api/chat`, then Ollama-local,
  llama-server-local, and vLLM-on-GCP are **one code path with three base
  URLs**. That single choice future-proofs the whole register.

## Recommendation

- **Primary: R1 Ollama** as the always-on local runtime for T1 batch and T4 dev
  — it's the incumbent, the best model-manager for an 8 GB card, and adequate
  for D08's structured output via JSON-schema `format`.
- **Escalation: R2 `llama-server`** spawned per-job when a batch task needs
  GBNF grammars, KV-cache quant (context beyond ~8k on 8 GB), or speculative
  decoding. Not a daemon; a tool.
- **Designated for T5/GCP: R3 vLLM** in the container image (D10 owns the
  detail).
- **Rejected:** LM Studio (proprietary, redundant), TGI (wrong fit both lanes).

**Flip triggers:**
1. D08 finds Ollama's `format` insufficient for a needed schema → that job
   moves to `llama-server` + GBNF (job-level, not platform-level flip).
2. A recurring need for >8k context on the 8 GB card → `llama-server` with
   `--ctk q8_0 --ctv q8_0` becomes the batch default.
3. Ollama's abstraction breaks on a needed model (unsupported arch, stale
   llama.cpp vendoring) → pin that workload to `llama-server` with a manually
   built engine.

## Implementation notes (concrete, this repo)

1. **Generalize the provider (Rules 3/4).** Lift
   `apps/content-ingestor/src/llm/ollama.ts` into a shared package (e.g.
   `packages/server-core` or a new `packages/llm-provider`):
   `chat(messages, opts)` + `embed(texts)` speaking **OpenAI-compat
   `/v1/chat/completions`**, with `baseUrl`/`model`/`apiKey` from env
   (`LLM_ENDPOINT`, `LLM_MODEL`). content-ingestor migrates from `/api/chat`
   to `/v1` (small, mechanical); brain's `?model=local` branch and admin's
   judge import the same module. One client, three backends (Ollama /
   llama-server / vLLM-on-GCP).
2. **Daemon config for 8 GB (ties to D09):** `OLLAMA_MAX_LOADED_MODELS=1` and
   `OLLAMA_NUM_PARALLEL=1` (the 7–8B Q4 + KV leaves no room for a second
   resident LLM); embeddings model (~0.3 GB) co-resides fine. `keep_alive`:
   `30m` during batch runs; default otherwise so the GPU frees for games/VR.
   Before any batch run, check `nvidia-smi` free VRAM ≥ 6 GB (Quest-link
   detection — D09 owns the guard function).
3. **Windows ops:** Ollama installs as a login service (tray). Verify with
   `ollama --version`; inspect placement with `ollama ps` (shows GPU/CPU layer
   split). `llama-server` jobs run via explicit CLI from the batch scripts —
   no service needed.
4. **Model files:** GGUF quants pulled via Ollama registry by exact tag (pin
   quant in the tag, e.g. `:7b-instruct-q4_K_M` — never bare `latest`); D02/D03
   choose the tags. For `llama-server` jobs, point at the same blobs via
   `ollama show --modelfile` paths rather than re-downloading.

## Follow-ups

- D02 picks the actual model tags for the 7–8B interactive tier and the 14B
  batch tier.
- D08 validates Ollama `format` JSON-schema against extractConcepts'
  real schema; that test decides flip-trigger 1.
- D10 specs the vLLM container (image, quant format AWQ/FP8, L4 sizing).
