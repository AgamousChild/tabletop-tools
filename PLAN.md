# PLAN.md — NoCheat Implementation

> This is the ordered build plan. Work top to bottom. Do not skip phases.
> Every step follows TDD: write the test first, then the code.
> See CLAUDE.md for architecture decisions. See SOUL.md for the why.

---

## Phase 1: Project Scaffold

NoCheat is the first app in the **Tabletop Tools** platform. Set up the monorepo to support multiple tools from day one.

```
tabletop-tools/
  packages/
    ui/       ← shared components, dark theme, Geist, shadcn
    auth/     ← shared Better Auth
    db/       ← shared Turso schema and Drizzle client
  apps/
    nocheat/  ← this project
```

- [ ] Initialize monorepo with pnpm workspaces (`packages/`, `apps/`)
- [ ] Scaffold `apps/nocheat/client/` with Vite + React + TypeScript
- [ ] Scaffold `apps/nocheat/server/` as a Node.js + TypeScript project
- [ ] Scaffold `packages/ui/`, `packages/auth/`, `packages/db/` as empty packages
- [ ] Configure path aliases in `tsconfig.json` and `vite.config.ts` (`@/` → `src/`)
- [ ] Install and configure Vitest in both client and server
- [ ] Install Tailwind CSS and configure for client
- [ ] Install and initialize shadcn/ui in `packages/ui`
- [ ] Set Geist as the base font
- [ ] Configure ESLint + TypeScript strict mode across the monorepo
- [ ] Confirm `pnpm dev`, `pnpm test --watch`, and `pnpm build` all work

**Exit criteria:** A blank React app runs locally. Tests run. Build succeeds. Monorepo structure is in place for future tools.

---

## Phase 2: Database & Schema

- [ ] Create a Turso database (libSQL/SQLite)
- [ ] Install and configure Drizzle ORM on the server
- [ ] Write schema for all four tables:
  - `users`
  - `dice_sets`
  - `sessions`
  - `rolls`
- [ ] Write and run migrations
- [ ] Write tests that verify schema integrity (insert, query, delete per table)

**Exit criteria:** All four tables exist. Migrations run cleanly. Tests pass.

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
  - Insufficient data → flagged as inconclusive
- [ ] Implement Z-score calculation per face using `simple-statistics`
- [ ] Implement chi-squared goodness of fit across all faces
- [ ] Define loaded/fair threshold (Z ≥ 2.5 or p-value < 0.05 — confirm with testing)
- [ ] Implement minimum roll count check (warn below 30 rolls)
- [ ] Expose as a pure function: `analyze(rolls: number[][]) → { zScore, isLoaded, confidence }`

**Exit criteria:** Statistical engine passes all tests. Pure function, no side effects, no DB dependency.

---

## Phase 7: Session & Roll Management

- [ ] Implement `session.start({ diceSetId, opponentName? })` → creates open session
- [ ] Implement `session.addRoll({ sessionId, pipValues })` → records a roll, returns running Z-score
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

## Phase 8: Computer Vision

The CV layer reads pip values from a live video frame. This replaces manual pip entry from Phase 7.

- [ ] Install `@tensorflow/tfjs`
- [ ] Implement `getUserMedia` live video stream (rear-facing camera)
- [ ] Capture a frame from the video stream on user tap
- [ ] Implement pip detection: identify dice faces and count pips per die
- [ ] Return pip values as a number array (e.g., `[3, 5, 2, 6]`)
- [ ] Write tests for the pip reader with known test images
- [ ] Wire pip reader output into `session.addRoll`
- [ ] Show pip values on screen after each capture so the user can verify

**Exit criteria:** User points camera at dice, taps capture, pip values are read and recorded automatically.

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

- [ ] Build the final result screen (per CLAUDE.md UI spec: bold verdict, Z-score, roll count, evidence prompt)
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

**Exit criteria:** NoCheat is live, accessible by URL, and works on an iPhone.

---

## Open After Launch

- Arduino + camera module hardware path
- Multi-user / invite-to-session support
- Export session data (CSV, PDF report)
