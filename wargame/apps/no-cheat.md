# Playbook — no-cheat: local dice vision, end to end

> **Deliverable.** The concrete implementation path from today's code to a
> working local dice-vision detector on Micah's hardware — dataset → training →
> browser inference → acceptance → custom dice. Model decision and full option
> analysis live in [`../decisions/D06-nocheat-vision.md`](../decisions/D06-nocheat-vision.md);
> this playbook is the *how*.
>
> **Status:** drafted 2026-07-06 (loop iteration 6). Grounded: `apps/no-cheat/`
> CLAUDE.md, PLAN.md, `client/src/lib/cv/mlPipeline.ts`,
> `scripts/train-dice-model.py`, `server/src/lib/stats/analyze.ts` (all read
> this session).

## Current state (grounded, with one drift find)

| Piece | State | Evidence |
|---|---|---|
| Stats engine (chi² + per-face Z, verdict) | ✅ shipping | `server/src/lib/stats/analyze.ts` (17+ tests) |
| Classic CV pipeline (calibrate/threshold/cluster) | ✅ shipping, known-unreliable on faces | `client/src/lib/cv/pipeline.ts`; vision plan admits unreliability |
| ML inference scaffold (ONNX Runtime Web, YOLOv8 parse, NMS) | ✅ written, **inert** | `mlPipeline.ts` — `load()` throws: `/models/dice-yolov8n.onnx` absent |
| Trainer script (Ultralytics → ONNX → copy to client) | ✅ written, never run to completion | `scripts/train-dice-model.py` |
| In-app dataset export (Training History → Frames) | ✅ per trainer docstring | docstring + TrainingHistory/TrainingScreen components |
| Seed dataset | ✅ **provided by Micah** | Kaggle `nellbyler/d6-dice` — 250 imgs, YOLO labels, BSD-3 (D06) |
| Server `vision` router | ❌ **does not exist** | grep `vision` over `server/src` = 0 hits; **PLAN.md Phase 4 claims it wired — drift.** Vision is fully client-side (correct per privacy contract). |

**The missing piece is exactly one artifact:** a trained `.onnx` file, plus the
data to produce it. Everything else is wired.

## Target architecture (decided in D06 — recap in one diagram)

```
camera frame (browser)
  → ONNX Runtime Web session  [EP: webgpu → wasm fallback]
      model: dice-yolo11n.onnx (self-trained, 640², 6 classes = pips 1–6)
  → NMS → RoiResult[{roi, pipCount}]                    (mlPipeline.ts, exists)
  → [per-dice-set symbol→value map, if custom dice]      (new, client-side)
  → pip values → tRPC session.addRoll                    (exists)
  → chi²/Z verdict                                       (analyze.ts, exists)
Fallback ladder: WebGPU → WASM → classic CV pipeline (existing) — never a dead app.
```

Pixels never leave the browser at any rung (T2 on-device, D07).

## Implementation plan

### Phase A — Assemble the dataset (~1 hour, no GPU)

1. Download Kaggle `nellbyler/d6-dice` → `apps/no-cheat/scripts/dataset/`
   under `seed/` subfolder (keep seed separable per D06, so per-set fine-tunes
   can exclude it):
   ```
   dataset/
     images/train/  ← seed/*.png + app-export/*.png
     labels/train/  ← matching YOLO .txt (class = pip−1, cx cy w h normalized)
     data.yaml      ← names: ['1','2','3','4','5','6']
   ```
2. Export Micah's own frames from the app (Training History → Frames tab) —
   even 50–100 frames of *his actual dice on his actual mat* materially
   grounds the domain (lighting, felt color, dice style).
3. **Add a val split** (trainer currently trains on everything — gap):
   move ~15 % of images to `images/val` + `labels/val`, add `val:` to
   `data.yaml`. Without this, Phase D's acceptance gate has no honest data.

### Phase B — Train on the 4060 (~30–90 min wall clock)

1. Env (once): **system Python is 3.14.3 (verified 2026-07-06) — torch/
   ultralytics wheels typically lag the newest Python; create a pinned
   3.11/3.12 venv** (`py -3.12 -m venv` or `uv venv --python 3.12`) and
   `pip install ultralytics` there (pulls torch-cuda; verify
   `torch.cuda.is_available()` — if false, install the CUDA wheel explicitly).
