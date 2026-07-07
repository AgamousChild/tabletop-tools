# D10 — Hosted OSS serving on GCP (the T5 lane)

> **Decision.** How (and whether) to use Micah's GCP/GCR access to serve an
> open-source model for public live traffic — the only topology where "our
> model, publicly served" is possible without betting on a home PC.
>
> **Status:** drafted 2026-07-06 (loop iteration 5). GPU capability facts
> verified against Google's Cloud Run GPU docs **today** (fetched
> `docs.cloud.google.com/run/docs/configuring/services/gpu`). **Pricing
> verified in hardening pass 3 (2026-07-06)** — Tier 1 region rates:
> **L4 GPU $0.0001867/s ≈ $0.67/hr** (no zonal redundancy; $0.0002909/s with),
> vCPU ~$0.000024/s ≈ $0.086/hr, memory $0.0000025/GiB-s ≈ $0.009/GiB-hr.
> At the L4 minimum config (GPU + 4 CPU + 16 GiB):
> **≈ $1.16/hr all-in while active, $0 idle** (scale-to-zero confirmed;
> GPU has no free tier; instance-based billing required).

## Verified facts (2026-07-06, Google docs)

- **GPU types:** NVIDIA **L4 — 24 GB** VRAM; NVIDIA **RTX PRO 6000 Blackwell —
  96 GB** VRAM.
- **Scale-to-zero: yes**, explicitly supported for GPU services; **instance
  cold start ≈ 5 s** (Google's number — *instance* start, not model load; see
  below).
- **Regions (L4):** includes `us-central1`, `us-east4` (+ EU/Asia).
- **Minimums:** L4 → 4 CPU / 16 GiB (8 / 32 recommended). Blackwell → 20 CPU /
  80 GiB (a cost floor, not a detail).
- **Quota:** initial projects get **3 L4s per region** — no special-approval
  wall for a probe.
- **Zonal redundancy: ON by default** (reserved cross-zone capacity = more
  expensive); can be disabled for best-effort failover.
- **Billing:** instance-based — the GPU bills for the instance's entire
  lifecycle, and concurrency must be set deliberately.

The honest cold-start math: Google's ~5 s is the instance; **time-to-first-
token also pays model load** (10–19 GB of weights into VRAM). Design target
with a baked-into-image model + vLLM: **~10–30 s end-to-end cold TTFT
*(est.)*** — verify with the probe below. That is the UX price of
scale-to-zero.

## Options

### G0 — Don't adopt: stay on Workers AI 70B (incumbent)

Zero ops, zero new cost, already-OSS weights (Llama 3.3), already integrated.
Lacks: model choice, fine-tunes, guided decoding, embedding parity.

- **Verdict:** remains the public default **until D02's eval + a concrete need
  triggers T5** (per D07). This is not a loss — it's the null hypothesis every
  option below must beat.

### G1 — Cloud Run + L4 + vLLM, scale-to-zero (the probe candidate)

Qwen3-14B-AWQ (~9–10 GB) or -FP8 (~15–16 GB) on a 24 GB L4 with real KV
headroom for continuous batching; OpenAI-compat endpoint; **$0 when idle**.

- **Plays out:** the brain Worker adds a `GcpProvider` branch — same
  OpenAI-compat wire as Ollama/llama-server (D01's unifier pays off here:
  three backends, one client). Cold TTFT ~10–30 s *(est.)* on first request
  after idle — acceptable for an opt-in "high-quality local-lineage model"
  tier; **not acceptable as the default answerer** without warming.
- **Cost:** usage-dominated; zonal redundancy OFF for hobby scale. *(est.)*
  order low-single-$ per active hour all-in; pennies/day at hobby traffic.
- **Score:** Fit 4 · Quality 4 · Latency 3 (cold) · Effort 3 · Stack 4 · Risk 4.

### G2 — G1 + `min-instances=1` (always-warm)

Kills cold start; bills the GPU 24/7. *(est.)* hundreds of $/month — the
entire cost story inverts. Only defensible with real sustained traffic, which
the platform does not have.

- **Verdict:** documented trigger, not a starting point.

### G3 — GCE VM (incl. spot) + L4

