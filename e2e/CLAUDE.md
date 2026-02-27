# CLAUDE.md — e2e

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

End-to-end browser tests (Playwright) that exercise the full deployed application stack in a
real Chromium browser. Catches integration bugs that unit tests cannot: auth routing, CORS,
Worker crashes, client-side rendering.

---

## Architecture

```
e2e/
  playwright.config.ts          <- 3 projects: auth-flow, public, authed
  global-setup.ts               <- creates test user -> auth-state.json
  fixtures/
    auth.ts                     <- signUp / logIn / logOut / testEmail helpers
  specs/
    landing.spec.ts             <- landing page loads, 8 app cards link correctly
    auth.spec.ts                <- register, login, logout, session persistence
    cross-app-auth.spec.ts      <- login in one app -> session carries to another
    no-cheat.spec.ts            <- auth gate -> main screen, dice set UI
    versus.spec.ts              <- auth gate -> simulator, faction selectors
    list-builder.spec.ts        <- auth gate -> list builder, faction selector
    game-tracker.spec.ts        <- auth gate -> main screen, new match button
    tournament.spec.ts          <- auth gate -> main screen, create tournament button
    new-meta.spec.ts            <- NO auth gate -> nav tabs, dashboard renders
    data-import.spec.ts         <- NO auth gate -> repo config, load button
```

---

## Three Playwright Projects

| Project | Auth | What it tests | Retries |
|---|---|---|---|
| `auth-flow` | None (tests auth itself) | Register, login, logout, cross-app session | 2 |
| `public` | None (no auth needed) | Landing page, new-meta, data-import | 1 |
| `authed` | `storageState` from global-setup | All auth-gated apps | 1 |

The `authed` project depends on `auth-flow` -- auth-flow creates the session state file
(`auth-state.json`) that authed tests reuse.

### Why Retries Exist

5 tests are flaky due to Cloudflare Workers scrypt CPU limits -- the auth Worker occasionally
hits the 30ms CPU time limit on cold isolates. The `signUp` fixture has internal retry logic
(3 attempts). This is a known Workers cold-start constraint, not a test quality issue.

---

## Running E2E Tests

```bash
# Against production
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test

# Against local dev
cd e2e && pnpm test

# Headed mode
cd e2e && pnpm test:headed

# Single spec
cd e2e && pnpm test -- --grep "no-cheat"
```

---

## Test Counts

| Spec | Tests | Project |
|---|---|---|
| landing.spec.ts | 4 | public |
| auth.spec.ts | 5 | auth-flow |
| cross-app-auth.spec.ts | 1 | auth-flow |
| no-cheat.spec.ts | 3 | authed |
| versus.spec.ts | 4 | authed |
| list-builder.spec.ts | 4 | authed |
| game-tracker.spec.ts | 4 | authed |
| tournament.spec.ts | 3 | authed |
| new-meta.spec.ts | 4 | public |
| data-import.spec.ts | 4 | public |
| **Total** | **36** | |
