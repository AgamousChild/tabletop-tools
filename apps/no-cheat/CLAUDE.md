# CLAUDE.md — no-cheat

> Read SOUL.md first. Every decision here flows from it.
> Read the root CLAUDE.md for platform-wide conventions (stack, design system, server pattern, TDD rules).

---

## What no-cheat Is

no-cheat analyzes photos or video of dice rolls to detect loaded dice using statistical analysis.
It is a single-user tool at its core, tracking named dice sets and sessions per user over time.

no-cheat is the founding app of the Tabletop Tools platform.

**Port:** 3001 (server), Vite dev server proxies `/trpc` → `:3001`

---

## Current State

| Layer | Status |
|---|---|
| Server scaffold (Hono + tRPC) | ✅ done — 50 tests |
| DB schema (dice_sets, sessions, rolls) | ✅ done |
| Auth (federated via apps/auth-server) | ✅ done — 11 tests |
| Statistical engine (Z-score, chi-sq) | ✅ done — 17 tests |
| Session & roll procedures | ✅ done — 44 tests |
| Evidence photo upload (R2) | ✅ done — 9 tests (r2 + savePhoto); vision/Anthropic API removed |
| Client UI (all screens wired) | ✅ done — 66 tests |
| CV pipeline (pure TS, local) | ✅ done — 83 tests; Camera wired, cluster progress + labeling UI built |
| Clustering engine | ✅ done — agglomerative clustering + template matching + IDB persistence |
| Deployment (Cloudflare Workers + Pages) | ✅ worker.ts + wrangler.toml configured — run `wrangler deploy` + `wrangler pages deploy dist` |

---

## Architecture: Two-Tier with tRPC

All image processing runs **in the browser**. No image data or pixel data ever leaves
the device. The server only receives pip counts (an array of integers) and computes
statistics. No AI API calls are made anywhere in this app — clustering and template
matching are pure TypeScript, no WASM, no opencv.js.

```
┌──────────────────────────────────────────────────────┐
│  Tier 1: React Client (browser)                      │
│                                                      │
│  ┌─── CV Pipeline (runs per frame) ────────────────┐ │
│  │  Pure TypeScript — no WASM, no opencv.js        │ │
│  │  1. LAB absdiff against calibration background  │ │
│  │  2. Otsu threshold → BFS connected-components   │ │
│  │  3. Union-find centroid merge → top face ROI    │ │
│  │  4. Per-face: normalize 64×64, dilation         │ │
│  │  5a. Cluster match: rotation-invariant template │ │
│  │      matching → agglomerative clustering        │ │
│  │  5b. Fallback: SimpleBlobDetector (d6 only)     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── Exemplar Store (IndexedDB) ───────────────────┐ │
│  │  One cluster set per dice set                   │ │
│  │  6 face clusters, 1+ exemplar each              │ │
│  │  Stabilizes after ~20 natural rolls             │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  - Login / Auth UI                                   │
│  - Calibration workflow (background + cluster label) │
│  - Live capture screen                               │
│  - Session results display                           │
│  - tRPC client (type-safe)                           │
└────────────────────────┬─────────────────────────────┘
                         │ tRPC — pip counts only
                         │ (integers, never pixels)
┌────────────────────────▼─────────────────────────────┐
│  Tier 2: tRPC Server                                 │
│  - Session router                                    │
│  - Statistical engine (Z-score, chi-squared)         │
│  - SQLite via Turso (edge DB)                        │
└──────────────────────────────────────────────────────┘
```

---

## Detection Pipeline

### Guiding principles (from Reichler — *Dicer*)

- **No AI for preprocessing.** Every step is classical image operations: color-space
  conversion, absdiff, threshold, morphology, contour detection. Fast, deterministic,
  zero API latency.
- **No supervised labeling required.** Face identification is unsupervised agglomerative
  clustering. The algorithm only needs to know that two images look similar — it does
  not need to know what pip value they represent. Labeling is a single one-time step
  after clusters stabilize.
- **SURF/SIFT explicitly avoided.** Keypoint descriptors are unreliable for this task
  (per Reichler). The similarity metric is rotation-invariant template matching —
  brute-force rotation search minimizing average pixel difference.
- **Scale normalization.** All die face ROIs are normalized to 64×64 before any
  comparison, eliminating scale variance.

### Background calibration (one-time per session setup)

Before the first roll, the user points the camera at the empty surface where dice
will be rolled.

```
Capture background frame
  ↓
  Convert to LAB color space
  ↓
  Store as calibration image (in memory, per session)
  ↓
  [Ready to roll]
```

This background image is subtracted from every live frame to isolate the die.

