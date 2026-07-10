# D09 — Local-lane operations: VRAM contention, model lifecycle, scheduling

> **Decision.** The operational policy that keeps the local lane *boring*:
> how jobs detect usable VRAM (the Quest-link problem), how models load/unload,
> how batch work is scheduled on a machine that is also Micah's gaming/VR PC,
> and what gets monitored.
>
> **Status:** drafted 2026-07-06 (loop iteration 4). Hardware facts from
> [`../01-system-capabilities.md`](../01-system-capabilities.md) (measured);
> daemon behaviors reference D01; tiers reference D02/D03.

## Forces

- **The box is not a server.** It plays games, drives a Quest (which holds
  ~5 GB VRAM when linked — *measured*, not hypothetical: at this wargame's
  first probe only 3 009 MiB of 8 188 MiB was free; **the second probe, hours
  later, found 2 955 MiB free — two for two contended**), sleeps, and reboots
  for Windows Update. Every ops choice must assume contention and interruption
  as normal, not exceptional — hardening pass 1 upgrades this from "assume"
  to "measured twice": **the degraded state is the common state**; Tier III
  is the realistic interactive default until link-off is confirmed.
- Batch jobs (T1) are the load-bearing lane (D07) — they must complete
  **unattended and resumable**, or Micah becomes the scheduler.
- Root Rule 4: every operational behavior below ships as an importable
  function, wrapped for CLI/cron — not as lore in a doc. Root Rule 9's
  spirit: chunk by design; a batch pipeline is resumable *because* it is
  chunked with persisted progress.

## The decisions

### 1. The VRAM guard (the Quest-link answer)

One shared function, called by **every** batch entry point before model load:

```
checkVramBudget(): { freeMiB, tier: 'I' | 'III' | 'refuse', reason }
  → runs: nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits
  → ≥ 6000 MiB free → Tier I/II proceed
  → 2500–6000 MiB   → Tier III only (qwen3:4b) — jobs declaring minTier: 'I' REFUSE with reason
  → < 2500 MiB      → refuse all; report "close Quest Link / free VRAM"
```

- **Refuse loudly beats degrade silently.** A Tier-II extraction run that
  silently lands on CPU crawls at ~8 tok/s and looks "hung" — the guard turns
  that into an immediate, explained refusal (or an explicit Tier III downshift
  for surfaces that declared it acceptable).
- Jobs declare `minTier` in their config; the guard enforces it. The mapping
  from free-MiB to tier comes from D03's budget table — one table, in code,
  imported (Rule 6).
- Re-check between chunks on long runs: the Quest can come *online mid-run*.
  On budget loss: checkpoint and pause (see §3), don't OOM.

### 2. Model lifecycle (daemon policy)

- **Residency:** `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1` (D01) —
  the D03 math leaves no honest room for two resident LLMs. Embeddings run
  ONNX-on-CPU (D04) precisely so they never join this fight.
- **keep_alive:** batch runners pass `keep_alive: "30m"` (survive
  between-chunk gaps without reload); interactive dev sessions may pin with
  `-1`; nothing pins by default so the GPU frees itself for games within
  minutes of idle.
- **Warm-load:** batch runners issue one empty-prompt call before the loop
  (load cost paid once, measured, logged — not smeared into chunk-1 latency).
- **Disk & updates:** pinned tags only (D03); the full set (4B+8B+14B Q4 +
  rollback 8B) ≈ **~21 GB** — trivial. Upgrades are deliberate: new tag →
  D02 eval → config flip; never `ollama pull` a moving alias mid-pipeline.

### 3. Batch scheduling & resumability

- **Chunked with persisted progress** (Rule 9 by design): every pipeline
  records per-chunk completion (the ingestor's chunk loop + the D08 review
  queue give the natural unit). A killed run resumes by skipping completed
  chunks — reboot-and-Windows-Update-proof.
- **Windows Task Scheduler** owns recurring windows (e.g. overnight Tier II
  runs: wake-capable trigger, `pwsh -File run-batch.ps1 -Job …`), because it
  survives logouts and reboots; in-session crons are for interactive
  babysitting only.
- **Power:** scheduled tasks set "wake to run" + prevent-sleep during the run
  (`SetThreadExecutionState` via the runner or `powercfg` request); the run
  releases the block on completion so the box sleeps again.
- **Priority:** batch inference at `BelowNormal` CPU priority — the 20-core
  14700F barely notices, but if Micah starts a game mid-run, the game wins.

### 4. Monitoring (minimum that makes failures visible)

Per run, one JSON line per chunk to a run log (a table or `.local/runs/*.jsonl`):
`{ts, job, model, chunk, tokens_in/out, ms, vram_free_before, parse_status}`.

- `parse_status` comes free from D08's metrics; `vram_free_before` catches
  creeping contention; `ms`/tokens catch the silent-CPU-fallback case (tok/s
  collapse is unmistakable in the log).
- A tiny `runs summary` CLI prints failure counts + tok/s per job — the
  admin app can grow a page for it later (it already reads platform tables);
  don't build UI until the CLI hurts.

### 5. Failure playbook (the four that will actually happen)

| Failure | Detection | Response |
|---|---|---|
| Quest link holding VRAM | guard pre-check / between-chunks | refuse or Tier III downshift, message names the fix |
| OOM mid-generation (ctx creep) | llama.cpp error | halve `num_ctx` for the chunk, log, continue; recurring → D03 review |
| Silent CPU fallback (model didn't fit) | tok/s collapse in run log | abort run, guard thresholds were wrong → fix table, don't ride it out |
| Reboot/update mid-run | resumability (§3) | next scheduled window resumes; no human needed |

## Wargame (alternatives considered and rejected)

- **"Dedicate the GPU / always-on daemon with pinned model"** — turns Micah's
  PC into a server he has to *feel* (VR sessions fight the pin). Rejected:
  the guard + keep_alive gives 95 % of the benefit with zero lifestyle tax.
- **"Dockerize the local lane"** — Docker-on-Windows adds a VM layer between
  Ollama and the GPU for no gain here; native Windows Ollama + Task Scheduler
  is fewer layers (root rule: keep the stack shallow). The container story
  belongs to T5/GCP (D10) where it pays rent.
- **"Auto-close the Quest link"** — killing a VR session from a batch job is
  hostile automation. The guard *reports*; Micah decides. (A future
  `--if-idle` window check could skip runs while VR is active — noted, not
  needed yet.)
- **"WSL2 for the tooling"** — the pipelines are TypeScript/Node + nvidia-smi;
  Windows-native runs them fine; WSL2 adds a GPU-passthrough variable with no
  offsetting benefit for this lane.

## Recommendation

Ship four small pieces, all importable functions first (Rule 4):
**(1)** `checkVramBudget()` guard with the D03 tier table; **(2)** the batch
runner wrapper (warm-load, keep_alive, chunk checkpointing, priority, run
log); **(3)** Task Scheduler definitions for the overnight Tier II window;
**(4)** the `runs summary` CLI. Everything else above is configuration of
those four.

**Flip triggers:** batch volume outgrows overnight windows → that's the D10/T5
signal (rent an L4, not a lifestyle change); a second GPU ever lands in the
box → revisit `MAX_LOADED_MODELS` and co-residency; run-log shows guard
thresholds mis-set (fallback events) → adjust the D03 table, which the guard
imports.

## Follow-ups

- Implement in a shared package alongside the D01 provider (`packages/`),
  since every app's batch entry point consumes the same four pieces.
- The physics/study build scripts (D11 surfaces) adopt the same runner even
  though they're CPU-bound — uniform logs beat special cases.
