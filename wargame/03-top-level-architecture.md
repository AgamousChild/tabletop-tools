# 03 — Top-level architecture: where does a local model even run?

> Read this before any `decisions/DNN` doc. Every downstream choice inherits the
> answer here. This is decision **D07**, elevated to the front because it gates
> everything else.

## The forcing tension

Two facts collide:

1. **The platform deploys on Cloudflare Workers + Pages (edge).** brain's `/ask`
   is a Hono Worker; it answers live user traffic from Cloudflare's edge
   (`apps/brain/server/worker.ts`, `wrangler.toml`).
2. **The "local LLM" is Micah's RTX 4060 in his house.** It has no public
   endpoint, no uptime guarantee, 8 GB VRAM, and its VRAM is sometimes eaten by a
   VR headset (see `01`).

A Cloudflare Worker **cannot** reach into a home GPU to answer a request in
25 ms. So "implement the functionality with a local model" cannot mean "swap the
Workers-AI call for a localhost call" for *live edge traffic*. It means one of
the four topologies below. Choosing among them **is** the architecture decision.

## The four topologies

### T1 — Batch / build-time (the pattern already in the repo)

Local model runs **offline**, produces **artifacts**, and those artifacts are
uploaded to R2/DB and served by the edge. **No model runs at request time.**

- **This is exactly what content-ingestor already does:** Ollama extracts draft
  nodes locally → they become brain content → the edge serves static, pre-built
  knowledge.
- **Fits:** content-ingestor (done), admin judge (eval runs), bcp-scraper
  normalization, any brain **pre-computation** (e.g. pre-generated answer
  summaries / FAQ nodes for common questions).
- **Does *not* fit:** brain's open-ended live `/ask` — you can't pre-bake every
  possible question.
- **Verdict:** ✅ Zero architectural risk, proven here, no uptime dependency.
  **The default lane for everything that isn't a live free-text endpoint.**

### T2 — Local-only self-host (single-user / offline app)

Ship the whole app to run on the user's machine: local model + local vector
store + local UI, no cloud. brain becomes a desktop/local web app talking to
Ollama on `localhost:11434`.

- **Fits:** a **personal offline brain** for Micah, and **no-cheat's on-device
  vision** (which is already 100 % client-side — it *is* T2 today).
- **Cost:** diverges from the hosted multi-user product; two code paths unless
  abstracted behind one interface (see "The seam" below).
- **Verdict:** ✅ for single-user / privacy-first / offline; ✅ already the right
  answer for no-cheat. ❌ as the *only* answer for a public multi-user brain.

### T3 — Hybrid: edge front, local brain behind a tunnel

Edge Worker stays the front door but **proxies** LLM calls to Micah's box exposed
via a tunnel (Cloudflare Tunnel / `cloudflared`).

- **Fits:** keeping the hosted product but making *Micah's own* traffic run on his
  GPU; a "bring-your-own-model" power-user mode.
- **Cost:** uptime is now Micah's PC; VRAM contention (Quest link) becomes a
  *production* failure; security surface (exposing an inference port). CF Workers
  free-tier subrequest limits + latency across the tunnel hurt interactivity.
- **Verdict:** ⚠️ Viable for **personal** use, **not** for serving other users.
  Keep as an optional route, never the default. (Root CLAUDE.md Rule 9's spirit:
  don't hang a live handler off an unbounded/uncontrolled dependency.)

### T4 — Local replaces cloud entirely for a *dev* environment

Run the local model in development/CI so contributors don't burn cloud tokens;
production keeps Workers AI / Claude.

- **Fits:** everyone's inner loop; deterministic-ish tests against a pinned local
  model; cost control.
- **Verdict:** ✅ Cheap win, orthogonal to the others. Recommend regardless.

### T5 — Self-hosted open-source model on GCP (Micah has GCR access)

**Added 2026-07-06: Micah has GCR access** (read as Google Cloud container
infrastructure — push images to the registry, run them on GCP compute; the
natural serving product is **Cloud Run with GPU**, or a GCE VM). This is the one
topology where an **open-source model can serve public live traffic**: the edge
Worker calls a `*.run.app` HTTPS endpoint exactly like it calls Workers AI today.

- **Plays out — capability:** Cloud Run GPU attaches an **NVIDIA L4 (24 GB)**
  per instance with **scale-to-zero** and per-second billing. 24 GB VRAM moves
  the quality tier well past the home 4060: 14B at Q8/FP8, 32B at Q4, or 8B
  unquantized with real batch headroom — served by vLLM or Ollama in a container.
  *(Capability claims to be re-verified against current GCP docs/quotas in D10 —
  GPU regions, quota approval, and cold-start times change.)*
- **Plays out — fit to the platform:** brain's `/ask` already routes by
  `?model=` — a `GcpProvider` is just another branch of the seam below. The
  latency question is **cold starts**: scale-to-zero means container-boot +
  model-load (tens of seconds for 10+ GB of weights) on first request, unless
  min-instances=1, which trades away free-when-idle. The D10 wargame is
  essentially cold-start UX vs. always-warm cost vs. Workers-AI-as-is.
- **Plays out — risks:** real money (GPU-seconds, egress), GPU quota approval,
  a second cloud to operate, and it must *earn* its place against Workers AI's
  existing 70B — which is already open-weights Llama with zero ops. The honest
  framing: T5 buys **model control** (any OSS model/version, fine-tunes,
  grammar-constrained decoding, embedding parity) and **provider independence**
  — not raw quality, which Workers AI's 70B already matches.
- **Verdict:** ⚠️➕ The credible path to "an open-source model of *our choosing*
  serving the public brain" without betting production on a home GPU. Adopt
  **only if** D02 finds a model/config Workers AI can't host (fine-tune,
  grammars, exact embedding control) or cost forces a move. Full decision: **D10**.

