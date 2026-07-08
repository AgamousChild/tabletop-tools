# D02 — Text model & size for the local lane

> **Decision.** Which open-weights text model(s), at which sizes, serve each
> platform surface on the RTX 4060 (8 GB) — and how we *prove* the choice
> instead of trusting leaderboards.
>
> **Status:** drafted 2026-07-06 (loop iteration 2). Model-quality claims are
> training-knowledge estimates *(est.)* until the eval protocol below runs;
> VRAM math is computed from [`../01-system-capabilities.md`](../01-system-capabilities.md).

## Forces — including the model sprawl we found

Grounding turned up **five different text models already in production paths**:

| Where (verified) | Model | Lane |
|---|---|---|
| `apps/content-ingestor/src/types.ts:86` | **`llama3.1:8b`** @ `localhost:11434` | local default (incumbent) |
| `apps/content-ingestor/src/review/auto-review.ts:12` | **`gemma2:9b`** @ `localhost:11434` | local auto-review |
| `apps/admin/server/src/lib/llm-evaluator.ts:19` | **`@cf/meta/llama-3-8b-instruct`** (Workers AI) | crosswalk judge — **a full generation behind** the local default |
| `apps/brain/CLAUDE.md` (`/ask` routing) | **`llama-3.3-70b-instruct-fp8-fast`** (Workers AI) | brain answering default |
| `apps/content-ingestor/server/src/lib/extract.ts:80` | **`claude-haiku-4-5`** (Anthropic) | Worker-side extract |

Sprawl is a cost: each resident local model displaces the other on an 8 GB
card, quality differs per surface unpredictably, and prompt tuning done for one
model silently misfits another. D02 therefore picks **tiers**, not a zoo.

**What the models must actually do** (read from the prompts, not guessed):

| Task (file) | Shape | Difficulty driver |
|---|---|---|
| Relevance (`prompts.ts` RELEVANCE_PROMPT) | strict YES/NO classify, edition-aware | easy — any competent 4B+ |
| Transcript cleanup (CLEANUP_PROMPT + GLOSSARY) | terminology correction, meaning-preserving | mid — instruction fidelity; glossary carries the domain |
| Concept extraction (EXTRACTION_PROMPT) | **JSON array** of tactics w/ confidence calibration, 2–3 ¶ synthesis | **hard** — structure + judgment (ties to D08) |
| Crosswalk judge (`llm-evaluator.ts` buildPrompt) | ordered decision rules → `APPROVE/REJECT/UNSURE - reason` one-liner | mid — rule-following reliability |
| brain `/ask` (RAG) | answer rules/tactics questions from ≤40 000 chars (~10k tokens) of supplied context, cite sources | **hard** — long-context faithfulness; currently a **70B's** job |

**Rubric weights:** Quality ×3 · Fit ×3 · Latency ×2 · Risk ×2 · Effort ×1 · Stack ×1.

## The tier frame (from `01`)

- **Tier I — interactive/default:** 7–8B Q4/Q5, fully on GPU, 40–60 tok/s, must
  hold ~12–16k ctx (brain context + answer): 8B Q4_K_M ≈ 4.7 GB + fp16 KV @16k
  ≈ 2 GB + overhead → **~7.2 GB — fits the 7.5 GB budget at the edge** (q8 KV
  via llama-server buys margin; flip trigger in D01).
- **Tier II — batch quality:** 12–14B, Q4 partial-offload (~12–22 tok/s est.) or
  Q3 full-GPU; latency-tolerant jobs only (extraction escalation, judge, versus
  rule-compilation).
- **Tier III — degraded/bulk:** 3–4B fully resident even at ~3 GB free VRAM
  (Quest link on) or for high-volume cheap normalization.

## Options

### M1 — Llama 3.1 8B Instruct (the incumbent)

