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

## Phase 3: Auth ✅ complete

Better Auth via `packages/auth`, shared across all apps. Central `apps/auth-server`
on port 3000 handles all auth routes. App servers use `validateSession(db, headers)`.
11 auth tests passing. Login + register UI built in client.

---

## Phase 4: tRPC Setup ✅ complete

tRPC + Zod on client and server. Protected procedures via `validateSession`. Health
check, diceSet, session, vision, and savePhoto routers all wired. 3 trpc tests passing.

---

## Phase 5: Dice Sets ✅ complete

`diceSet.create` and `diceSet.list` implemented and tested (covered in 50 server tests).
Client: CreateDiceSetForm, DiceSetList, DiceSetScreen wired and tested (covered in 66 client tests).

**Exit criteria met:** A user can create a named dice set and see it listed on login.

---

## Phase 6: Statistical Engine ✅ complete

`server/src/lib/stats/analyze.ts` — Z-score per face + chi-squared goodness-of-fit.
Confidence tiers (low/medium/high), outlierFace, observedRate. 17 tests passing.

---

## Phase 7: Session & Roll Management ✅ complete

All five session procedures implemented and tested (50 server tests total).
Client: AuthScreen, DiceSetScreen, DiceSetDetailScreen, ActiveSessionScreen,
SessionDetailScreen, ResultScreen, EvidencePrompt — all wired, 66 client tests passing.
Evidence photo upload via R2 tested (6 tests).

**Note:** Camera currently uses Anthropic API for pip reading (sends image to server).
This works but violates the "no pixels leave the device" architecture rule.
Phase 8 replaces this with local opencv.js.

---

## Phase 8: Computer Vision Pipeline ✅ complete

The CV layer reads pip values from a live video frame in the browser. Replaces manual pip entry from Phase 7.
All processing is pure TypeScript — no opencv.js dependency, no AI API calls.

- [x] Implement `getUserMedia` live video stream (rear-facing camera)
- [x] Implement background calibration capture (LAB color space, stored in memory)
- [x] Implement Phase 1 isolation pipeline:
  - LAB absdiff vs calibration background
  - Otsu threshold → binary mask
  - BFS connected-components → center-proximity merge → top face ROI per die
  - Resize each ROI to 64×64, apply dilation (3×3, 2 iterations)
- [x] Write tests for isolation with synthetic binary image fixtures
- [x] Implement Phase 2b: SimpleBlobDetector fallback (d6 only)
  - filterByArea (20–600), filterByCircularity (≥0.5)
  - Count blobs → pip value; null if count > 6
- [x] Write tests for blob detector with known synthetic pip layouts
- [x] Implement Phase 2a: rotation-invariant template matching
  - Coarse rotation search (0°–350°, 10° steps)
  - Fine rotation search (±15° around best coarse angle, 1° steps)
  - Dissimilarity score = avg grayscale pixel difference
- [x] Write tests with synthetic 64×64 images — verify rotation invariance analytically
- [x] Implement agglomerative clustering engine
  - Merge to nearest cluster if score < threshold; else create new cluster
  - Signal stabilization when 6 clusters seen multiple times (~20 rolls)
- [x] Write tests: verify merge/new-cluster decisions and label assignment
- [x] Implement exemplar store (IndexedDB, keyed by dice_set_id)
- [x] Write tests for exemplar store with mocked IndexedDB
- [x] Build calibration UI:
  - Background calibration step (point camera, tap)
  - Cluster stabilization progress bar ("Faces seen: N of 6 — keep rolling")
  - Cluster labeling step via ClusterLabelingScreen (shown after confirming a roll once stable)
- [x] Wire CV pipeline output into `session.addRoll`
- [ ] Show annotated preview after each capture (die faces outlined, pip count overlaid) — deferred post-launch

**Exit criteria met:** User points camera at dice, taps calibrate, taps capture, pip values are read locally and recorded. Clustering stabilizes after ~20 rolls. Labeling UI appears automatically and takes < 1 minute. Exemplars persist in IndexedDB across sessions.

150 client tests passing.

---

## Phase 9: Evidence Photo Storage ✅ complete

Only triggered when a session closes with a loaded verdict.

- [x] Implement server-side photo upload handler (`r2.ts` — `createR2Client`, `uploadToR2`)
- [x] `session.savePhoto` procedure — validates session is closed + loaded, uploads to R2, stores URL (6 tests)
- [x] `ResultScreen` — shows verdict (LOADED/FAIR), Z-score, observed rate, Save Evidence + Dismiss buttons (10 tests)
- [x] `ActiveSessionScreen` — evidence capture phase: Camera in captureOnly mode, `session.savePhoto` mutation
- [x] Removed Anthropic API image pipeline (`vision.ts`, `readDice.ts`) — architecture violation eliminated
- [x] Removed dead `EvidencePrompt` component (superseded by ResultScreen)
- [x] Removed `@anthropic-ai/sdk` and `jimp` unused dependencies
- [ ] Create Cloudflare R2 bucket — infrastructure step, deferred to Phase 11 deployment

**Exit criteria met:** When dice are flagged as loaded, user can save a photo via Camera captureOnly mode. URL stored in the session record. No pixels ever leave the device for analysis — only the evidence photo the user explicitly chooses to save.

50 server tests / 144 client tests passing.

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