## The recommendation: a two-lane architecture behind one seam

Don't pick one topology globally — **route each surface to the lane that fits**,
behind a single provider interface so the choice is config, not a rewrite.

| Surface | Lane | Why |
|---|---|---|
| content-ingestor | **T1 batch** | Already there. |
| admin judge | **T1 batch** | Tolerates latency; wants the 14B tier. |
| bcp/new-meta/data-import LLM helpers | **T1 batch** | Offline normalization. |
| brain pre-computed FAQ/summary nodes | **T1 batch** | Pre-bake the common questions locally; edge serves them. |
| brain live `/ask` (public) | **cloud stays default**; **T5 (GCP GPU)** is the OSS-hosted candidate; local = **T4 dev** + optional **T3** for Micah | Can't pre-bake open questions; edge can't call home GPU for the public — but it *can* call Cloud Run. |
| brain live `/ask` (Micah, offline) | **T2 local-only** | A personal offline brain is the honest "fully local" answer. |
| no-cheat dice vision | **T2 on-device** (already) | Privacy contract + it already runs client-side. |

### The seam (makes all of the above config, not forks)

Introduce one interface — call it an **LLM provider** — with three
implementations, selected by env:

```
LLMProvider = {
  chat(messages, opts): Promise<string>
  embed(texts): Promise<number[][]>
}

  ├─ CloudflareProvider   env.AI.run(...)            // today's edge default
  ├─ AnthropicProvider    Claude API                 // today's ?model=claude
  └─ OllamaProvider       http://localhost:11434     // NEW — the local lane
```

- content-ingestor's `ollamaChat` is **already** a de-facto `OllamaProvider` — we
  generalize it into `packages/` so brain/admin import the same thing (root
  CLAUDE.md Rule 3: DRY across app boundaries; Rule 4: callable module first).
- brain's `/ask` picks the provider by `?model=`/env exactly as it already picks
  Claude-vs-Workers-AI today — we add `?model=local` → `OllamaProvider`.
- Embeddings unify on `bge-base-en-v1.5` (D04): Workers AI and local
  sentence-transformers produce the **same 768-dim vectors**, so the vector store
  is provider-agnostic (D05).

**Result:** "local implementation" ships as a *provider + a batch lane*, not a
rewrite of the platform. The edge product is untouched by default; flipping
`LLM_PROVIDER=ollama` (dev, or Micah's offline box) makes it fully local.

## The flip triggers (primary → fallback)

- Use **cloud** for public live `/ask` **until** a local 7–14B is proven at
  quality parity (D02's job) *and* a hosting story exists — the hosting story is
  now concrete: **T5 on GCP (D10)**, with T3/T2 for opted-in/personal use.
- Use **local** for every batch/offline/on-device surface **now** — no trigger
  needed; the pattern is proven (content-ingestor) and privacy-favored (no-cheat).

## What this means for the rest of the wargame

- D01 (runtime), D02 (model), D03 (quant) size the **OllamaProvider** and the
  **batch lane** — the 7–8B GPU tier for interactive/dev, the 14B hybrid tier for
  batch quality.
- D04/D05 make the **vector path** provider-agnostic so T1/T2/T3 share one index.
- D06 is pure **T2 on-device** and can be built end-to-end locally today.
- D08/D09 make the local lane *robust* (structured output; VRAM-contention ops).
