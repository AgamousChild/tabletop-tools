# PLAN.md — no-cheat

> Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See apps/no-cheat/CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: Scaffold ✅ complete

Monorepo initialized, `apps/no-cheat/client/` and `apps/no-cheat/server/` scaffolded,
shared packages wired, Vitest running, Tailwind + shadcn configured.

---

## Phase 2: Database & Schema ✅ complete

Schema written for `dice_sets`, `sessions`, `rolls` (plus shared auth tables).
Migrations generated. Tests pass.

---

## Phase 3: Auth

- [ ] Install and configure Better Auth on the server
- [ ] Implement `auth.register` — email, username, password
- [ ] Implement `auth.login` — returns session token
- [ ] Implement `auth.me` — returns current user from token
- [ ] Implement `auth.logout`
- [ ] Write tests for all auth routes (happy path + failure cases)
- [ ] Build login and register UI in the client
- [ ] Wire auth token to client state

**Exit criteria:** A user can register, log in, and stay logged in across page refreshes.

---

## Phase 4: tRPC Setup

- [ ] Install tRPC on client and server
- [ ] Install Zod for input validation
- [ ] Create the tRPC router structure (`auth`, `diceSet`, `session`, `roll`)
- [ ] Connect tRPC client to React using `@tanstack/react-query`
- [ ] Propagate auth context through tRPC middleware (protected routes)
- [ ] Write a basic health-check procedure and test it end-to-end

**Exit criteria:** A protected tRPC call works from the React client. Unauthenticated calls are rejected.

---

## Phase 5: Dice Sets

- [ ] Implement `diceSet.create(name)` procedure
- [ ] Implement `diceSet.list()` procedure
- [ ] Write tests for both procedures
- [ ] Build dice set creation UI
- [ ] Build dice set selection screen (the home screen after login)

**Exit criteria:** A user can create a named dice set and see it listed on login.

---

## Phase 6: Statistical Engine

This is the core of the application. Must be fully tested before anything calls it.

- [ ] Write tests first — define expected outputs for known inputs:
  - Fair distribution (uniform) → Z-score near 0, is_loaded = false
  - Heavily skewed distribution → Z-score above threshold, is_loaded = true
  - Insufficient data → flagged with `rollsNeeded`
- [ ] Implement Z-score calculation per face using `simple-statistics`
- [ ] Implement chi-squared goodness of fit across all faces
- [ ] Implement Markov correlation test (consecutive roll pairs vs independence)
- [ ] Implement degree-of-bias framing helpers (`rollsNeeded`, `estimatedBias%`)
- [ ] Define loaded/fair threshold (Z ≥ 2.5 or p-value < 0.05 — confirm with testing)
- [ ] Expose as a pure function: `analyze(rolls: number[][]) → { zScore, chiSq, markovP, isLoaded, rollsNeeded }`

**Exit criteria:** Statistical engine passes all tests. Pure function, no side effects, no DB dependency.

---

## Phase 7: Session & Roll Management

- [ ] Implement `session.start({ diceSetId, opponentName? })` → creates open session
- [ ] Implement `session.addRoll({ sessionId, pipValues })` → records a roll, returns running stats
- [ ] Implement `session.close({ sessionId, savePhoto? })` → runs statistical engine, closes session
- [ ] Implement `session.list(diceSetId?)` → returns sessions for a dice set
- [ ] Implement `session.get(id)` → returns session with all rolls
- [ ] Write tests for all procedures
- [ ] Build session UI:
  - Start session screen
  - Active session screen (roll count, running Z-score, "Done" button)
  - Closed session result screen

**Exit criteria:** A user can start a session, add rolls manually (typed pip values), close it, and see a verdict.

---

## Phase 8: Computer Vision Pipeline

The CV layer reads pip values from a live video frame in the browser. Replaces manual pip entry from Phase 7.
All processing is classical opencv.js — no AI API calls, no model downloads.

