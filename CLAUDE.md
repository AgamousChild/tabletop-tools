# CLAUDE.md — NoCheat

> Read SOUL.md first. Every decision here flows from it.

---

## What This Project Is

NoCheat analyzes photos or video of dice rolls to detect loaded dice using statistical analysis. It is a single-user tool at its core, tracking named dice sets and sessions per user over time.

---

## Platform: Tabletop Tools

NoCheat is the first app in the **Tabletop Tools** platform — a monorepo of tools for tabletop gamers. One login. Shared UI. Each tool deploys independently.

```
tabletop-tools/
  packages/
    ui/             ← shared components, dark theme, Geist, shadcn
    auth/           ← shared Better Auth — one login across all tools
    db/             ← shared Turso schema and Drizzle client
    game-content/   ← GameContentAdapter boundary (zero GW content)
  apps/
    no-cheat/       ← dice cheat detection (this project)
    ...             ← future tools
```

---

## Architecture: Two-Tier with tRPC

All image processing and model inference runs **in the browser**. No image data or
pixel data ever leaves the device. The server only receives pip counts (an array of
integers) and computes statistics. No AI API calls are made anywhere in this app.

```
┌──────────────────────────────────────────────────────┐
│  Tier 1: React Client (browser)                      │
│                                                      │
│  ┌─── CV Pipeline (runs per frame) ────────────────┐ │
│  │  opencv.js (WASM)                               │ │
│  │  1. Grayscale + adaptive threshold              │ │
│  │  2. Contour detection → isolate die faces       │ │
│  │  3. Per-face: normalize to 64×64, center-crop   │ │
│  │  4a. Classify: local TF.js model (if trained)   │ │
│  │  4b. Fallback: SimpleBlobDetector (untrained)   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── Model Store (IndexedDB) ──────────────────────┐ │
│  │  One trained model per dice set                 │ │
│  │  MobileNetV3-Small, fine-tuned in browser       │ │
│  │  ~30-60 labeled images, ~20 epochs, < 2 min     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  - Login / Auth UI                                   │
│  - Training workflow (capture + label + train)       │
│  - Live capture screen                               │
│  - Session results display                           │
│  - tRPC client (type-safe)                           │
└────────────────────────┬─────────────────────────────┘
                         │ tRPC — pip counts only
                         │ (integers, never pixels)
┌────────────────────────▼─────────────────────────────┐
│  Tier 2: tRPC Server                                 │
│  - Auth router                                       │
│  - Session router                                    │
│  - Statistical engine (Z-score, chi-squared)         │
│  - SQLite via Turso (edge DB)                        │
└──────────────────────────────────────────────────────┘
```

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Throughout — front to back, no exceptions |
| Runtime | Node.js | Stable, full ecosystem compatibility |
| Package Manager | pnpm | Fast, strict, disk-efficient — no hoisting surprises |
| Bundler | Vite | Best DX for React, fast HMR, esbuild under the hood |
| Test Runner | Vitest | Pairs naturally with Vite, same config, fast |
| API | tRPC + Zod | Type-safe end-to-end, no REST boilerplate |
| UI | React | Clean, uncluttered, easy to use |
| Database | Turso (libSQL/SQLite) | Edge-compatible, lean, no heavy ORM |
| ORM | Drizzle | Lightweight, type-safe, SQLite-native |
| Auth | Better Auth | TypeScript-first, self-hosted |
| Deploy | Cloudflare Workers + Pages | Free tier covers personal use — near-zero cost |
| Statistics | simple-statistics | Z-score, chi-squared, mean, std deviation |
| CV preprocessing | opencv.js (WASM) | Classical CV in browser — grayscale, threshold, contours, blob detection |
| ML training | @tensorflow/tfjs | Local in-browser training only — no API calls, models stored in IndexedDB |
| ML runtime | @tensorflow/tfjs | Local inference from trained model — MobileNetV3-Small, fine-tuned on user's dice |

---

## Detection Pipeline

### Guiding principles (from Dicer / OpenCV dice fairness research)

