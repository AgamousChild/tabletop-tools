# D03 — Quantization ladder & VRAM budget policy

> **Decision.** Which quantization each tier runs, when to deviate, how the
> KV-cache is budgeted, and which quant formats the GCP lane uses — as policy,
> so model configs are pinned and reproducible instead of vibes-per-pull.
>
> **Status:** drafted 2026-07-06 (loop iteration 3). Quality-delta claims are
> *(est.)* until the D02 eval protocol runs with a quant axis; all VRAM numbers
> computed from [`../01-system-capabilities.md`](../01-system-capabilities.md).

## Forces

- 8 GB card, 7.5 GB usable design target, 3 GB degraded case (Quest link).
- D02 picked Qwen3 at 4B/8B/14B — each needs an exact quant tag.
- brain-local wants 16k context: KV-cache is the second-largest VRAM consumer
  and the easiest one to accidentally blow the budget with.
- Two serving worlds: GGUF (Ollama/llama.cpp, local) and AWQ/GPTQ/FP8
  (vLLM, GCP L4) — the ladder must name both.
- Root Rule 6 analog: **the quant is data, not folklore** — pinned in config
  tags, never `latest`, never "whatever Ollama defaulted to that day."

**Rubric weights:** Fit ×3 · Quality ×3 · Latency ×2 · Risk ×2 · Effort ×1 · Stack ×1.

## The ladder (weights quants, GGUF/local)

| Rung | Bits (eff.) | 8B weights | 14B weights | Verdict on this card |
|---|---|---|---|---|
| Q8_0 | ~8.5 | ~8.5 GB | ~15 GB | ❌ doesn't fit 7.5 GB even bare (8B) |
| Q6_K | ~6.6 | ~6.6 GB | ~11.6 GB | ⚠️ 8B fits only with ≤4k ctx — niche |
| **Q5_K_M** | ~5.7 | ~5.6 GB | ~9.9 GB | ✅ 8B @ ≤8k ctx (~6.9 GB total) — the quality-lean option |
| **Q4_K_M** | ~4.8 | ~4.7 GB | ~8.5 GB | ✅ **the default** — 8B @ 16k ctx fits; 14B partial-offload |
| Q3_K_M | ~3.9 | ~3.8 GB | ~6.8 GB | ⚠️ 14B full-GPU enabler; quality cliff risk *(est.)* |
| IQ4_XS / IQ3 (imatrix) | ~4.3 / ~3.7 | ~4.2 / ~3.6 GB | ~7.7 / ~6.5 GB | ➕ refinement rung — better quality-per-bit than K-quants *(est.)*, availability varies per model in the registry |

**Why Q4_K_M is the default and not a compromise:** the K-quant curve is
steep below Q4 and flat above it *(est.; community perplexity data)* — Q4_K_M
sits at the knee. Q5's ~1 GB premium on an 8B costs exactly the KV headroom
that brain's 16k context needs. Paying bits for weights *or* context is the
real trade, and for RAG surfaces **context wins** — a slightly sharper model
that can't hold the retrieved evidence is a worse RAG answerer.

## KV-cache policy (the hidden half of the budget)

fp16 KV on an 8B ≈ **0.5 GB per 4k tokens** (per `01`). Policy:

| Surface | ctx target | KV mode | Where |
|---|---|---|---|
| ingestor / normalizers | 8k | fp16 KV (default) | Ollama |
| judge | 4k | fp16 KV | Ollama |
| brain-local `/ask` | 16k | fp16 if it fits (~7.2 GB total); **q8_0 KV** when it doesn't | llama-server (D01 trigger 2) |
| anything ≥24k | — | q8_0 KV mandatory; q4_0 KV **forbidden for RAG** | llama-server |