- [ ] Load opencv.js (WASM) in the client; confirm it initializes correctly
- [ ] Implement `getUserMedia` live video stream (rear-facing camera)
- [ ] Implement background calibration capture (LAB color space, stored in memory)
- [ ] Implement Phase 1 isolation pipeline:
  - LAB absdiff vs calibration background
  - Otsu threshold → binary mask
  - findContours → center-proximity merge → top face ROI per die
  - Resize each ROI to 64×64, apply dilation (3×3, 2 iterations)
- [ ] Write tests for isolation with synthetic binary image fixtures
- [ ] Implement Phase 2b: SimpleBlobDetector fallback (d6 only)
  - filterByArea, filterByCircularity, filterByInertia — see CLAUDE.md for params
  - Count keypoints → pip value; reject if count > 6
- [ ] Write tests for blob detector with known synthetic pip layouts
- [ ] Implement Phase 2a: rotation-invariant template matching
  - Coarse rotation search (0°–350°, 10° steps)
  - Fine rotation search (±15° around best coarse angle, 1° steps)
  - Dissimilarity score = avg grayscale pixel difference
- [ ] Write tests with synthetic 64×64 images — verify rotation invariance analytically
- [ ] Implement agglomerative clustering engine
  - Merge to nearest cluster if score < threshold; else create new cluster
  - Signal stabilization when 6 clusters seen multiple times (~20 rolls)
- [ ] Write tests: verify merge/new-cluster decisions and label assignment
- [ ] Implement exemplar store (IndexedDB, keyed by dice_set_id)
- [ ] Write tests for exemplar store with mocked IndexedDB
- [ ] Build calibration UI:
  - Background calibration step (point camera, tap)
  - Cluster stabilization progress indicator ("Faces seen: N of 6")
  - Cluster labeling step (shown once, after stabilization)
- [ ] Wire CV pipeline output into `session.addRoll`
- [ ] Show annotated preview after each capture (die faces outlined, pip count overlaid)

**Exit criteria:** User points camera at dice, taps capture, pip values are read and recorded automatically. Clustering stabilizes after ~20 rolls. Labeling takes < 1 minute.

---

## Phase 9: Evidence Photo Storage

Only triggered when a session closes with a loaded verdict.

- [ ] Create a Cloudflare R2 bucket
- [ ] Implement server-side photo upload handler (receives image, stores to R2, returns URL)
- [ ] Add `photo_url` update to `session.close` when `savePhoto = true`
- [ ] Build the evidence prompt UI:
  - Shown only when `is_loaded = true`
  - "Save Evidence Photo" button re-opens camera for one final capture
  - Upload on confirm, discard on skip
- [ ] Write tests for upload and skip paths

**Exit criteria:** When dice are flagged as loaded, user can save a photo. The URL is stored in the session record.

---

## Phase 10: Result & History UI

- [ ] Build the final result screen (per CLAUDE.md UI spec: bold verdict, Z-score, observed %, evidence prompt)
- [ ] Build session history view per dice set (list of past sessions, verdicts, dates, opponents)
- [ ] Build roll detail view (individual pip values per roll within a session)
- [ ] Apply full dark theme, amber accent, Geist font throughout
- [ ] Ensure the UI works on iPhone Safari (test getUserMedia, HTTPS, touch targets)

**Exit criteria:** The full user journey works end-to-end on a mobile browser.

---

## Phase 11: Deployment

- [ ] Configure Cloudflare Workers for the tRPC server
- [ ] Configure Cloudflare Pages for the React client
- [ ] Set environment variables (Turso connection, R2 credentials, auth secrets)
- [ ] Run full end-to-end test on the deployed environment
- [ ] Confirm HTTPS is active (required for getUserMedia on iPhone)

**Exit criteria:** no-cheat is live, accessible by URL, and works on an iPhone.

---

## Open After Launch

- Arduino + camera module hardware path
- Multi-user / invite-to-session support
- Export session data (CSV, PDF report)