- **Preprocessing does not use AI** — only classical image operations (threshold,
  morphology, contour detection). This is fast, deterministic, and works offline
  with zero latency from inference APIs.
- **Center-weighted feature scoring** — when normalizing a die face ROI, the
  center region is more reliable than edges (which show rounded corners, shadows,
  and adjacent die). Crop to ~80% of the face bounds before classification.
- **Contour filtering** — before pip classification, remove contours on the die
  face that are not candidate pips (too large, too elongated, touching the edge).
  This makes the classifier robust to rotation and lighting variance.
- **Scale normalization** — all die faces are resized to the same pixel dimensions
  (64×64) before classification, eliminating scale as a variable.

### Phase 1: Classical CV preprocessing (opencv.js)

Runs on every captured frame. No model required. Used both as the standalone
fallback and as the first stage feeding the trained classifier.

```
Camera frame (ImageData)
  ↓
  Grayscale
  ↓
  Gaussian blur (5×5 kernel) — reduce noise
  ↓
  Adaptive threshold (block size 11, C=2) — handles uneven lighting
  ↓
  Morphological close (3×3 kernel) — fill pip holes
  ↓
  findContours → filter by:
      area range (min die face area, max scene area)
      aspect ratio 0.7–1.3 (roughly square → die face)
  ↓
  Per detected die face:
      Extract ROI → center-crop to 80% → resize to 64×64
      ↓
      [Go to Phase 2 or fallback]
```

### Phase 2a: Trained classifier (preferred)

Runs when a model has been trained for this dice set (stored in IndexedDB).

```
64×64 normalized die face ROI
  ↓
  MobileNetV3-Small (fine-tuned with TF.js on user's own dice photos)
      — pre-trained ImageNet backbone, last 2 layers replaced + fine-tuned
      — 6-class output: pip values 1–6
      — ~500 KB quantized model stored in IndexedDB per dice set
  ↓
  Confidence > 0.85 → accept pip count
  Confidence ≤ 0.85 → flag as uncertain, show manual override prompt
```

### Phase 2b: Classical fallback (SimpleBlobDetector)

Used when no model is trained yet, or when Phase 2a is uncertain.

```
64×64 normalized die face ROI
  ↓
  SimpleBlobDetector with:
      filterByArea:       minArea=20, maxArea=600
      filterByCircularity: minCircularity=0.5
      filterByInertia:    minInertiaRatio=0.4
      threshold range:    10–200 (stepped by 10)
  ↓
  Count keypoints → pip value (1–6)
  If count > 6 → reject as false detection
```

### Multiple dice in one frame

```
After isolating N die face ROIs from the scene:
  → Run Phase 2a/2b on each
  → pip_values = [value1, value2, ..., valueN]
  → Display annotated preview: each die face outlined, pip count overlaid
  → User confirms or taps to correct any misread face
  → Confirmed array sent to server as a single roll record
```

---

## Model Training Workflow

**When**: First time a dice set is used. Optional — the app works without training
(classical fallback), but the trained model is faster and more accurate on the
user's specific dice under their specific lighting.

**How long**: ~2 minutes to collect images, ~1 minute to train (browser, no GPU
required — MobileNetV3-Small is fast on CPU).

**Data required**: 5–10 photos of each face value (1–6) = 30–60 labeled images total.
Transfer learning from ImageNet means this small dataset is sufficient.