2. Two edits to `train-dice-model.py` (keep both cheap, per D06):
   - `YOLO("yolov8n.pt")` → `YOLO("yolo11n.pt")` (drop-in, better n-class);
     keep the v8 string as a comment fallback.
   - After training, print/save the **per-class confusion matrix** (Ultralytics
     `model.val()` artifacts) — this is acceptance criterion (b), error
     *symmetry*, and must be looked at, not assumed.
3. Run it. Existing settings are right for this card (640², batch 16, 100
   epochs, patience 20 — the 8 GB math in `01` clears this with room).
   D09's VRAM guard applies: check `nvidia-smi` free ≥ 6 GB (close Quest Link).
4. Script already exports ONNX opset 12 + copies to
   `client/public/models/dice-yolov8n.onnx`. If YOLO11 is used, keep the
   **same target filename** for now — `mlPipeline.ts:22` hardcodes it; rename
   both together later (cosmetic).

### Phase C — Browser integration (~1 hour)

1. `mlPipeline.ts:48` — `executionProviders: ['wasm']` →
   `['webgpu', 'wasm']`. One line; ORT falls through automatically when
   WebGPU is unavailable. *(Verify: WebGPU EP with driver 591.86 in Chrome —
   run one inference and check `session.executionProvider` / console; if
   webgpu init fails it silently lands on wasm, which still works, just
   slower.)*
2. Confirm the auto-load path: model file present → `createMlPipeline().load()`
   succeeds → detection flows through the same `RoiResult` shape the classic
   pipeline emits (already designed for seamless swap — `mlPipeline.ts:7–9`).
3. Keep the classic CV pipeline as the explicit fallback rung when `load()`
   throws (model missing/corrupt) — that behavior exists; just don't remove it.

### Phase D — Acceptance gates (the part that protects the statistics)

Run **before** trusting the model in real sessions (rationale in D06 — a
*biased* reader manufactures false "loaded" verdicts):

1. **Gate 1 — held-out accuracy:** per-face accuracy ≥ 99 % on the val split.
2. **Gate 2 — error symmetry:** confusion-matrix off-diagonals roughly
   uniform; no face systematically absorbing another's errors. (A 98 %
   symmetric model *passes* where a 99 % biased one *fails* — write that in
   the run log.)
3. **Gate 3 — known-fair self-test:** ≥ 60 rolls (analyze.ts HIGH_THRESHOLD)
   of a presumed-fair die through the *full* pipeline (camera → model →
   `analyze()`); verdict must be FAIR. This catches capture-loop biases the
   confusion matrix can't (motion blur on certain faces, mat glare).
4. Log all three into the training run folder; a model that fails any gate
   does not ship — retrain with more of Micah's frames or escalate per D06's
   flip trigger (VLM/Claude-labeled rounds).

### Phase E — Custom 40K dice (after the pip model works)

1. **Symbol→value map** per dice set (skull=6 etc.): a small config on the
   dice-set record (client store; server schema untouched — values arriving at
   the server are already plain pips). Applied between detection and
   `addRoll`.
2. **Per-set fine-tune** for non-pip faces: in-app capture (~100 frames of the
   set) → export → fine-tune *from the pip model's weights* excluding `seed/`
   → per-set ONNX stored via the existing exemplar-store pattern (IndexedDB) or
   as a named model file. Same Phase D gates apply per set.
3. Wrap the trainer as `train(datasetDir, opts)` importable + CLI (Rule 4) so
   a future "retrain this set" button is a call, not a ritual.

## Verification checklist (Rule 0 — proof per phase)

- [ ] A: `data.yaml` + counts printed; val split exists; seed/app-export separated.
- [ ] B: training run completes on GPU (`nvidia-smi` during epoch 1 shows the process); confusion matrix artifact saved.
- [ ] C: browser console shows WebGPU EP active (or documented wasm fallback); live overlay draws boxes+pips.
- [ ] D: three gates logged with numbers; FAIR verdict screenshot on the known-fair set.
- [ ] E: custom set round-trips symbol map → correct pip stream into stats.

## Risks / open items

- WebGPU EP behavior on this exact driver — measured in Phase C, wasm is the net.
- Multi-dice-type support (d3/scatter) — out of scope until pip-d6 ships (stop when it works).
- PLAN.md drift (vision router) and the model filename (`yolov8n` naming after a YOLO11 swap) — fix in the same PR as Phase C.
