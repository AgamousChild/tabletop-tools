# 01 — System capabilities: what this machine can actually run

All numbers below are **measured on this machine** (`nvidia-smi`, WMI, CIM) or
computed from those measurements. Nothing here is from memory.

## Measured hardware

```
CPU   Intel Core i7-14700F   20 physical cores / 28 logical threads   base 2.1 GHz
RAM   32 GB  (31.8 GB reported)
GPU   NVIDIA GeForce RTX 4060
      VRAM 8188 MiB (= 8 GB GDDR6, 128-bit)
      Compute capability 8.9  (Ada Lovelace)   → FP8/INT8 tensor cores, FP16, INT4 (Marlin)
      Driver 591.86
OS    Windows 11 Home (26200)
```

> **The WMI trap.** `Win32_VideoController.AdapterRAM` reports **4 GB** for this
> card — the well-known signed-32-bit overflow. The truth from `nvidia-smi` is
> **8 GB**. Any sizing done from the WMI number would be wrong by half. Always
> size from `nvidia-smi`.

### The VRAM-contention caveat (important, and easy to miss)

At the moment of measurement the GPU had only **~3 GB VRAM free** — a
"Meta Virtual Monitor" device was present, i.e. the **Quest / Air Link** was
active and holding ~5 GB. This is not hypothetical: it means the *usable* VRAM
for inference swings between:

- **~7.5 GB** when the headset link is **off** (0.5 GB reserved for desktop/OS), and
- **~3 GB** when it is **on**.

Every model-fit decision assumes **link-off (7.5 GB usable)** as the design
target, and calls out separately what still runs in the **3 GB** degraded case.
Ops decision **D09** covers detecting this and failing over gracefully.

## VRAM math — how to size a model

Rough working formula for GGUF (llama.cpp/Ollama):

```
VRAM ≈ weights + KV-cache + overhead
weights   ≈ params(B) × bits/param ÷ 8         (Q4_K_M ≈ 4.5 bits eff.)
KV-cache  ≈ 2 × layers × ctx × d_model × 2B    (fp16 KV)  — grows with context
overhead  ≈ 0.4–0.8 GB  (CUDA context, buffers)
```

Practical KV rule of thumb for a 7–8B model at fp16 KV: **~0.5 GB per 4k tokens
of context**; 8k ctx ≈ 1 GB. Q8/Q4 KV-cache quant roughly halves that.

### What fits at full GPU speed (link-off, 7.5 GB usable)

| Model class | Quant | Weights (est.) | +8k KV | Fits fully? | Speed (est.) |
|---|---|---|---|---|---|
| 3–4B (Phi-3.5-mini, Qwen2.5-3B) | Q4_K_M | ~2.3 GB | ~2.9 GB | ✅ lots of headroom | 60–90 tok/s |
| **7–8B** (Llama 3.1 8B, Qwen2.5 7B, Mistral 7B) | **Q4_K_M** | **~4.7 GB** | **~5.7 GB** | ✅ **comfortable** | **40–60 tok/s** |
| 7–8B | Q5_K_M | ~5.6 GB | ~6.6 GB | ✅ tight | 35–50 tok/s |
| 7–8B | Q6_K | ~6.6 GB | ~7.6 GB | ⚠️ right at edge; drop ctx | 30–45 tok/s |
| 7–8B | Q8_0 | ~8.5 GB | — | ❌ full offload | (partial only) |
| 9B (Gemma 2 9B) | Q4_K_M | ~5.8 GB | ~6.8 GB | ✅ tight | 30–45 tok/s |
| **13–14B** (Qwen2.5 14B, Phi-4) | **Q4_K_M** | **~8.5 GB** | — | ⚠️ **partial CPU offload** | **12–22 tok/s** |
| 14B | Q3_K_M | ~6.8 GB | ~7.6 GB | ✅ fits, quality cost | 25–35 tok/s |
| 32B (Qwen2.5 32B) | Q4_K_M | ~20 GB | — | ❌ heavy hybrid | 3–6 tok/s |
| 70B (Llama 3.3 70B) | Q4_K_M | ~40 GB | — | ❌ > RAM+VRAM | not viable |

**Read-off:**
- The **sweet spot is a 7–8B model at Q4_K_M / Q5_K_M** — full GPU, 8k+ context,
  interactive speed. This is the design center for every live LLM surface.
- **14B is reachable** (Q4 partial-offload or Q3 full) when quality matters more
  than latency — good for *batch* jobs (ingestor extraction, judge). Not for a
  chat-latency endpoint.
- **32B is batch-only-overnight** territory (single-digit tok/s via hybrid).
- **70B is off the table locally.** Notably brain's current cloud default is
  `llama-3.3-70b` on Workers AI — so "go local" is necessarily a *smaller* model,
  and D02 has to prove a 7–14B local model is good enough for brain's Q&A, or
  keep 70B as a cloud/hybrid tier.

### Degraded case (Quest link on, ~3 GB usable)

Only 3–4B Q4 models run fully on GPU. 7–8B would run mostly on CPU (~8–15 tok/s
on the 14700F) — usable for batch, sluggish for chat. D09's failover: detect free
VRAM at load, pick the model tier accordingly, or prompt to close the link.

## What the CPU + RAM add

- **CPU inference** (14700F, 20C): a 7–8B Q4 runs ~8–15 tok/s **CPU-only** — a
  real fallback when VRAM is occupied. AVX-512 is disabled on this SKU but the
  P/E-core count carries llama.cpp well.
- **Hybrid offload**: 32 GB RAM lets llama.cpp put N layers on GPU and the rest
  on CPU — this is how 14B/32B "fit" at reduced speed. RAM ceiling makes ~32B Q4
  (~20 GB) the largest thing that loads at all.
- **Embeddings & small vision run free**: `bge-base` (110M), `bge-large` (335M),
  YOLOv8n/s (3–11M) cost a few hundred MB and can sit on GPU beside a 7B model or
  run on CPU. They are never the bottleneck.

## Training capability (relevant to no-cheat / D06)

The 4060 is a capable **training** GPU for small vision models:

- **YOLOv8n/s/m fine-tune**: 8 GB is plenty for `n`/`s` at 640px (batch 16–32)
  and `m` with smaller batch. A few-thousand-image dice dataset trains in
  **tens of minutes to low hours**. This is squarely in reach — no cloud needed.
- **LLM fine-tune (LoRA/QLoRA)**: a 7–8B QLoRA fits in 8 GB (4-bit base + LoRA
  adapters, batch 1 + grad-accum). Slow but feasible for a light domain-adapt.
  Full fine-tune of 7B+ is **not** feasible locally.

## One-paragraph verdict

This is a strong **7–8B-class local inference box** and a fine **small-vision
training box**. It is *not* a 70B box. Every recommendation in this wargame that
targets a live endpoint aims at a 7–8B Q4/Q5 model on GPU; anything needing more
quality is pushed to a **batch** lane (14–32B hybrid, overnight-tolerant) or kept
on **cloud** as an optional tier. The binding real-world variable is not the card
— it's whether the **Quest link is holding VRAM**, which D09 must handle.