```
Training flow:

1. User opens dice set → taps "Train Model for This Dice Set"

2. For each face value (1 through 6):
   App shows: "Show me a die rolled to [N] — tap capture"
   ├── Camera opens (rear-facing)
   ├── User rolls the die to that value, frames it
   ├── Tap to capture (repeat 5–10×, varying orientation + lighting)
   ├── Each capture: full pipeline through Phase 1 → extract 64×64 ROI
   ├── ROI labeled as class N, stored in memory
   └── Progress: "Face 4 of 6 — 7 captures so far"

3. After all 6 faces are captured:
   "Ready to train — 42 labeled images"
   → Tap "Train"

4. In-browser training:
   ├── Load MobileNetV3-Small base (TF.js, ImageNet weights, frozen)
   ├── Add classification head: GlobalAvgPool → Dense(128, relu) → Dense(6, softmax)
   ├── Fine-tune head only: Adam, lr=0.001, 20 epochs, batch=8
   ├── Progress bar with live loss display
   └── Validation: hold out 20% of captures, show per-class accuracy

5. On completion:
   ├── Model serialized → saved to IndexedDB keyed by dice_set_id
   ├── "Model ready — 94% validation accuracy"
   └── Training images discarded from memory (never stored)

6. Model is now used automatically for all future rolls with this dice set.
   User can retrain at any time (new lighting conditions, new dice).
```

### Model storage

```typescript
// IndexedDB — keyed by dice_set_id
// One model per dice set, replaced on retrain
// Model is tf.LayersModel artifacts: model.json + weights.bin

const MODEL_DB = 'nocheat-models'
const MODEL_STORE = 'trained-classifiers'

// Key: dice_set_id (TEXT)
// Value: { model: SerializedModel, trainedAt: number, accuracy: number }
```

Models never leave the device. They are not synced to the server. If a user
reinstalls the browser or clears storage, they re-train (2 minutes).

---

## Database Schema

```typescript
// users
id            TEXT PRIMARY KEY
email         TEXT UNIQUE NOT NULL
username      TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
created_at    INTEGER NOT NULL

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

---

## tRPC Routers

```typescript
// Auth
auth.register(email, username, password)
auth.login(email, password)     → session token
auth.me()                       → current user

// Dice Sets
diceSet.create(name)
diceSet.list()

// Sessions
session.start({ diceSetId, opponentName? })   → session
session.addRoll({ sessionId, pipValues })      → { rollCount, zScoreSoFar }
session.close({ sessionId, savePhoto? })       → { zScore, isLoaded }
session.list(diceSetId?)
session.get(id)                                → session + all rolls
```

---

## User Flow (Frictionless by Design)

### First time with a new dice set — optional training (2 min)

```
Create dice set → "Train Model?" prompt
  YES:
    → Training mode opens (see Model Training Workflow above)
    → After training: "Model ready — 94% accuracy on your dice"
    → Ready to play

  SKIP:
    → Uses classical fallback (SimpleBlobDetector)
    → Works fine for standard dice with good contrast
    → Can train later from dice set settings
```

### Every session

```
Login (once)
  → Tap your dice set
  → Start session (opponent name optional)
  → Live camera opens (rear-facing, getUserMedia)

  LOOP — repeat for each roll:
    → Lay all dice flat, in frame
    → Tap to capture frame
    → Browser pipeline runs (< 200ms):
        opencv.js → isolate each die face
        TF.js model (or blob detector) → classify each face
        Annotated preview shown: each die outlined, pip count overlaid
    → Confirm result (tap) or correct any misread die
    → Confirmed pip_values[] sent to server
    → Running Z-score shown ("Roll 4 of your session")
    → Frame discarded immediately — image never stored or transmitted

  CLOSE SESSION:
    → Tap "Done"
    → Final Z-score computed across all rolls

    IF FAIR:
      → "These dice look fair" — session saved

    IF LOADED:
      → "These dice are loaded"
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

## Future Apps (Tabletop Tools Platform)

### Combat Simulator (`apps/versus`)
Pit two Warhammer 40K units against each other — ranged or melee — and calculate the statistical outcome.

**Attack sequence (40K):**
```
Attacks
  → Hit rolls     (hit on X+, rerolls if applicable)
  → Wound rolls   (wound on X+ from Strength vs Toughness table)
  → Save rolls    (armor save or invulnerable save)
  → Damage        (wounds applied, models removed)
  → Survivors
```

**Output:** Expected wounds dealt, models removed, survivors — plus full best/worst case distribution.