Cheaper raw compute, full control; but *you* run the lifecycle (start/stop,
patching, restarts), spot preemption kills long-lived servers, and idle cost
discipline becomes a human job. Cloud Run's scale-to-zero *is* the discipline,
automated.

- **Verdict:** rejected for serving; noted as the cheap lane for **big offline
  batch** (e.g. a one-off 70B re-processing run on spot) if ever needed.

### G4 — Cloud Run + RTX PRO 6000 (96 GB): the 70B endgame

**This changes a `01` conclusion at the platform level:** 70B-class OSS is off
the table *locally*, but Llama-3.3-70B-AWQ (~40 GB) or even FP8 (~70 GB) fits
a single Blackwell instance — "our own 70B, publicly served" is now a real
option. The 20-CPU/80-GiB minimum makes it strictly a
scale-to-zero-or-nothing play *(est.: multi-$/hr active)*.

- **Verdict:** the documented quality endgame **if** D02's eval shows Tier II
  (14B) can't close the gap for the public lane *and* Workers AI's 70B stops
  being adequate (deprecation, cost, or need for fine-tune/guided decoding).
  Two independent triggers; don't reach for it before both fire.

### G5 — GKE

Kubernetes for one endpoint at hobby traffic. Rejected without scoring (root
rule: keep the stack shallow).

## Wargame

- **G0 vs G1 — what actually forces the move?** Quality alone doesn't: Workers
  AI already hosts a 70B that *(est.)* beats any 14B we'd deploy. The honest
  triggers are **capability** (a fine-tuned model, guided decoding for
  structured public outputs, exact embedding-model control) and **provider
  risk** (Workers AI model deprecation/pricing). Absent those, G1 is a science
  project — build the probe, record the numbers, *don't* flip the default.
- **Cold start vs always-warm is a false binary at hobby scale.** A third
  path: the Worker fires a warming ping when a user *opens* the Ask tab
  (~5–30 s of human think-time before the first question covers most of the
  cold window). Costs nothing when nobody browses. Design this into the probe.
- **Registry note:** "GCR" the registry is deprecated in favor of **Artifact
  Registry** — image push targets `*-docker.pkg.dev`. Micah's access statement
  covers either; the deploy scripts should target Artifact Registry from day
  one. *(Verify project's enabled APIs at adoption.)*
- **Egress/data boundary:** prompts/contexts flow to GCP — same class of
  disclosure as the existing Claude/Gemini paths; no GW content is *stored*
  (stateless inference), so the platform's data boundary holds unchanged.

## Recommendation

**G0 stays the public default.** Build **G1 as a one-day probe** when (a) the
D02 eval is running and wants a quality ceiling comparison, or (b) any
capability trigger fires. Probe spec: `us-central1`, L4, zonal redundancy off,
`max-instances=1`, vLLM OpenAI server, **Qwen3-14B-AWQ baked into the image**
(pinned revision per D03), measure {cold TTFT, warm TTFT, tok/s at
concurrency 1–4, $/1M tokens vs Workers AI}. Record results in this doc;
**no default flip without D07's two conditions** (eval parity + cost/UX
cleared). G4 stays the documented 70B endgame behind its two triggers.

## Implementation notes (concrete)

1. **Image:** `vllm/vllm-openai` base + model weights at a pinned HF revision
   baked in (layer-cached; Cloud Run image streaming mitigates size), port
   8080, `--max-model-len` set from the KV budget on 24 GB, concurrency set
   to match (billing note above — concurrency is a cost lever, set it
   deliberately, start at 4).
2. **Auth:** Cloud Run service requires IAM auth; the brain Worker calls with
   an ID token (service-account key in Worker secrets — same pattern as
   `ANTHROPIC_API_KEY`). Never expose the endpoint unauthenticated.
3. **Provider seam:** `GcpProvider` = the OpenAI-compat client from D01 with a
   different base URL + auth header. `?model=gcp` routes to it in
   `worker.ts`'s existing model-routing branch. Warming ping = `GET /health`
   fired on Ask-tab open.
4. **Ops:** deploys via `gcloud run deploy` from a script in `scripts/`
   (admin-chore class, Rule 4-exempt but importable-wrapped anyway); budget
   alert on the project **before** the first deploy; `max-instances=1` until
   there's a reason.
