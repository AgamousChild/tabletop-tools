# CLAUDE.md — no-cheat

> Read the root CLAUDE.md for platform-wide conventions.

---

## What no-cheat Is

no-cheat analyzes photos or video of dice rolls to detect loaded dice using statistical analysis.
It is a single-user tool at its core, tracking named dice sets and sessions per user over time.

no-cheat is the founding app of the Tabletop Tools platform.

**Port:** 3001 (server), Vite dev server proxies `/trpc` -> `:3001`

---

## Architecture: Two-Tier with tRPC

All image processing runs **in the browser**. No image data or pixel data ever leaves
the device. The server only receives pip counts (an array of integers) and computes
statistics. No AI API calls are made anywhere in this app -- clustering and template
matching are pure TypeScript, no WASM, no opencv.js.

```
+------------------------------------------------------+
|  Tier 1: React Client (browser)                      |
|                                                      |
|  +--- CV Pipeline (runs per frame) ----------------+ |
|  |  Pure TypeScript -- no WASM, no opencv.js        | |
|  |  1. LAB absdiff against calibration background  | |
|  |  2. Otsu threshold -> BFS connected-components   | |
|  |  3. Union-find centroid merge -> top face ROI    | |
|  |  4. Per-face: normalize 64x64, dilation         | |
|  |  5a. Cluster match: rotation-invariant template  | |
|  |      matching -> agglomerative clustering        | |
|  |  5b. Fallback: SimpleBlobDetector (d6 only)     | |
|  +--------------------------------------------------+ |
|                                                      |
|  +--- Exemplar Store (IndexedDB) -------------------+ |
|  |  One cluster set per dice set                   | |
|  |  6 face clusters, 1+ exemplar each              | |
|  |  Stabilizes after ~20 natural rolls             | |
|  +--------------------------------------------------+ |
|                                                      |
|  - Login / Auth UI (from packages/ui)                |
|  - Calibration workflow (background + cluster label) |
|  - Live capture screen                               |
|  - Session results display                           |
|  - tRPC client (type-safe)                           |
+------------------------+-----------------------------+
                         | tRPC -- pip counts only
                         | (integers, never pixels)
+------------------------v-----------------------------+
|  Tier 2: tRPC Server (via server-core)               |
|  - Session router                                    |
|  - Statistical engine (Z-score, chi-squared)         |
|  - R2 evidence storage (Workers binding API)         |
|  - SQLite via Turso (edge DB)                        |
+------------------------------------------------------+
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono server factory, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.

---

## Features required to be considered functional

1. ✅ Calibration workflow needs to be clearer in the app. List out the steps on buttons for each step.
   → `CalibrationWizard.tsx`: 4-step wizard (Background → Place Dice → Label Faces → Test Roll) with numbered step indicators.
2. ✅ When the calibration is complete, it should ask for a test roll to show that it can accurately see the dice faces.
   → Step 4 (Test Roll) captures a frame, shows detected dice with bounding boxes and pip values, and asks "Does this look correct?" with Recalibrate/Retest/Start Recording buttons.
3. ✅ It should show squares around each face it captures, with the number of each dice captured in that square in the video, using an overlay.
   → Canvas overlay in recording phase draws emerald bounding boxes with pip labels for each detected die face. CalibrationWizard step 4 also shows bounding boxes.
4. ✅ You should not have to click a button to capture the rolls from that point forward.
   → Hands-free auto-capture in recording phase: continuous requestAnimationFrame loop detects dice, waits for stability (~0.7s), auto-submits, then waits for dice removal before next detection.
5. ✅ The Z score calculation and Chi squared values should show up in the video as an overlay, and the analysis should be in real time, and not a result after clicking complete.
   → `StatsOverlay.tsx` displays real-time Z-score, χ², and verdict (FAIR/SUSPECT/LOADED) below the video feed. `DistributionChart.tsx` shows per-pip distribution with color-coded bars.

## Database Schema

```typescript
// dice_sets
id         TEXT PRIMARY KEY
user_id    TEXT NOT NULL  -- references users.id
name       TEXT NOT NULL
created_at INTEGER NOT NULL

// sessions
id            TEXT PRIMARY KEY
user_id       TEXT NOT NULL
dice_set_id   TEXT NOT NULL     -- references dice_sets.id
opponent_name TEXT
z_score       REAL
is_loaded     INTEGER           -- 1 = loaded, 0 = fair, null = in progress
photo_url     TEXT              -- null unless loaded + user saves evidence (Cloudflare R2)
created_at    INTEGER NOT NULL
closed_at     INTEGER

// rolls
id          TEXT PRIMARY KEY
session_id  TEXT NOT NULL  -- references sessions.id
pip_values  TEXT NOT NULL  -- JSON array: [3,5,2,6,1,4,...]
created_at  INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Dice Sets
diceSet.create(name)
diceSet.list()

// Sessions
session.start({ diceSetId, opponentName? })        -> session
session.addRoll({ sessionId, pipValues })           -> { rollCount, zScore }
session.close({ sessionId })                        -> { zScore, isLoaded, outlierFace, observedRate, rollCount }
session.list({ diceSetId? })                        -> session[]
session.get({ sessionId })                          -> { session, rolls }
session.savePhoto({ sessionId, imageData })         -> { photoUrl }
```

`savePhoto` requires the session to be closed and `isLoaded = true`. Photo is uploaded to
Cloudflare R2 via Workers binding API (not S3 SDK).

---

## Statistical Engine

All analysis runs in `server/src/lib/stats/analyze.ts`. Called on every `addRoll` (running Z-score)
and again on `close` (final verdict).

- **Chi-squared test** -- are face frequencies significantly non-uniform?
- **Z-score on outlier face** -- is the most-biased face rolled significantly more than expected?
- **Verdict** -- `isLoaded: boolean` -- true when Z-score exceeds the loaded threshold

---

## Testing

**236 tests** (59 server + 177 client), all passing.

```
server/src/lib/
  stats/
    analyze.ts / analyze.test.ts         <- statistical engine tests
  storage/
    r2.ts / r2.test.ts                   <- Workers R2 binding API tests
server/src/routers/                      <- router integration tests
server/src/server.test.ts                <- HTTP session integration tests

client/src/lib/
  cv/                                    <- all CV pipeline tests (background, isolate, normalize,
                                            blobDetector, templateMatch, cluster, imageUtils,
                                            pipReader, pipeline)
  store/
    exemplarStore.ts / .test.ts          <- IndexedDB exemplar tests
client/src/components/
  RollEntry.test.tsx                     <- 8 tests: pip buttons, undo, record, disabled states
  ActiveSessionScreen.test.tsx           <- 5 tests: start, calibration, recording, error, dice set name
  CalibrationWizard.test.tsx             <- 10 tests: 4-step wizard flow, recalibrate, camera error, IDB save
  StatsOverlay.test.tsx                  <- 5 tests: verdict display (FAIR/SUSPECT/LOADED), formatting
  DistributionChart.test.tsx             <- 4 tests: pip labels, counts, percentages, empty state
```

```bash
cd apps/no-cheat/server && pnpm test   # 59 server tests
cd apps/no-cheat/client && pnpm test   # 177 client tests
```
