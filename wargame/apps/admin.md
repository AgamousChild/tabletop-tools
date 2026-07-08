# Playbook — admin: localize the LLM judge (and make it the platform's grader)

> **Deliverable.** Move the crosswalk judge onto the local lane per D02
> (Tier II) and D08, and promote it into the reusable grading harness the D02
> eval protocol needs. Small surface, outsized leverage: the judge is how every
> other model decision gets *measured*.
>
> **Status:** drafted 2026-07-06 (loop iteration 7). Grounded:
> `server/src/lib/llm-evaluator.ts` (+ tests), `routers/crosswalk.ts:439–516`
> call site, admin CLAUDE.md — read this session.

## Current state (grounded)

- `evaluateCandidate(ctx.ai, evalInput, model?)` — Workers AI binding, default
  **`@cf/meta/llama-3-8b-instruct`** (`llm-evaluator.ts:19`) — **one
  generation older than the platform's local incumbent** (llama *3.1*).
- Invoked by `crosswalk.runLlmEvaluator` (adminProcedure mutation,
  `batchSize` input, `crosswalk.ts:439`) to APPROVE/REJECT/UNSURE proposed
  brain-node→entity re-keys; prompt applies ordered decision rules
  (DEF-008: lean on match_method + confidence).
- Output contract: one line `DECISION - reason`, parsed by strict regex with
  keyword-anywhere fallback (`parseResponse`).
- **Caution flag from admin CLAUDE.md:** "16 failing in crosswalk router
  (pre-existing)" — *do not refactor on red*; triage those first.

## Target

Judge runs on **Tier II local** (`qwen3:14b`, `/think`) for batch sweeps —
better verdicts than an 8B edge model, zero marginal cost — while the tRPC
endpoint keeps working (Workers AI or local, by config). The same
`evaluateCandidate` core becomes the **grader** for D02's eval protocol.

## Implementation plan

### Phase 0 — Green the crosswalk tests

Triage the 16 pre-existing failures (admin CLAUDE.md). Fix or explicitly
quarantine with reasons *before* touching the evaluator. **Proof:** suite
status recorded; no new work on red.

### Phase A — Seam the evaluator (D01)

1. `evaluateCandidate` accepts an `LLMProvider` instead of the raw `AiBinding`
   (the Cloudflare impl wraps `ctx.ai` — endpoint behavior unchanged;
   `model` param maps through).
2. Bump the **edge default** off the stale model: `llama-3-8b` →
   `llama-3.1-8b` equivalent on Workers AI (or Tier I local when running
   locally). One-line correctness win regardless of everything else.
3. **Proof:** evaluator tests pass with a mock provider; live smoke:
   `runLlmEvaluator({batchSize: 5})` verdict distribution sane.

### Phase B — Local batch sweep (T1, Tier II)

1. CLI (Rule 4: importable `sweepCrosswalk(opts)` + thin bin) that pages
   through pending candidates and runs the judge on
   `qwen3:14b-q4_K_M` (`/think`), through the D09 runner (guard: `minTier:
   'II'` → refuses when Quest link holds VRAM; overnight Task-Scheduler
   window; resumable by candidate id).
2. Verdicts land exactly where the endpoint's do (same table/fields) tagged
   `model` + `lane` so agreement can be measured.
3. **Proof:** overnight sweep of a real batch; spot-check 20 verdicts by hand;
   UNSURE-rate compared to the 8B edge baseline (expect ↓ *(est.)* — record
   actual).

### Phase C — Output contract per D08

Keep the one-line format initially (regex is tested and working). If
parse-failure metrics (D08 counters, added in Phase A wiring) show >2–3 %
mangling on the local model, migrate to a 3-field JSON schema
(`{decision, reason}` + Zod) or a GBNF grammar for the line format —
**metrics decide, not taste.**

### Phase D — Promote to platform grader (feeds D02)

1. Generalize: `grade(items, rubricPrompt, {model, lane})` alongside the
   crosswalk-specific wrapper — same provider, same parsing, same logging.
2. This is the harness the D02 eval protocol calls for brain-answer grading
   and extraction scoring. Build it here (where judging already lives) rather
   than a new tool (Rule 3).
3. **Proof:** D02's eval runs end-to-end using this grader; results recorded
   in D02.

## Verification checklist

- [ ] 0: crosswalk suite green/triaged, recorded.
- [ ] A: default model bumped; tests green; smoke batch sane.
- [ ] B: overnight sweep completed + resumability shown; agreement numbers recorded.
- [ ] C: parse metrics live; contract migration only if numbers demand.
- [ ] D: D02 eval executed through `grade()`.

## Risks / notes

- **Judge-grades-its-own-family bias:** Tier II Qwen grading Tier I Qwen
  (D02 eval) can flatter siblings *(est.)* — for the eval protocol,
  cross-check a sample with the strongest disinterested grader available
  (Claude via existing key, or the 70B) before trusting close calls.
- Thinking-mode latency is irrelevant overnight but caps interactive use —
  the tRPC endpoint stays on fast non-thinking models by default.
- The DEF-008 prompt design (trust match_method/confidence, APPROVE unless
  obvious mismatch) is policy, not prose — port it verbatim to any new model
  and re-verify with the Phase B spot-check.
