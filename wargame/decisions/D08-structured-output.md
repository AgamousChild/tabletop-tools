# D08 — Structured output & orchestration for local models

> **Decision.** How the platform makes 7–14B local models return *valid,
> schema-conforming* structured data (JSON, verdicts, mappings) reliably — and
> what the retry/escalation ladder is when they don't.
>
> **Status:** drafted 2026-07-06 (loop iteration 4). Grounded in
> `apps/content-ingestor/src/llm/ollama.ts` and
> `apps/admin/server/src/lib/llm-evaluator.ts` (both read this session).

## Forces (grounded — including a real defect)

- **The status quo is prompt-and-pray with silent loss.**
  `ollama.ts:parseJsonFromResponse` strips markdown fences, `JSON.parse`s, and
  returns `null` on failure; `extractConcepts` then `continue`s past the chunk
  (`ollama.ts:150–152`). **A chunk whose JSON is malformed is silently dropped
  — no log, no retry, no metric.** At 7–8B model quality this is a real loss
  rate, and nobody can currently see it.
- The judge (`llm-evaluator.ts:parseResponse`) is more defensive: strict
  one-line regex, then a keyword-anywhere fallback — good instincts, still
  regex-on-freeform.
- The extraction task is the platform's hardest structured ask (JSON array,
  nested strings with `\n`s, confidence floats, enum categories —
  EXTRACTION_PROMPT). It's exactly where small models produce trailing commas,
  unescaped quotes, and prose preambles.
- The platform is **already a Zod shop** (tRPC + Zod, root stack table). Any
  schema story that isn't Zod-first would fork the type system.
- Runtime capabilities (from D01): Ollama supports `format: "json"` and
  JSON-schema-constrained decoding via `format: <schema>` *(version-dependent
  — verify on the installed daemon)*; llama-server offers **GBNF grammars**
  (hard constraint, arbitrary CFG); vLLM (T5 lane) has guided decoding
  (outlines/xgrammar-class).

**Rubric weights:** Quality(=validity rate) ×3 · Effort ×2 · Stack ×3 ·
Latency ×1 · Fit ×1 · Risk ×2.

## Options

### J1 — Prompt-only + lenient parse (status quo)

Works surprisingly often with a good example block (the prompts are good).
But: unmeasured silent loss, and every consumer reinvents fence-stripping.

- **Score:** Quality 2 · Effort 5 · Stack 3 · Latency 5 · Fit 5 · Risk 2 → weighted **2.92**.

### J2 — JSON mode (`format: "json"`)

Guarantees *syntactically* valid JSON, not the right *shape* — model can still
emit `{"concepts": …}` instead of a bare array, wrong keys, wrong enums.

- **Score:** Quality 3 · Effort 5 · Stack 3 · Latency 4 · Fit 5 · Risk 3 → weighted **3.31**.

### J3 — Schema-constrained decoding (Ollama `format: <JSON schema>`)

Decoder can only emit tokens consistent with the schema → syntax **and**
structure guaranteed; enums/floats enforced at generation time. Schema derived
from the existing Zod definitions (zod-to-json-schema). Costs: slight latency
overhead, schema features vary by runtime version, and **constrained decoding
can mask model confusion** (it will produce *a* valid object even when it
understood nothing — validity ≠ truth).

- **Score:** Quality 4 · Effort 4 · Stack 5 · Latency 4 · Fit 4 · Risk 4 → weighted **4.08**.

### J4 — GBNF grammars (llama-server)

The hard-constraint endgame — arbitrary grammars, including formats JSON
schema can't express (the judge's `APPROVE - reason` one-liner!). Per-job
llama-server spawn per D01's escalation design.

- **Score:** Quality 5 · Effort 2 · Stack 3 · Latency 4 · Fit 4 · Risk 4 → weighted **3.69**.

### J5 — Validate-and-retry loop (Zod as the gate)

Runtime-agnostic: parse → Zod-validate → on failure, re-prompt **with the
validation error appended** (models fix their own JSON well when shown the
error) → N=1–2 retries → then fail *loudly* into a review queue. This is the
only option that also catches *semantic* garbage (wrong enum, confidence out
of range) and the only one that produces a **measurable failure rate**.

