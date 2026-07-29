# /ask eval pipeline

Systemic-failure detector for the brain's `/ask` endpoint. Harvests recent
question-shaped posts from a curated set of 40K subreddits, feeds each one
through the deployed `/ask`, and grades the response along structural
dimensions (faction detection, retrieval coverage, cube dispatch, provenance
labeling, formatting bleed, timing). Aggregates failure modes across the
batch so systemic bugs surface as histogram spikes.

## Design

The grader is **mostly deterministic** — every dimension is extracted from
the `/ask` response object (`detected.factions`, `reference.length`,
`webSources.length`, `contextLength`, `debug.*`). No LLM is required for
the first pass. This is intentional: hallucination-detection and semantic
judgment are the expensive minority; structural checks catch 80% of the
bugs at 0% cost.

## Files

```
scripts/eval-ask/
  types.ts          — HarvestedQuestion, AskRun, Grade
  harvest.ts        — Reddit → questions.jsonl
  run.ts            — questions.jsonl → answers.jsonl (calls deployed /ask)
  grade.ts          — answers.jsonl → grades.jsonl (deterministic dimensions)
  aggregate.ts      — grades.jsonl → console report
  .data/            — pipeline outputs (gitignored)
```

Every stage reads/writes JSONL, is idempotent, and can be re-run against
a partially-completed output. Kill a run mid-way, restart, no rework.

## Usage

```bash
# 1. Harvest recent question-shaped posts (default 500 target).
npx tsx scripts/eval-ask/harvest.ts

# 2. Feed every harvested question through the deployed /ask.
#    ?nocache=1 so we measure current behaviour, not cached hits.
npx tsx scripts/eval-ask/run.ts

# 3. Extract structural dimensions from every response.
npx tsx scripts/eval-ask/grade.ts

# 4. Print the failure-mode histogram + samples.
npx tsx scripts/eval-ask/aggregate.ts
```

Each script accepts `--in=` / `--out=` overrides. `run.ts` accepts
`--concurrency=N` (default 8) and `--limit=N` (cap new runs this
invocation, existing rows don't count). `run.ts` also accepts
`--brain-url=` if you want to point at a preview deploy.

## Failure modes the grader currently detects

Named strings that show up in the aggregate report:

| Mode | Meaning |
|---|---|
| `web-only-without-disclaimer` | Answer came from Gemini alone (refs=0), but didn't preface with the "brain has no matching content" disclaimer. Provenance lie. |
| `no-faction-no-refs` | Neither faction detection nor retrieval fired — the whole system had nothing to work with. |
| `cube-dispatch-missed` | Question looks like it should have triggered the cube dispatcher (count/enum shape) but didn't. |
| `latex-bleed` | Answer contains raw LaTeX (`\[`, `\begin{`, `\binom`, etc.) that the client can't render. |
| `confidence-gate-triggered` | /ask bypassed the LLM entirely because top retrieval score was below threshold. |
| `answer-too-long` | Response > 3000 chars — likely rambling. |
| `answer-too-short` | Response < 150 chars — likely a nothing-to-say. |
| `faction-inference-miss` | Query mentions a proper-noun-shaped token that could be a unit, but detected.factions came back empty. |
| `slow-response` | > 20s round trip. |
| `answer-from-nothing` | 0 refs + 0 web sources + no "no data" admission — the LLM confabulated from training. |
| `ask-request-failed` | Transport error. |

## Interpreting the report

The frequency histogram tells you which layer to fix first. Example
readouts you'd expect to see:

- **`faction-inference-miss` at 20%** → the unit-name inferrer isn't
  matching enough patterns. Look at samples for common phrasings.
- **`cube-dispatch-missed` at 15%** → the count-shape parser's regex set
  is under-covering. Look at samples for the phrasings that slip through.
- **`web-only-without-disclaimer` at 30%** → prompt adherence is weak;
  the LLM isn't emitting the required preamble often enough.
- **`no-faction-no-refs` at 40%** → retrieval is systemically failing.
  Bigger problem than any single fix.

Once a failure mode drops out of the top-3, move on to the next.

## Cost

- Reddit API: free (unauth, ~600ms/page throttle).
- /ask: hitting the deployed Worker. Workers AI as answerer = ~$0 today.
- Grader: 100% local Node, no LLM.
- Total for a 500-run batch: **~$0** (assuming Workers AI still free-tier).

## Adding LLM-judged dimensions

The `Grade.judged` field (in `types.ts`) is reserved for the next layer:
hallucination detection, entity-attribution checks, and adherence rating.
Implementation would spawn `claude -p --model haiku` per question,
consuming plan quota rather than cash. Not required for the first pass —
the deterministic checks catch the systemic bugs on their own.
