# 00 — Methodology: how this wargame works

## What "wargame" means here

A wargame is not a survey and not a tutorial. It is **adversarial decision
analysis**: for each fork in the road we

1. **State the decision** and why it exists (what forces it).
2. **Enumerate the real options** — including the "do nothing / stay on cloud"
   option, which is always on the board.
3. **Play each option out** against the constraint set below. "Playing out"
   means: what actually happens on *this* hardware, at *this* scale, under
   *this* deploy model — not the datasheet best case.
4. **Score** on a fixed rubric (below).
5. **Recommend** a primary choice **and a fallback**, and name the trigger that
   flips you from primary to fallback.

Every option gets a fair hearing — we red-team the recommended choice as hard as
the rejected ones. The point is to surface the failure mode *before* it costs
Micah his time (root CLAUDE.md, Rule 0).

## The constraint set (the "map" we wargame on)

These are fixed facts, measured or read from code — not assumptions. Full detail
in [`01-system-capabilities.md`](01-system-capabilities.md) and
[`02-ai-surface-inventory.md`](02-ai-surface-inventory.md).

| Constraint | Value | Why it bites |
|---|---|---|
| VRAM | **8 GB** (RTX 4060, Ada, cc 8.9) | Hard ceiling on model+KV-cache that runs at full GPU speed. |
| VRAM contention | Meta Quest link can hold ~5 GB | "8 GB" is only real when the headset link is off. |
| System RAM | 32 GB | Ceiling for CPU/hybrid offload of bigger models. |
| CPU | i7-14700F, 20C/28T | Strong CPU offload + can run embeddings/vision on CPU. |
| Deploy model | **Cloudflare Workers (edge)** | A local GPU cannot serve production edge traffic. This is the central tension — see `03`. |
| Privacy posture | no-cheat: pixels never leave device; platform: no GW content committed | Favors local/on-device for anything image- or IP-adjacent. |
| Existing local precedent | content-ingestor already calls **Ollama** | We are extending a proven pattern, not inventing one. |

## Scoring rubric

Each option is scored 1–5 (5 = best) on six axes, then weighted. Weights differ
per decision (a batch job weights latency low; a live endpoint weights it high) —
each decision doc states its weights.

| Axis | Question |
|---|---|
| **Fit** | Does it run on 8 GB VRAM / 32 GB RAM at usable speed, honestly? |
| **Quality** | Output accuracy for *this* task (not MMLU — the actual job). |
| **Latency** | Time-to-first-token / inference time at the required interactivity. |
| **Effort** | Dev + ops cost to build and keep running. |
| **Fit-to-stack** | Does it match the existing TS/SQLite/Workers/Ollama stack? |
| **Risk** | Failure modes, maturity, lock-in, maintenance drift. |

Score table format per option:

```
| Option | Fit | Quality | Latency | Effort | Stack | Risk | Weighted |
```

## How to read a decision doc

Every `decisions/DNN-*.md` has the same skeleton:

- **Decision** — one sentence.
- **Forces** — what makes this non-obvious.
- **Options** — one subsection each: what it is, how it plays out here, score.
- **Wargame** — the head-to-head; where options break.
- **Recommendation** — primary + fallback + the flip trigger.
- **Implementation notes** — concrete: model IDs, commands, config, the file in
  this repo that changes.

## Ground rules (inherited from root CLAUDE.md)

- **Verify before asserting.** Numbers come from `nvidia-smi`, a benchmark, or a
  line of code we read — never from memory. Where a number is an estimate, it is
  labeled *(est.)* with the basis.
- **No committed GW content.** Model *choices* and *pipelines* are documented;
  no unit stats, ability text, or dice artwork lands in these docs or the repo.
- **Everything is a callable function** (Rule 4). Recommendations prefer an
  importable module wrapped for CLI/cron/API over a one-off script.
- **Chunk by design** (Rule 9). Anything that could run long (batch re-index,
  bulk extraction) is designed as orchestrated chunks from the start.

---

## Loop protocol (for the hourly `/loop`)

Each iteration is one self-contained unit of progress:

1. Open [`README.md`](README.md); pick the **top ⏳ pending** item in the
   decision register, else the top pending per-app playbook.
2. Ground it: read the actual code for that surface (don't infer) before writing.
3. Write/extend its doc following the skeleton above. Real options, real VRAM
   math, real model IDs, a recommendation + fallback.
4. Flip its Status to ✅ with a link; append a dated line to the Status board.
5. Stop. One item per iteration keeps each unit reviewable and the context small.

If every register + playbook item is ✅, the loop's job becomes **hardening**:
re-read one existing doc, verify its claims still hold (run a benchmark, check a
model release), and note corrections. When there is genuinely nothing left to
improve, the loop reports "wargame complete — nothing pending" and stops
rescheduling.