q8_0 KV halves cache size at negligible quality cost *(est.)*. q4_0 KV is
banned for brain because degraded KV precision specifically harms long-range
attention — i.e. **faithfulness to retrieved context**, the one property a
rules-citing RAG cannot trade. (Ollama doesn't expose KV quant flags — that's
D01's escalation trigger to llama-server, reaffirmed here.)

## Per-tier pinned configs (the deliverable)

| Tier (D02) | Pinned tag (verify registry spelling at pull) | Weights | ctx / KV | Total est. | Fits 7.5 GB? | Fits 3 GB? |
|---|---|---|---|---|---|---|
| I — Qwen3-8B | `qwen3:8b-q4_K_M` | ~4.7 GB | 16k fp16 ≈ 2 GB | ~7.3 GB | ✅ edge | ❌ |
| I-alt quality | `qwen3:8b-q5_K_M` | ~5.6 GB | 8k fp16 ≈ 1 GB | ~7.2 GB | ✅ | ❌ |
| II — Qwen3-14B | `qwen3:14b-q4_K_M` | ~8.5 GB | 8k, q8 KV ≈ 0.9 GB | ~10 GB | ⚠️ partial offload (~12–22 tok/s) | ❌ |
| II-alt full-GPU | `qwen3:14b-q3_K_M` *(eval before trusting)* | ~6.8 GB | 4k fp16 | ~7.5 GB | ⚠️ exact edge | ❌ |
| III — Qwen3-4B | `qwen3:4b-q4_K_M` | ~2.5 GB | 8k fp16 ≈ 0.6 GB | ~3.3 GB | ✅ lots | ⚠️ at 4k ctx (~2.9 GB) |
| Rollback — Llama 3.1 8B | `llama3.1:8b-instruct-q4_K_M` | ~4.7 GB | as Tier I | ~7.3 GB | ✅ | ❌ |

Notes: totals include ~0.5 GB CUDA/runtime overhead. The Tier II Q3 rung is
listed but **not recommended until the D02 eval runs a Q4-vs-Q3 comparison on
judge/extraction tasks** — if Q3 shows a cliff, Tier II stays partial-offload
Q4 and eats the latency (it's a batch tier; latency is cheap there).

## The GCP lane (vLLM on L4 24 GB — feeds D10)

GGUF is llama.cpp-native; vLLM wants **AWQ / GPTQ / FP8**:

- **Qwen3-14B-AWQ (4-bit)** ≈ 9–10 GB → generous headroom for real batching on
  24 GB; the default T5 image candidate.
- **FP8 (W8A8)** — L4 is Ada (same compute cap 8.9 as the 4060): native FP8
  tensor cores; Qwen3-14B-FP8 ≈ 15–16 GB, better quality than 4-bit *(est.)*,
  still leaves KV room. The quality-lean T5 option.
- **Qwen3-32B-AWQ** ≈ 18–19 GB — fits, thin KV margin; only if D02's eval says
  Tier II quality is insufficient for the public lane.

Same pinning rule: quant format + revision hash pinned in the container image;
the image is the config.

## Degraded-state policy (3 GB, Quest link on — feeds D09)

Only Tier III runs (`qwen3:4b-q4_K_M` @ ≤4k ctx). The D09 guard: check
`nvidia-smi` free VRAM before model load — **< 6 GB free → auto-select
Tier III and log a warning**, or refuse batch jobs that demand Tier I/II
rather than silently swapping to CPU-crawl. Explicit degradation beats
mysterious 8 tok/s runs.

## Wargame (the deviations people will be tempted by)

- **"Q5/Q6 is barely bigger, let's have quality"** → it silently costs context;
  RAG surfaces regress in a way perplexity charts don't show. Default stays
  Q4_K_M; Q5 allowed only for ≤8k-ctx surfaces, by config, after eval.
- **"Q3 gets the 14B fully on GPU"** → speed is not the batch tier's constraint;
  quality is. Partial-offload Q4 is the safer Tier II until the eval proves Q3.
- **"q4 KV doubles our context again"** → banned for brain (faithfulness risk);
  would only ever be considered for throwaway bulk classification.
- **"IQ quants are strictly better"** → *(est.)* better quality-per-bit but
  spottier availability and slower CPU-offload paths; adopt per-model only when
  the registry has them and the eval confirms.

## Recommendation

**Q4_K_M everywhere as the pinned default; KV stays fp16 until context math
forces q8_0 (brain-local at 16k); Tier II runs Q4 partial-offload rather than
Q3 full-GPU until the eval clears Q3; GCP lane standardizes on AWQ (quality
fallback FP8) for Qwen3-14B.** Every quant choice is a pinned tag in config —
changing a quant is a reviewed config change that reruns the eval, not a pull.

**Flip triggers:** eval shows Q3_K_M ≈ Q4_K_M on Tier II tasks → flip Tier II
to full-GPU Q3 (2× speed); brain-local OOMs at 16k in practice → llama-server
q8 KV (already policy); a needed model lacks Q4_K_M in the registry → nearest
IQ4/Q4 variant, eval before adopting.

## Follow-ups

- Add a **quant axis** to the D02 eval protocol (same tasks, Q4 vs Q5 vs Q3)
  — one overnight batch run answers all three flip triggers empirically.
- D09 implements the free-VRAM guard + tier auto-select.
- D10 pins the vLLM image quant (AWQ vs FP8) after a cost/quality pass on L4.
