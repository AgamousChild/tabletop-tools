# D06 — no-cheat dice vision (the flagged headline)

> **Decision.** How to read dice-face values on-device, accurately enough to feed
> the loaded-dice statistics, **including custom 40K dice** — using an
> open-source model that trains and runs on the RTX 4060.
>
> **Status:** drafted 2026-07-06. Supersedes the "Blocked by Micah" state of
> `docs/superpowers/plans/2026-04-30-no-cheat-vision.md` with a concrete local
> recommendation.

## Why this one is special

no-cheat is the founding app and the request called it out by name. It is also
the **best local-model fit on the whole platform**, for three reasons:

1. **The privacy contract forbids the easy cloud answer.** `apps/no-cheat/CLAUDE.md`:
   *"All image processing runs in the browser. No image data or pixel data ever
   leaves the device."* The vision plan's Option C (Claude Vision) **breaks that
   contract** and is only admissible as an explicit, per-use opt-in. Local wins by
   default here — it's not a cost optimization, it's a design requirement.
2. **The 4060 both trains and runs the model.** Small object detectors (YOLOv8/11
   n/s) train in tens of minutes on this card and run in real time. See
   [`../01-system-capabilities.md`](../01-system-capabilities.md#training-capability-relevant-to-no-cheat--d06).
3. **The scaffolding already exists.** `client/src/lib/cv/mlPipeline.ts`
   (ONNX Runtime Web + YOLOv8n, 640², 6 classes) and
   `scripts/train-dice-model.py` (Ultralytics YOLOv8n → ONNX) are written. The
   **only** missing piece is a trained `dice-yolov8n.onnx` weights file and the
   data to make it. This decision is about *finishing a started path*, not
   greenfield.

## The coupling that makes accuracy a statistical problem, not a UX one

Read the two halves together:

- **Vision** (`client/src/lib/cv/*`) turns a photo into pip values `[3,5,2,…]`.
- **Stats** (`server/src/lib/stats/analyze.ts`) turns many pip values into a
  verdict: chi-squared (df 5, crit 11.07 @ p 0.05) **or** any per-face
  `|z| ≥ 2.5` ⇒ `isLoaded = true`.

The subtle, load-bearing point: **the stats can't tell a loaded die from a biased
reader.** If the vision *systematically* misreads (say 6→5 in 8 % of frames), it
manufactures a non-uniform distribution and the chi²/Z test will flag a **fair**
die as **loaded** — a false accusation, the worst possible failure for this app.

Therefore the acceptance bar is not "high accuracy" in the abstract; it is:

- **(a) High per-face accuracy** (≈99 %+), *and*
- **(b) Unbiased errors** — whatever misreads remain must be roughly symmetric
  across faces, so they don't skew the distribution. A model that is 99 %
  accurate but always fails toward the same face is *worse* than one that is 98 %
  accurate with random errors.

Every option below is judged against **both** (a) and (b). This is the insight
the original plan (which just said "100 % accuracy") missed.

## Scoring weights for this decision

Privacy and Quality dominate; latency matters (near-real-time capture) but a
half-second is fine; training effort is a one-time cost.

`Privacy ×3 · Quality(a+b) ×3 · Latency ×2 · Effort ×1 · Stack ×1 · Risk ×2`

## Options

### Option 0 — Classic CV only (status quo, no model)

Pure-TS pipeline: LAB absdiff vs. calibrated background → Otsu → connected
components → rotation-invariant template match / agglomerative clustering, with a
SimpleBlobDetector fallback for d6 (`client/src/lib/cv/pipeline.ts`).

- **Plays out:** fully local, fast, zero deps, already shipping. But the vision
  plan itself says it *"does NOT read individual die faces reliably,"* needs
  per-set calibration, and has no answer for custom faces (skull, faction icon).
  Reliability failures here are exactly the biased-error risk above.
- **Scores:** Privacy 5 · Quality 2 · Latency 5 · Effort 5 · Stack 5 · Risk 3.
- **Verdict:** keep as the **bootstrap labeler and the no-GPU fallback**, not as
  the accuracy answer.

### Option A — YOLOv8n/YOLO11n trained locally, run in-browser via ONNX

The scaffolded path. Train on the 4060 with Ultralytics; export ONNX; run
client-side with ONNX Runtime Web. One pass detects each die **and** classifies
its pip value.

- **Plays out — training:** `train-dice-model.py` already does YOLOv8n, 100
  epochs, 640², batch 16, early-stop patience 20 → ONNX opset 12 → copies to
  `client/public/models/dice-yolov8n.onnx`. On the 4060 this is minutes, not
  hours. **YOLO11n** is a drop-in upgrade (same API, better accuracy/latency) —
  change one string, `YOLO("yolo11n.pt")`.
- **Plays out — data (the clever part):** the trainer's docstring says the
  dataset is exported *"from the no-cheat app's Training History → Frames tab."*
  So the **classic CV pipeline is the weak labeler**: it captures frames + pip
  labels during normal calibrated use, which export as a YOLO dataset. This is
  self-supervised bootstrapping — the student (YOLO) generalizes past the
  teacher's (CV) brittleness, then you correct the few it gets wrong. No manual
  labeling farm.
- **Plays out — seed data (Micah-provided, 2026-07-06):**
  [nell-byler/dice_detection](https://github.com/nell-byler/dice_detection) +
  its Kaggle dataset [`nellbyler/d6-dice`](https://www.kaggle.com/datasets/nellbyler/d6-dice)
  — **250 labeled images of rolled d6** (bounding boxes + face-value classes
  1–6), labels **originally authored in YOLO format** (the repo converted them
  *to* TFRecord — we use them as-is), **BSD-3-Clause** (verified from the repo
  page). Two things it buys us:
  1. **A warm start:** merge into `dataset/{images,labels}/train` next to in-app
     captures so the first training run starts from real variety, not zero.
  2. **An existence proof:** the repo fine-tuned SSD MobileNet v1 (TF 1.14) on
     just those 250 images and got usable real-time mobile detection, deployed
     via TFLite on Android — the same shape as our ONNX-in-browser plan, on a
     weaker 2019 architecture. YOLO11n on the same data will do better.
  We take the **data and the evidence**, not the TF 1.14 stack. Caveat: 250
  images is a warm start, not the ≥99 % bar — per-set captures are still
  required, especially for custom dice, and the acceptance gate below still
  decides.
- **Plays out — inference/privacy:** runs in the browser → **pixels never leave
  the device**, honoring the contract at T2 (on-device). Current code uses
  `executionProviders: ['wasm']` (CPU, ~single-thread). **Upgrade:** ONNX Runtime
  Web has a **WebGPU** EP — `['webgpu','wasm']` runs YOLO on Micah's 4060 *through
  the browser*, staying on-device AND getting real-time speed. WASM stays as the
  fallback for machines without WebGPU.
- **Plays out — custom dice:** a model trained only on pip-dice won't read
  skull=6. Two clean handles: **(1)** per-dice-set capture → light fine-tune from
  the same in-app flow (the set's owner trains it once); **(2)** keep the model
  reading *"which face is up"* generically and apply the plan's configurable
  **symbol→value map** per dice set in post-processing before stats. Both stay
  local.
- **Scores:** Privacy 5 · Quality 4 (a: high once trained; b: detectors fail
  *randomly*, not toward one class — good for the stats) · Latency 4 (WebGPU) /3
  (WASM) · Effort 3 (need data + one training run) · Stack 5 (ONNX already wired)
  · Risk 3 (custom-dice generalization).
- **Verdict:** **primary.** It finishes an existing path, honors privacy, trains
  on-box, and its error profile suits the statistics.

### Option B — Small local VLM (moondream2 / Florence-2 / Qwen2-VL-2B / MiniCPM-V)

A vision-language model reads faces *zero-shot* — prompt: *"How many pips on each
die? For custom dice, a skull = 6."* Handles arbitrary/custom faces with **no
training data**.

- **Plays out:** solves the custom-dice problem head-on and needs no dataset.
  moondream2 (~1.8B) and Florence-2 (~0.23–0.77B) are small enough to run on the
  4060 (and Florence-2/moondream have web/ONNX ports — potentially in-browser via
  WebGPU). Qwen2-VL-2B/MiniCPM-V are stronger but heavier (a local **service** on
  Micah's box, T2, not client-side).
- **Risk to (b):** VLMs can be *confidently wrong* and their errors may be
  **biased** (systematically miscount 6s as 5s under glare) — precisely the
  failure that corrupts the chi²/Z verdict. Must be validated for error symmetry,
  not just accuracy. Also slower per frame than a nano detector.
- **Scores:** Privacy 4 (in-browser 5 / local-service 4) · Quality 3 (a: decent
  zero-shot; b: **unproven, possibly biased**) · Latency 2 · Effort 4 (no
  training, but heavier runtime) · Stack 3 · Risk 3.
- **Verdict:** **fallback / opt-in tier** for custom-dice-heavy users who won't
  train, and as the zero-shot bootstrap to *generate labels* for Option A. Not the
  default because of latency and the bias risk to the statistics.

### Option C — Cloud Claude Vision (the plan's Option C)

- **Plays out:** highest zero-shot accuracy, any dice, no training — but **sends
  pixels to a cloud API**, breaking the core privacy contract, adding latency,
  cost, and an internet dependency.
- **Scores:** Privacy 1 · Quality 5 · Latency 2 · Effort 5 · Stack 2 · Risk 2.
- **Verdict:** **explicit opt-in only**, behind a clear disclosure toggle
  (the plan already anticipates the disclosure). Never the default. Useful as a
  one-time **ground-truth labeler** to bootstrap/validate Option A's dataset.

## Wargame (head-to-head)

- **0 vs A:** A is strictly better on the acceptance bar; 0 is the labeler/
  fallback, not the product. Keep 0 wired as the WASM/no-GPU path so the app
  degrades gracefully.
- **A vs B on custom dice:** B wins zero-shot, but A + per-set fine-tune or A +
  symbol-map wins on *speed and error profile* while staying client-side. The
  synthesis is to **use B to label, A to serve.**
- **A vs B on the statistics integrity (axis b):** detectors (A) fail randomly →
  friendlier to chi²/Z; VLMs (B) can fail *systematically* → dangerous to chi²/Z.
  This tilts the default to A even where B is "smarter."
- **Any local vs C:** the privacy contract settles it — C is opt-in, never
  default. Its legitimate role is offline label generation.

## Recommendation

**Primary: Option A** — train **YOLO11n** (fall back to the already-scripted
YOLOv8n) locally on the 4060, run **in-browser via ONNX Runtime Web with the
WebGPU EP (WASM fallback)**. Bootstrap the dataset from the existing in-app
capture flow (classic CV as weak labeler), optionally seeded/validated by a
one-time VLM or Claude-Vision labeling pass. Handle custom dice by **per-set
capture-and-fine-tune** and/or a **configurable symbol→value map** applied before
the stats.

**Fallback / opt-in tiers:**
- **Option B (small local VLM)** for users who want zero-training custom-dice
  reading, run on Micah's box (T2) or in-browser (Florence-2/moondream via
  WebGPU) — *after* validating error symmetry.
- **Option C (Claude Vision)** strictly opt-in with disclosure, and as an offline
  ground-truth labeler.

**Flip trigger:** if, after a real training run, Option A can't clear **≥99 %
per-face accuracy with symmetric errors** on held-out frames of a given dice set,
escalate that set to B (or C-labeled retraining) rather than shipping a biased
reader into the statistics.

## Implementation notes (concrete, this repo)

1. **Model + inference** — `client/src/lib/cv/mlPipeline.ts`:
   - Change `executionProviders: ['wasm']` → `['webgpu','wasm']` to use the 4060
     through the browser; keep the dynamic `import('onnxruntime-web')` so bundles
     without the model stay lean.
   - `NUM_CLASSES = 6` is pip-only; for custom faces either keep 6 classes +
     symbol-map post-process, or widen classes per trained set.
2. **Training** — `scripts/train-dice-model.py`:
   - Optionally bump to `YOLO("yolo11n.pt")`; keep `imgsz=640`, `batch=16`,
     `epochs=100`, `patience=20`. Export stays ONNX opset 12, simplified, copied
     to `client/public/models/dice-yolov8n.onnx` (rename target if YOLO11).
   - Add a held-out **validation split** and a **per-face confusion matrix** check
     so acceptance criterion (b) — error symmetry — is measured, not assumed.
3. **Data flow (already designed):** app **Training History → Frames** export →
   `dataset/{images,labels}/train` + `data.yaml` → `train-dice-model.py` →
   `best.onnx` → `client/public/models/…onnx` → auto-loaded on refresh.
   **Seed the dataset** with Kaggle `nellbyler/d6-dice` (250 imgs, YOLO labels,
   BSD-3) merged alongside the in-app exports; keep the two sources in separate
   subfolders so per-set fine-tunes can exclude the generic seed later.
4. **Rule-4 compliance:** wrap the trainer as an importable function
   (`train(datasetDir, opts)`) callable from CLI/cron, not just a `__main__`
   script, so a future "retrain this dice set" button can invoke it.
5. **Data boundary:** dice *photos and models are the user's*, not GW content —
   no committed weights, no GW artwork. The symbol→value map is user-configured
   per set, stored with their dice set, never shipped in source.
6. **Validation against the stats:** before trusting a newly trained model, run a
   **known-fair** dice set through it for ≥60 rolls (the HIGH_THRESHOLD in
   `analyze.ts`) and confirm the verdict is FAIR — i.e. the reader itself isn't
   injecting bias. Ship the model only if it passes this self-test.

## Open follow-ups (for a per-app playbook pass)

- WebGPU EP availability/perf on this exact driver (591.86) — verify with a bench.
- Whether to unify the "capture → label → train → deploy" loop into one in-app
  action (Rule 4), turning no-cheat into a self-improving on-device detector.
- Multi-die-type support (d6 vs d3 vs scatter) as separate trained sets vs. one
  multi-class model.