### Phase 1: Die face isolation

Runs on every captured frame. Pure TypeScript — no opencv.js dependency.

```
Camera frame (ImageData)
  ↓
  Convert to LAB color space
  ↓
  absdiff(frame_LAB, background_LAB) → difference image
  ↓
  Otsu threshold → binary mask
  ↓
  BFS 4-connectivity flood-fill → connected components
  Filter components: minimum area = 100 pixels (noise removal)
  ↓
  Union-find merge: components whose centroids are within 20px are merged
  → bounding box per merged group = one die face ROI
  ↓
  Per die face:
      Extract ROI → resize to 64×64
      Dilation (3×3 kernel, 2 iterations) — normalizes pip appearance
      ↓
      [Go to Phase 2a or 2b]
```

### Phase 2a: Agglomerative clustering with rotation-invariant template matching

The primary recognition path once a dice set has any calibration rolls.

```
64×64 normalized + dilated die face ROI
  ↓
  For each existing cluster exemplar:
      Coarse rotation search: rotate exemplar 0°, 10°, 20°, ..., 350°
          → compute avg grayscale pixel difference vs probe image at each angle
          → record best (minimum) difference angle
      Fine rotation search: search ±15° around best coarse angle in 1° steps
          → find true best angle and best dissimilarity score
  ↓
  Best match = cluster with lowest dissimilarity score
  If best score < merge_threshold:
      → assign probe to that cluster
      → update cluster exemplar (running average or add to exemplar set)
  If best score ≥ merge_threshold:
      → create new cluster with probe as first exemplar
  ↓
  [After cluster count stabilizes at 6: map clusters to pip values]
  → Return pip value (or cluster ID if not yet labeled)
```

**Merge threshold**: tuned during calibration — starts conservative (stricter) and
relaxes slightly as more exemplars accumulate. Typical value: avg pixel diff ≤ 0.15
(15% of max intensity) after normalization.

**Cluster stabilization**: typically after ~20 rolls across a session, all 6 faces
have been seen multiple times and cluster assignments are stable. The app signals when
this point is reached.

### Phase 2b: SimpleBlobDetector fallback (d6 only)

Used before clusters are established, or as a cross-check for d6.

```
64×64 normalized die face ROI
  ↓
  BFS blob detection with filters:
      filterByArea:        minArea=20, maxArea=600
      filterByCircularity: minCircularity=0.5
  ↓
  Count blobs → pip value (1–6)
  If count > 6 → reject as false detection
```

This path is reliable for standard d6 with good contrast. It serves as the initial
pip reader before clustering stabilizes, and as a labeling aid (blob count helps the
user confirm which cluster is which).

### Multiple dice in one frame

```
After isolating N die face ROIs from the scene:
  → Run Phase 2a (or 2b) on each ROI
  → pip_values = [value1, value2, ..., valueN]
  → Display annotated preview: each die face outlined, pip count (or cluster ID) overlaid
  → User confirms or taps to correct any misread face
  → Confirmed pip_values[] sent to server as a single roll record
```

---

## Dice Set Calibration Workflow

There are two phases of setup for a dice set:

1. **Background calibration** — one-time per session, takes 5 seconds
2. **Cluster labeling** — one-time per dice set, takes ~1 minute, happens naturally
   while playing

No labeled training data is collected. No neural network is trained. The user just
plays normally.

### Phase 1: Background calibration (per session, < 5 seconds)

```
"Point camera at the empty area where you'll be rolling. Tap to capture background."
  ↓
  Single frame captured in LAB color space → stored in memory for this session
  ↓
  "Background set — ready to roll"
```

This runs at the start of every session. It takes 5 seconds and happens before the
first roll. It adapts automatically to the current lighting and surface.

### Phase 2: Cluster stabilization (happens automatically while playing)

No user action required. The clustering engine runs on every roll capture:

```
Each captured roll:
  → Pipeline runs (Phase 1 + Phase 2a from Detection Pipeline above)
  → Each die face assigned to a cluster (or new cluster created)
  → Progress shown: "Faces seen: 4 of 6 — keep rolling to unlock full recognition"
  ↓
After ~20 rolls:
  → All 6 face clusters have been seen multiple times
  → Cluster assignments are stable
  → App shows: "Ready to label — I've seen all your die faces"
```

If SimpleBlobDetector can count pips reliably (standard d6 with good contrast), it
runs alongside clustering and proposes a label for each cluster automatically. The
user just confirms.

### Phase 3: Cluster labeling (one time, < 1 minute)