- **Score:** Quality 4 · Effort 3 · Stack 5 · Latency 3 · Fit 5 · Risk 5 → weighted **4.15**.

### J6 — Two-pass (freeform reasoning → formatting pass)

Decouples thinking from formatting; doubles calls. Qwen3's thinking mode
(D02) gives the same separation natively — redundant here.

- **Score:** Quality 3 · Effort 3 · Stack 3 · Latency 2 · Fit 3 · Risk 3 → weighted **2.92**.

## Wargame

- **J3 vs J5 is a false rivalry — they fail differently.** Constrained decoding
  (J3) eliminates *syntactic* failure but can't detect a model that filled the
  schema with confident nonsense; validation-retry (J5) catches semantic
  violations and measures everything but burns retries on syntax a constraint
  would have prevented. **Layered, they cover each other**: constrain the
  decode, then validate the semantics, then retry with feedback, then queue
  for review. The layers share one Zod schema, so the cost of "both" is
  wiring, not duplication.
- **Where J4 earns its spawn:** formats outside JSON-schema's power (the
  judge's line format), or a surface whose J3+J5 failure rate stays >5 % after
  prompt iteration. Per D01, that's a per-job llama-server, not a daemon
  change.
- **The silent-drop defect stands alone:** whatever else ships,
  `extractConcepts`' `continue`-on-null becomes a logged, counted, re-queued
  event. You cannot tune a loss rate you cannot see. This is the single
  highest-value change in this decision and it costs an afternoon.
- **Relevance/YES-NO tasks:** leave them as text + regex (`/YES/i` works and
  is self-evident). Constraining a boolean is ceremony. (Counter-case: if
  relevance misfires appear in the D02 eval, a one-token logit constraint via
  J4 is the surgical fix.)

## Recommendation

**The ladder, per structured surface:**

1. **One Zod schema per output type** in a shared package (`DraftNode` array,
   judge verdict, mapping proposals…) — single source of truth, reused by
   tRPC/tests (Rule 3).
2. **J3**: derive JSON schema from Zod → pass as Ollama `format`.
   **Verified 2026-07-06: installed daemon is Ollama 0.24.0 — schema-
   constrained `format` is supported today** (hardening log, pass 1); the
   `format:"json"` J2 floor is only a fallback for other environments.
3. **J5**: Zod-validate every response; on failure retry once with the Zod
   error text; second failure → **log + persist raw response to a review
   table** (Rule 6: failures are data), never silent-drop.
4. **J4 escalation**: judge one-liner grammar + any surface stuck >5 %
   failure after 2–3 prompt iterations.
5. **Metrics from day one**: per-surface counters {attempts, constrained,
   retried, failed} — the D02 eval reads these to compare models honestly.

**Flip triggers:** installed Ollama lacks schema-`format` → J2+J5 until
upgraded; a surface needs non-JSON structure → J4 directly; T5/vLLM lane →
same Zod schema via guided decoding (the schema layer is runtime-portable by
construction).

## Implementation notes (concrete, this repo)

1. `parseJsonFromResponse` moves into the shared provider package (D01) as
   `parseAndValidate(schema, raw)` — fence-strip + `JSON.parse` + Zod +
   structured error. `ollama.ts` and `llm-evaluator.ts` both consume it.
2. `extractConcepts` (`ollama.ts:134–173`): thread the retry + review-queue
   path; drop the bare `continue`.
3. Judge migration happens with its localization (D02 consolidation): same
   ladder, grammar file for the one-line format if kept, or move the verdict
   to a 3-field JSON schema (cleaner) when the Workers-AI dependency is cut.
4. `num_predict: 4096` (existing) stays the hard output cap; schema-constrained
   arrays should also carry `maxItems` to prevent runaway generations.
5. Review queue table: `{id, surface, model, prompt_hash, raw_response,
   zod_error, created_at}` — feeds both debugging and future fine-tune data.
