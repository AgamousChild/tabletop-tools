# D07 — Serving topology (formal record)

> **Decision.** Where models run per surface: edge (Workers AI/Anthropic),
> local batch (T1), local self-host (T2), tunnel-hybrid (T3), local dev (T4),
> GCP-hosted OSS (T5).
>
> **Status:** ✅ decided 2026-07-06. The full analysis lives in
> [`../03-top-level-architecture.md`](../03-top-level-architecture.md) — it was
> written first because every other decision inherits it. This file exists so
> the register is complete and the decision has a stable ID; it adds the final
> routing table and nothing else. (Stop when it works — no duplication.)

## The decision, restated in one paragraph

Route each surface to the lane that fits, behind **one provider seam**
(`LLMProvider` for chat/embed — D01; `VectorStore` for ANN — D05), so lane
choice is configuration, not architecture. The public edge product keeps
cloud-hosted inference by default; everything batch, offline, personal, or
privacy-bound runs locally **now**; GCP (T5) is the sanctioned path if/when an
OSS model of our choosing must serve public live traffic.

## Final routing table (authoritative)

| Surface | Lane | Provider config |
|---|---|---|
| content-ingestor (all 4 ops) | T1 local batch | Ollama, Tier I (Qwen3-8B) |
| admin judge (crosswalk + evals) | T1 local batch | Ollama, Tier II (Qwen3-14B) |
| versus rule-compiler, list/meta normalizers, data-import reconcile | T1 local batch | Ollama, Tier I (III for bulk) |
| brain graph build + pre-computed nodes + local index emit | T1 local batch | build scripts + D04 ONNX embed |
| brain `/ask` public | cloud (Workers AI 70B / Claude opt-in) | unchanged; T5 candidate on D10 triggers |
| brain `/ask` dev | T4 | `LLM_PROVIDER=ollama` |
| brain personal/offline | T2 | Ollama + `brain.db` (D05) |
| brain Micah-only live remote | T3 (optional, never default) | tunnel → home Ollama |
| no-cheat vision | T2 on-device (browser) | ONNX WebGPU (D06) |
| physics / study search | T1 build-time + S4 static | D04 embed + D11 ASR/OCR |
| game-tracker photo OCR (parked) | T2/T1 if ever wanted | D11 family |

## Flip triggers (inherited from `03`, restated)

- Public `/ask` moves off Workers AI only when: D02's eval proves the chosen
  OSS model/config on our tasks **and** D10 clears cost + cold-start UX on
  GCP. Both, not either.
- T3 never graduates beyond Micah's own traffic; its failure domain is a
  domestic PC and that is disqualifying for other users by definition.

## Follow-ups

- D10 is the only open branch of this decision (GCP specifics).
- The brain playbook implements the seam swap in `retrieve.ts` / `worker.ts`.