```
App shows each cluster in turn — a grid of captured examples from that cluster.
  ↓
  "What pip value is this face? [image examples]"
     [1]  [2]  [3]  [4]  [5]  [6]
  ↓
  User taps the correct value (or confirms the blob-detector suggestion)
  ↓
  Repeat for all 6 clusters
  ↓
  "Done — your dice are calibrated"
```

After labeling, the app returns pip values directly. Before labeling, it returns
cluster IDs (A–F) and shows the cluster image — the user can still confirm manually.

### Exemplar storage

```typescript
// IndexedDB — keyed by dice_set_id
// One cluster set per dice set
// Updated as new exemplars are added during play

const EXEMPLAR_DB = 'no-cheat-exemplars'
const EXEMPLAR_STORE = 'clusters'

// Key: dice_set_id (TEXT)
// Value: {
//   clusters: Array<{
//     id: string           // internal cluster ID (A–F during setup, then pip value)
//     pipValue: number | null   // null until labeled
//     exemplars: ImageData[]    // 1–N captured 64×64 ROIs
//     updatedAt: number
//   }>
//   calibratedAt: number
// }
```

Exemplars never leave the device. They are not synced to the server. If a user
clears browser storage, they re-label in ~1 minute (clustering rebuilds naturally
as they roll; labeling takes seconds once 6 clusters appear).

**Re-calibration**: if lighting conditions change significantly (different room,
sunlight vs artificial), re-run background calibration. The exemplar clusters
remain valid — only the background reference changes.

---

## Database Schema

```typescript
// dice_sets
id         TEXT PRIMARY KEY
user_id    TEXT NOT NULL  -- references users.id
name       TEXT NOT NULL
created_at INTEGER NOT NULL

// sessions
// One session = one sitting (one opponent, one dice set, many rolls)
id            TEXT PRIMARY KEY
user_id       TEXT NOT NULL     -- references users.id
dice_set_id   TEXT NOT NULL     -- references dice_sets.id
opponent_name TEXT              -- optional: who they were playing against
z_score       REAL              -- computed when session is closed
is_loaded     INTEGER           -- 1 = loaded, 0 = fair, null = in progress
photo_url     TEXT              -- null unless loaded + user saves evidence (Cloudflare R2)
created_at    INTEGER NOT NULL
closed_at     INTEGER           -- null while session is open

// rolls
// Each roll is one photo → pip values captured within a session
id          TEXT PRIMARY KEY
session_id  TEXT NOT NULL  -- references sessions.id
pip_values  TEXT NOT NULL  -- JSON array: [3,5,2,6,1,4,...]
created_at  INTEGER NOT NULL
```

Auth tables (users, sessions, accounts) are shared via `packages/auth` / `packages/db`.

---

## tRPC Routers

Auth is handled by Better Auth HTTP routes (not tRPC). The tRPC routers are:

```typescript
// Dice Sets
diceSet.create(name)
diceSet.list()

// Sessions
session.start({ diceSetId, opponentName? })        → session
session.addRoll({ sessionId, pipValues })           → { rollCount, zScore }
session.close({ sessionId })                        → { zScore, isLoaded, outlierFace, observedRate, rollCount }
session.list({ diceSetId? })                        → session[]
session.get({ sessionId })                          → { session, rolls }
session.savePhoto({ sessionId, imageData })         → { photoUrl }
```

`savePhoto` requires the session to be closed and `isLoaded = true`. `imageData` is a base64 JPEG string. The photo is uploaded to Cloudflare R2 and the URL stored on the session record.

---

## Statistical Engine

All analysis runs in `server/src/lib/stats/analyze.ts`. Called on every `addRoll` (running Z-score)
and again on `close` (final verdict).

**Chi-squared test** — are face frequencies significantly non-uniform?
- Expected: each face ~1/6 of all rolls
- Used internally to identify the outlier face; not separately exposed in the return value

**Z-score on outlier face** — is the most-biased face rolled significantly more than expected?
- Identifies which face is the most skewed, then computes Z-score for that face's frequency
- Returns: `zScore`, `outlierFace` (1–6), `observedRate` (fraction of rolls showing that face)

**Verdict** — `isLoaded: boolean` — true when Z-score exceeds the loaded threshold

**Degree-of-bias framing** — shown alongside the result:
- If fair: "At this bias level, you'd need ~N more rolls before a signal would appear"
- If loaded: "Estimated N% more likely to roll [face] than a fair die"
- Avoids false confidence from small sample sizes

---

## User Flow (Frictionless by Design)

### Every session

