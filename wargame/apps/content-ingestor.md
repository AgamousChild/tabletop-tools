# Playbook — content-ingestor: harden the existing local-LLM lane

> **Deliverable.** content-ingestor already runs local (Ollama) — this playbook
> upgrades it from "works when the JSON parses" to the platform's reference
> implementation of D01/D02/D03/D08/D09.
>
> **Status:** drafted 2026-07-06 (loop iteration 7). Grounded:
> `src/llm/ollama.ts`, `src/llm/prompts.ts`, `src/types.ts:86–87`,
> `src/review/auto-review.ts:12–13`, `server/src/lib/extract.ts:80` — all read
> this session.

## Current state (grounded)

- **Local lane (CLI/src):** `ollamaChat` → `localhost:11434/api/chat`,
  `num_ctx 8192`, `num_predict 4096`; model default **`llama3.1:8b`**
  hardcoded at `types.ts:86`; auto-review separately hardcodes **`gemma2:9b`**
  (`auto-review.ts:12`). Four ops: relevance (YES/NO), cleanup (chunked 3000),
  extraction (JSON array), timestamps (JSON array).
- **Worker lane (server/src):** `extract.ts:80` calls **`claude-haiku-4-5`** —
  a separate cloud extraction path.
- **Defect (D08):** `extractConcepts` silently `continue`s when JSON parsing
  fails — unmeasured data loss.
- Chunking, glossary-carrying prompts, and lenient fence-stripping are all
  sound design — keep them.

## Target

Same four operations, now: shared provider (D01), env-configured pinned
models (D02/D03), schema-enforced outputs with visible failures (D08), runs
logged + VRAM-guarded (D09). Cloud (haiku) remains an explicitly-selected
alternative lane, not a divergent twin.

## Implementation plan

### Phase A — Extract the shared provider (D01)

1. Move `ollamaChat` + `parseJsonFromResponse` + `chunkText` into the shared
   package (`packages/llm-provider` or `server-core`) as the OpenAI-compat
   client (`/v1/chat/completions` — migrate off native `/api/chat` so
   Ollama/llama-server/vLLM interchange per D01).
2. `LLMConfig` gains `endpoint`/`model` **from env** (`LLM_ENDPOINT`,
   `LLM_MODEL`); `types.ts:86` and `auto-review.ts:12` literals become
   defaults-of-last-resort, then die. (Rule 6: model choice is config-data.)
3. **Proof:** existing `ollama.test.ts` / `extract.test.ts` pass against the
   shared module (their mock URLs update to `/v1`).

### Phase B — Kill the silent drop (D08 ladder; the high-value fix)

1. Zod schemas in the shared package: `ExtractedConcept[]`,
   `TimestampEntry[]` (mirroring the prompt contracts in `prompts.ts`).
2. `parseAndValidate(schema, raw)`: fence-strip → parse → Zod → typed error.
3. Retry-once-with-error: on failure, re-send with the Zod message appended;
   second failure → **review-queue row** (`{surface, model, prompt_hash,
   raw_response, zod_error, ts}` — a real table, Rule 6) + counter. No more
   bare `continue` (`ollama.ts:150–152`).
4. Ollama `format: <json-schema>` (J3) once verified on the installed daemon;
   until then `format:"json"` floor.
5. **Proof:** induced-failure test (feed a prompt that yields prose) lands a
   review-queue row and increments the metric; fixture suite reports JSON
   validity ≥ 95 % (baseline number recorded first — see Phase C).

### Phase C — Model flip behind the eval (D02)

1. Build the extraction fixture set (~20 chunks with human-graded reference
   concepts) — this doubles as the D02 eval's extraction slice.
2. Baseline `llama3.1:8b`, then `qwen3:8b-q4_K_M` (both `/no_think`), compare:
   concept recall/precision (judge-graded), JSON validity, tok/s.
3. Flip `LLM_MODEL` only on a win; `llama3.1:8b` stays pulled (rollback).
   Auto-review's `gemma2:9b` consolidates to the same Tier I unless the eval
   shows a review-specific regression (then keep — evidence beats tidiness).
4. Extraction *escalation*: chunks whose confidence < 0.6 or that hit the
   review queue re-run on Tier II (`qwen3:14b`, `/think`) overnight (D09
   window).

### Phase D — Runs through the D09 runner

Warm-load, `keep_alive 30m`, VRAM guard (`minTier: 'I'`), per-chunk JSONL log
(tokens, ms, parse_status), resumable checkpoints (chunk index persisted).
**Proof:** kill a run mid-way; re-run skips completed chunks.

### Phase E — Reconcile the Worker/cloud lane

`server/src/lib/extract.ts` (haiku) stays as the **opt-in cloud tier** (per
D07) but consumes the same Zod schemas + review queue so both lanes measure
identically. Choosing cloud vs local is a config/flag, not a code path fork.

## Verification checklist

- [ ] A: tests green on shared module; no hardcoded model literals remain (grep).
- [ ] B: induced failure → queue row; validity metric live; baseline recorded.
- [ ] C: eval table (llama3.1 vs qwen3) recorded in D02; flip decision noted.
- [ ] D: kill/resume demonstrated; run log shows tok/s + parse_status.
- [ ] E: one schema module imported by both lanes (grep proves single source).

## Risks / notes

- Prompt/template sensitivity on model flip: EXTRACTION_PROMPT's embedded JSON
  example is the fragile piece — the fixture suite is the regression net.
- `num_ctx 8192` + 3000-char chunks leaves headroom for schema-constrained
  output; don't raise chunk size without re-checking the D03 KV math.
- The GLOSSARY prompt block is domain gold — it ports to every model
  unchanged; never let a "cleaner prompt" refactor drop it.