**Unit data source: BSData (github.com/BSData)**
- Community-maintained 40K army data files (`.cat`, `.gst` XML format)
- Covers all factions, unit profiles, weapons, abilities
- Actively maintained after GW shut down BattleScribe
- Operator clones BSData locally and sets `BSDATA_DIR` env var
- Platform loads into memory at server startup via `BSDataAdapter` — nothing stored in DB
- No GW content ever committed to this repository

**Target system:** Warhammer 40K only.

---

### Meta List Builder (`apps/list-builder`)
A smart army list builder where every unit in a codex carries a live performance rating based on real GT+ tournament data. As you build a list, the tool surfaces higher-rated alternatives at the same points cost.

**How ratings work:**
- Every unit is scored by win-rate contribution and points efficiency from GT+ event results
- Ratings are rolling and current — they update as new tournament data comes in
- Ratings reset when GW releases a new balance dataslate or codex update
- Old data is discarded — only the current meta window counts

**Ratings source: native match records + operator-imported tournament data**
- Native matches from `apps/game-tracker` with `is_tournament = 1`
- Operator imports external tournament CSV exports via the platform admin panel
  (BCP export, Tabletop Admiral export, or platform's generic CSV format)
- GT+ filter applied at import time — small events excluded
- No BCP scraping by the platform; operator obtains and imports data themselves

**List builder behavior:**
```
User adds unit → tool shows:
  Unit: Redemptor Dreadnought  85pts  Rating: C+
  Suggestion: Brutalis Dreadnought  90pts  Rating: A-
              (+5pts, significantly higher win contribution)
```

**Unit profiles:** Sourced from BSData (shared with Combat Simulator — same DB table).

---

### Match Tracker (`apps/game-tracker`)
A live game companion. Records the full match turn by turn — one photo per turn of the board state, plus what happened that turn.

**Per turn:**
```
Turn N
  📷 One photo — board state
  Units destroyed (you)    → tapped from your loaded army list
  Units destroyed (them)   → tapped from opponent's faction units
  Primary objectives scored
  Secondary objectives scored
  CP spent
```

**Match setup:**
- Your list loaded from the list builder
- Opponent's faction selected from BSData
- Mission selected

**End of match:**
- Final score, win/loss/draw
- Full turn-by-turn history with photos
- Feeds personal win rate data back into list builder ratings

**Ties to NoCheat:**
- If dice seem suspicious mid-match, one tap opens a dice check session, then returns to the match

**Photos:** One per turn — stored per match. Unlike NoCheat, these are kept intentionally as the match record.

---

### Tournament Manager (`apps/tournament`)
A full tournament management platform — the job BCP does, built properly. Two distinct roles: Tournament Organizers run events; players register, submit lists, and report results.

**What it runs:**
- Swiss pairings generated each round by the server — correct algorithm, tested exhaustively
- Live pairings board (designed for display on a screen in the venue)
- Live standings with proper tiebreakers: W-L-D → VP margin → Strength of Schedule → total VP
- Result reporting with confirmation — either player reports, opponent confirms, TO resolves disputes
- Army list submission and locking flow

**ELO ladder across all events:**
- Every player carries a global ELO rating, updated after each confirmed match result
- K-factor: 32 for new players (< 30 rated games), 16 for established
- Starting rating: 1200
- Updates when a round closes — not at end of tournament, after every confirmed game
- Ratings visible on player profiles and on the standings board

**Tournament lifecycle:** `DRAFT → REGISTRATION → CHECK_IN → IN_PROGRESS → COMPLETE`

---

### Combat Simulator — How It Differs from Unit Crunch

Unit Crunch is the community benchmark. The Versus app is not a replacement — it's a different product.

**Unit Crunch:** A standalone calculator. You type every stat, every rule, every modifier. It calculates. That's it.

**Versus:** A tool that knows your army, knows the meta, and tells you things you didn't know to ask.

| | Unit Crunch | Versus |
|---|---|---|
| Unit stats | Manual entry | Auto-loaded from BSData |
| Special rules | Manual entry | Auto-loaded from BSData |
| Army context | None | Lives inside your list |
| Rule updates | Whatever you typed | Syncs with BSData automatically |
| Meta context | None | GT win rates wrapped around the math |

**Rules engine — modifier pipeline:**
```typescript
type WeaponAbility =
  | { type: 'SUSTAINED_HITS'; value: number }  // extra hits on unmodified 6
  | { type: 'LETHAL_HITS' }                    // auto-wound on unmodified 6 to hit
  | { type: 'DEVASTATING_WOUNDS' }             // mortal wound on unmodified 6 to wound
  | { type: 'TORRENT' }                        // auto-hit, skip hit roll
  | { type: 'TWIN_LINKED' }                    // re-roll wound rolls
  | { type: 'BLAST' }                          // minimum 3 hits vs 6+ models
  | { type: 'REROLL_HITS_OF_1' }
  | { type: 'REROLL_HITS' }
  | { type: 'REROLL_WOUNDS' }
  | { type: 'HIT_MOD'; value: number }
  | { type: 'WOUND_MOD'; value: number }

simulate(attacker, defender):
  → resolveAttacks()   // flat or dice average
  → resolveHits()      // TORRENT, HIT_MOD, REROLL_HITS, SUSTAINED_HITS, LETHAL_HITS
  → resolveWounds()    // WOUND_MOD, REROLL_WOUNDS, DEVASTATING_WOUNDS
  → resolveSaves()     // armor save, invuln save, FNP
  → resolveDamage()    // flat or dice average
```

Rules are sourced from BSData XML and mapped to typed ability objects. Free-text abilities require manual mapping to enum values — known challenge.

---

## Open Decisions

- **Hardware path**: Arduino + camera module is a future option, not MVP.

---

## UI

### Component Library
**shadcn/ui + Tailwind CSS** — components you own, not a dependency. Built on Radix UI primitives. TypeScript-native, Vite-compatible, include only what you use.

### Theme: Dark, clean, data-forward
```
Background:    slate-950  (#0f172a)  — near black
Surface:       slate-900  (#0f172a)  — cards, panels
Border:        slate-800  (#1e293b)  — subtle separation
Text:          slate-100  (#f1f5f9)  — primary
Muted text:    slate-400  (#94a3b8)  — labels, secondary

Accent:        amber-400  (#fbbf24)  — buttons, highlights, active states

Result FAIR:   emerald-400 (#34d399) — all clear
Result LOADED: red-400    (#f87171)  — caught
```

### Typography
**Geist** — clean, modern, readable at small sizes. Free. Excellent for data-heavy UIs.

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

---

## Rules for Every Session

- Plan before touching anything — understand every layer first.
- No features that aren't needed yet.
- Validate statistically before claiming anything.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.

---

## Testing: TDD Required

**Tests are written before the code. No exceptions.**

The workflow for every change:

1. Write the test — define what the code must do
2. Run it — confirm it fails (red)
3. Write the code — make it pass
4. Run it again — confirm it passes (green)
5. Refactor if needed — tests still pass

```bash
pnpm test --watch   # keep this running during development
```

Tests live next to the code they test:
```
src/
  lib/
    stats/
      zscore.ts
      zscore.test.ts
    cv/
      preprocess.ts        ← grayscale, threshold, contour detection
      preprocess.test.ts   ← synthetic image fixtures, not real dice photos
      blobDetector.ts      ← SimpleBlobDetector fallback
      blobDetector.test.ts ← known pip layouts as binary image fixtures
      classifier.ts        ← TF.js model load/run/save (IndexedDB abstraction)
      classifier.test.ts   ← mock model, test input/output shape contract
      pipeline.ts          ← compose preprocess + classify → pip_values[]
      pipeline.test.ts     ← end-to-end with fixtures
```

The statistical engine must be fully tested. Z-score calculations, distribution checks,
loaded/fair thresholds — all covered before any of that code ships.

The CV pipeline must be tested with synthetic image fixtures (programmatically
generated binary images with circles at known positions). Never use real photos of
dice as test fixtures — they are not reproducible across machines.