```
Login (once)
  → Tap your dice set
  → Start session (opponent name optional)
  → "Calibrate background — point camera at empty surface, tap"
  → Live camera opens (rear-facing, getUserMedia)

  LOOP — repeat for each roll:
    → Lay all dice flat, in frame
    → Tap to capture frame
    → Browser pipeline runs (< 200ms):
        LAB absdiff → BFS isolation → normalize → cluster match → pip value (or cluster ID)
    → Detected pip count shown ("1 die detected — pip value: 4")
    → Confirm result (tap)
    → Confirmed pip_values[] sent to server
    → Running Z-score shown ("Roll 4 of your session")
    → Frame discarded immediately — image never stored or transmitted

    IF FIRST SESSION (< 20 rolls):
      → "Building face recognition — 4 of 6 faces seen so far"
      → Blob detector fills in pip values for standard d6
      → After ~20 rolls: "Ready to label — I've seen all your die faces"
      → Quick labeling step: tap each cluster image → assign pip value
      → Full clustering now active for all future rolls

  CLOSE SESSION:
    → Tap "Done"
    → Final statistics computed: Z-score, chi-squared (internal)

    IF FAIR:
      → "These dice look fair"
      → Shows: "At this roll count, a bias of X% would be detectable"
      → Session saved

    IF LOADED:
      → "These dice are loaded"
      → Shows: observed bias %, estimated N% more likely to roll [face]
      → Prompt: "Save evidence photo?"
          YES → Capture one final frame → upload to Cloudflare R2
          NO  → Session saved without photo
```

No session naming. No manual input required. Sessions are labeled automatically per dice set.
Photos are only ever stored when dice are flagged as loaded AND the user explicitly chooses to save them.
All image processing is local — no pixels leave the device, ever.

### Camera Integration

```javascript
// Rear-facing live stream — works in Safari on iOS 11+, requires HTTPS
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
```

Cloudflare provides HTTPS automatically. No native app required — runs in the browser on iPhone.

---

## UI Notes

### Result Screen

The result must be bold, immediate, and unambiguous:

```
┌─────────────────────────┐
│                         │
│   ● LOADED DICE         │  ← red-400, large
│                         │
│   Z-score: 2.84         │
│   Expected: 16.7%       │
│   Observed: 34.2% (6s)  │
│                         │
│  [ Save Evidence ]      │  ← amber button
│  [ Dismiss ]            │  ← ghost button
│                         │
└─────────────────────────┘
```

Additional result colors:
```
Result FAIR:   emerald-400 (#34d399) — all clear
Result LOADED: red-400    (#f87171)  — caught
```

---

## Open Decisions

- **Hardware path**: Arduino + camera module is a future option, not MVP.

---

## Testing: TDD Required

Tests are written before the code. See root CLAUDE.md for the full TDD workflow.

Tests live next to the code they test:

**Server:**
```
server/src/lib/
  stats/
    analyze.ts             ← all stats: Z-score, chi-squared, verdict, observedRate
    analyze.test.ts        ← 16 tests
  storage/
    r2.ts                  ← Cloudflare R2 upload helper
    r2.test.ts
```

**Client:**
```
client/src/lib/
  cv/
    background.ts          ← LAB calibration capture + absdiff
    background.test.ts     ← synthetic LAB images
    isolate.ts             ← BFS connected-components + union-find merge → ROIs
    isolate.test.ts        ← synthetic binary images with known blob layouts
    normalize.ts           ← resize to 64×64, dilation
    normalize.test.ts
    blobDetector.ts        ← BFS blob detector: area + circularity filter
    blobDetector.test.ts   ← known pip layouts as binary image fixtures
    templateMatch.ts       ← rotation-invariant template matching (coarse + fine)
    templateMatch.test.ts  ← synthetic 64×64 images, verify rotation invariance
    cluster.ts             ← agglomerative clustering engine
    cluster.test.ts        ← verify merge/new-cluster decisions, label assignment
    imageUtils.ts          ← grayscale conversion, LAB helpers
    imageUtils.test.ts
    pipReader.ts           ← compose blob detection → pip count
    pipReader.test.ts
    pipeline.ts            ← compose all stages → RoiResult[]
    pipeline.test.ts       ← end-to-end with synthetic fixtures
  store/
    exemplarStore.ts       ← IndexedDB read/write for cluster exemplars
    exemplarStore.test.ts  ← mocked IndexedDB
```

The statistical engine is fully covered. Z-score and chi-squared tested in `analyze.test.ts`.

The CV pipeline must be tested with synthetic image fixtures (programmatically
generated binary images with circles at known positions). Never use real photos of
dice as test fixtures — they are not reproducible across machines.

The template matching and clustering code must be tested with synthetic 64×64 images
where the correct rotation and similarity scores are known analytically.
