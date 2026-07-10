# no-cheat — design census

> W2 Phase A census. Grounded by a read-only agent sweep 2026-07-06; claims
> cite file:line as read that day. CV/ML model itself owned by W1 (D06).

## Purpose

Detect loaded dice from photo/video rolls via statistical analysis
(chi-squared, per-face z-score) of pip counts; tracks named dice sets and
sessions over time (`CLAUDE.md:9-12`).

## Architecture

- Two-tier: React client + tRPC server on server-core. Dev
  `server/src/index.ts:1-22` (port 3001, NullR2); Worker `worker.ts:1-33`
  (R2 if `EVIDENCE_BUCKET` bound). Routers: `health`, `diceSet`, `session`,
  `training` (`routers/index.ts:1-13`). **No `vision` router** — confirms
  the known PLAN.md drift; vision is fully client-side by design.
- CV pipeline client-only under `client/src/lib/cv/` (background/isolate/
  blobDetector/features/knnClassifier/mlPipeline [ONNX+YOLOv8n, dynamic
  import]/trainedPipeline). Client-side IndexedDB training store
  (`store/trainingStore.ts:1-196`, DB `no-cheat-training`).
- Client imports `AppRouter` type via relative path across the app boundary
  (`client/src/lib/trpc.ts:5`).

## Data model

Shared schema `packages/db/src/schema.ts:85-180`. **Owns 5 tables, not the 3
documented**: `dice_sets`, `sessions` (as `diceRollingSessions`), `rolls`,
plus undocumented `training_examples` and `training_frames`.

- **JSON-blob columns:** `rolls.pip_values` (int array as TEXT,
  `session.ts:78`), `training_examples.features` (float vector),
  `training_frames.boxes_json` (bounding boxes).
- Statistical thresholds hardcoded: `Z_THRESHOLD = 2.5`,
  `CHI_SQ_CRITICAL = 11.07` (`lib/stats/analyze.ts:9-10,61`) — tunables with
  no config surface.

## API surface

tRPC only, no crons/queues. `diceSet.create/list/delete` (delete
undocumented). `session.start/addRoll/undoLastRoll/close/list/get/savePhoto/
delete` (delete undocumented). **Entire `training` router undocumented**
(8 procedures incl. YOLO dataset export, `training.ts:16-304`).

## Deploy

- Worker `tabletop-tools-no-cheat`, R2 binding `EVIDENCE_BUCKET` →
  `tabletop-tools-evidence`; no `[limits]`. Secrets not yet provisioned per
  PLAN.md:139.
- Client: `wrangler pages deploy dist` script but **no wrangler dependency,
  no client wrangler.toml, no functions/ proxy** — contradicts PLAN.md:138.
- Rule 9: `training.saveExamples` does up to 20 sequential R2 uploads in one
  call (`training.ts:17-64`) — plausible budget-approacher on R2 latency
  spikes. `session.addRoll/close` re-fetch ALL session rolls and re-run
  `analyze()` from scratch each call (`session.ts:83-86`) — O(n²)/session.

## Shared-package usage

server-core, db, auth (transitive), ui. No cross-app duplication found; CV/
stats are app-specific. Soft flag: cross-boundary relative type import.

## CLAUDE.md / PLAN.md drift

1. Vision router claimed in PLAN Phase 4, absent (removed in Phase 9 as
   architecture violation — internally consistent, doc trail confusing).
2. Client deploy infra claimed done, doesn't exist.
3. `training` router + 2 tables entirely undocumented.
4. `diceSet.delete`/`session.delete` undocumented.
5. **Stale CV architecture docs:** CLAUDE.md:156-161 lists test files for an
   "Exemplar Store" architecture (cluster.ts, templateMatch.ts, pipReader.ts,
   exemplarStore.ts) — **none exist**; actual stack is k-NN + ONNX/YOLO.
6. Test counts stale ("242 tests"): actual 9 server + 30 client test files
   with many files not in either doc's inventory.
7. `packages/db/CLAUDE.md` says 3 tables; actual 5.

## Health signals

- No TODO/FIXME. Ownership checks consistent on `diceSet`/`session`.
- **Over-broad read surface:** `training.list`/`listFrames` return other
  users' examples for a dice set unless `myOnly` passed
  (`training.ts:66-100`) — shared-corpus by design or accident?
- NullR2 silently discards uploads with only console.warn (`r2.ts:35-42`) —
  binding typo in prod → silent evidence loss.
- **Orphaned R2 blobs:** `session.delete` deletes the DB row but never the
  R2 photo (`session.ts:256-274`) — evidence photos orphaned on delete.
- `mlPipeline.ts:36` `any`-typed ONNX session.

## Candidate design decision points

1. **Fixed frequentist thresholds vs sequential-testing-aware model** —
   every addRoll re-tests accumulating data (peeking problem inflates false
   positives); Bayesian or corrected sequential approach?
2. **JSON pip arrays vs per-die rows** — blocks SQL aggregation and
   per-die-position analysis.
3. **Full re-scan per roll vs incremental sufficient statistics** — with
   undo-correctness as the hard part.
4. **Training corpus ownership** — shared-per-dice-set vs strictly per-user;
   currently permissive by default.
5. **Two training stores** — server tables (YOLO export) vs client IndexedDB
   (k-NN, raw pixels): deliberate separation or accidental duplication?
6. **Evidence retention** — orphaned-on-delete photos: by design or cleanup
   gap?