Already the configured default. Enormous ecosystem; 128k ctx; Llama community
license (fine for this platform's scale). *(est.)* Solid-but-no-longer-leading
8B: instruction following and JSON reliability have been surpassed by newer
8Bs; it's a mid-2024 model.

- **Score:** Fit 5 · Quality 3 · Latency 4 · Effort 5 · Stack 5 · Risk 4 → weighted **3.94**.

### M2 — Qwen3-8B (Apache 2.0)

*(est.)* The strongest open 8B-class model in my knowledge window (Apr 2025):
notably better instruction-following/JSON than Llama 3.1 8B, 32k native ctx,
and a **hybrid thinking mode** — `/think` for hard judgments (extraction
confidence, judge calls), `/no_think` for fast chat — which maps beautifully
onto our tier needs *without loading a second model*. Apache 2.0 is the
cleanest license on the board.

- **Watch-outs:** thinking mode burns tokens (cap it for batch); tokenizer/
  template differences mean prompts tuned on Llama need a regression pass.
- **Score:** Fit 5 · Quality 4 · Latency 4 · Effort 4 · Stack 4 · Risk 4 → weighted **4.19** (highest Tier I).

### M3 — Gemma 3 12B (successor to the in-use gemma2:9b)

*(est.)* Excellent quality-per-param (Mar 2025), 128k ctx, but 12B Q4_K_M
weights ≈ 7.3 GB → **doesn't fit Tier I with KV**; it's a Tier II citizen at
Q4-partial or a tight Q3. Gemma license is more restrictive than Apache.
Retiring `gemma2:9b` (auto-review) into the M2 default removes a resident
model; adopting Gemma 3 would re-add one.

- **Score:** Fit 2 · Quality 4 · Latency 3 · Effort 3 · Stack 3 · Risk 3 → weighted **3.06**.

### M4 — Phi-4 14B (MIT)

*(est.)* Dec-2024 14B that punches above its weight on reasoning/STEM; MIT
license. **16k context ceiling** — brain's worst-case context (~10k tokens)
plus answer fits, but with little headroom. Q4_K_M ≈ 8.5 GB → partial offload;
Q3_K_M ≈ 6.8 GB full-GPU.

- **Score:** Fit 3 · Quality 4 · Latency 2 · Effort 4 · Stack 4 · Risk 3 → weighted **3.25**.

### M5 — Qwen3-14B (Apache 2.0)

*(est.)* Same family as M2 one tier up — best open 14B in window; keeps one
prompt/template family across Tier I and II (real maintenance win), thinking
mode available for the judge. Q4 partial-offload speeds are fine for batch.

- **Score (as Tier II):** Fit 3 · Quality 5 · Latency 2 · Effort 4 · Stack 5 · Risk 4 → weighted **3.81** (highest Tier II).

### M6 — DeepSeek-R1-Distill-Qwen-14B (MIT)

*(est.)* Reasoning-trace model; tempting for the judge, but emits long chains
of thought → slow batch throughput, and needs answer-extraction handling.
Qwen3's on-demand thinking gives 80 % of this without a second family.

- **Score:** Fit 3 · Quality 4 · Latency 1 · Effort 3 · Stack 3 · Risk 3 → weighted **2.94**.

### M7 — Qwen3-4B (Tier III)

*(est.)* Shockingly capable for 4B; Q4 ≈ 2.5 GB → **runs fully on GPU even in
the 3 GB Quest-link-degraded state**. Handles relevance classification and
bulk list-normalization at high speed; same family/template as M2/M5.

- **Score (as Tier III):** Fit 5 · Quality 3 · Latency 5 · Effort 5 · Stack 5 · Risk 4 → weighted **4.19** (unopposed in tier).

### M8 — Gemma 4 (added by hardening pass 1: **already pulled on this box**)

`ollama list` (2026-07-06) shows **`gemma4:latest`, 9.6 GB, pulled 13 days
ago** — Micah has been evaluating it already. It postdates this doc's
training-knowledge window, so no quality claim is made here *(unknown, not
est.)* — which is exactly what the eval protocol is for.

**Identity pinned (hardening pass 2, `ollama show gemma4:latest`):**
**8.0B params, Q4_K_M, 131 072 context, Apache 2.0**, capabilities:
completion + **vision + audio** + tools + thinking. So it is *Tier I-sized*
(8B, same class as M1/M2) — not the ~12B guessed from file size — and it is
the only multimodal (vision/audio) candidate in the roster, which matters if
D11's VLM-captioning lane wants to share a resident model with the text tier.

- **Actions:** re-pull by **exact tag** (bare `latest` violates D03 pinning);
  enter it in the Tier I eval roster alongside M1/M2. If it wins on our
  tasks, the one-family argument yields to evidence — the eval decides, not
  the doc.

### Not shortlisted

Mistral 7B (aged out vs M2), Ministral 8B (research-license friction),
Llama 3.2 3B (M7 beats it in-window *(est.)*), Llama 4 family (MoE sizes start
far beyond 8 GB), 32B+ (batch-only-overnight per `01`; revisit only if Tier II
fails a quality gate).

## Wargame

- **M1 vs M2 (Tier I):** M2 wins on quality, license, and the thinking-mode
  consolidation trick; M1 wins on "it's already wired" and ecosystem maturity.
  Since D01 made the provider model-agnostic (one env var), the switching cost
  is a config line + a prompt regression pass — not architecture. Evidence
  should settle it, not vibes: **the eval protocol below is the actual
  decider.** Keep M1 installed as the instant-rollback.
- **One family vs best-per-tier:** Qwen3 at 4B/8B/14B covers all three tiers
  with one template family and shared prompt tuning. Best-per-tier (Phi-4 for
  batch, Gemma for review…) buys *(est.)* marginal quality at the cost of 3×
  the prompt maintenance and more resident-model shuffling on 8 GB. The
  platform's own DRY instinct (root Rule 3) applies to models too. → One
  family, deliberate exceptions only on eval evidence.
- **The 70B question (brain):** no 8B honestly replaces a 70B for nuanced
  rules synthesis *(est.)* — the wargame position is not "Qwen3-8B ≈ 70B" but
  "brain's RAG does the heavy lifting; measure how far behind the 8B lands."
  If the gap is small on *our* questions, local/dev/personal lanes take the 8B
  and the public default stays 70B-on-Workers-AI (per `03`); if large, Tier II
  or T5/GCP hosts the local-quality lane. **Measure, then route.**
- **Judge staleness (found in grounding):** admin's crosswalk judge runs
  `llama-3-8b` — older than the *local incumbent*. Whatever D02's eval picks,
  aligning the judge to the same Tier I/II family (locally via T1 batch, or at
  minimum bumping the Workers AI model id) is a free correctness win.

## Recommendation

- **Tier I (default, all interactive + standard batch): Qwen3-8B**, Ollama tag
  pinned at Q4_K_M (e.g. `qwen3:8b-q4_K_M`), `/no_think` default; **keep
  `llama3.1:8b` pulled as rollback.**
- **Tier II (quality batch — extraction escalation, judge, versus
  rule-compiler): Qwen3-14B** Q4_K_M partial-offload (llama-server + q8 KV
  when context-heavy, per D01 triggers). Phi-4 stays the named alternate if
  Qwen3-14B disappoints on judge tasks.
- **Tier III (degraded VRAM / bulk normalize): Qwen3-4B** Q4_K_M — also the
  automatic fallback D09 selects when free VRAM < 6 GB.
- **Consolidations:** retire `gemma2:9b` (auto-review → Tier I); upgrade or
  localize the admin judge off `llama-3-8b`; `claude-haiku` extract path stays
  as the cloud opt-in tier per `03`.

**The eval protocol (the actual decider — build once, reuse forever):**
1. Assemble ~50–100 platform-real tasks: brain questions with retrieved
   context (log real `/ask` traffic), 20 extraction chunks with
   human-graded reference outputs, 30 crosswalk candidates with known
   verdicts.
2. Run M1, M2 (both `/think` modes), M5, M7 locally + the 70B via Workers AI
   as ceiling reference.
3. Grade with the existing judge pattern (`llm-evaluator.ts` shape) using the
   **strongest available grader** (Claude or 70B), plus exact-match scoring
   where outputs are structured (JSON validity rate, YES/NO accuracy,
   APPROVE/REJECT agreement).
4. Promote/demote tiers on results; record them in this doc. **No tier flip
   ships on leaderboard numbers.**

**Flip triggers:** eval shows M1 ≥ M2 on our tasks → stay M1 (zero migration);
Tier II fails judge-quality gate → try Phi-4, then 32B-overnight, then keep
judge on cloud; JSON validity < 95 % at Tier I → D08 escalation (schema
enforcement / llama-server grammars) before any model change.

## Implementation notes (concrete, this repo)

1. `apps/content-ingestor/src/types.ts:86` — model default becomes an env-read
   (`LLM_MODEL`, per D01's provider seam), not a hardcoded literal (root
   Rule 6 applies to model choice too). Same for `auto-review.ts:12`.
2. Pin exact quant tags in config (`qwen3:8b-q4_K_M`, `qwen3:14b-q4_K_M`,
   `qwen3:4b-q4_K_M`); never bare `latest`. **Tag spellings verified against
   the live registry (hardening pass 2, 2026-07-06):** `qwen3:8b-q4_K_M`
   (5.2 GB), `qwen3:14b-q4_K_M` (9.3 GB), `qwen3:4b-q4_K_M` (2.6 GB) all
   exist as written; `q8_0` variants also available (8.9 / 16 / 4.4 GB).
3. `num_ctx` per surface: ingestor keeps 8192 (matches its 3000-char chunking);
   brain-local needs 16384 (KV math above — use llama-server q8 KV if OOM);
   judge 4096.
4. Thinking-mode policy: `/no_think` everywhere except judge + extraction
   *escalation* runs; cap thinking tokens in batch (`num_predict` already 4096
   in `ollama.ts` — keep).
5. Prompt regression on switch: EXTRACTION_PROMPT's JSON example block and the
   judge's one-line format are the two most template-sensitive prompts — run
   them through the eval set before flipping the env var.

## Follow-ups

- D03 formalizes the quant ladder (Q4_K_M default, when Q5/Q6/Q3, KV quant).
- D08 owns JSON enforcement (Ollama `format` vs grammars) — interacts with
  flip trigger 3.
- D10 inherits Tier decisions for the GCP L4 image (Qwen3-14B/32B fit there
  at full speed).
