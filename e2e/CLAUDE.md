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
  specs/                        <- one spec per app + landing/auth flows
```

The authoritative spec list and project assignments live in
`playwright.config.ts` (`testMatch` per project) — don't restate them here
(root CLAUDE.md Rule 6 corollary). `landing.spec.ts` derives its expected
cards from `apps/gateway/apps.json`, the platform's app-roster manifest.

---

## Three Playwright Projects

| Project | Auth | What it tests | Retries |
|---|---|---|---|
| `auth-flow` | None (tests auth itself) | Register, login, logout, cross-app session | 2 |
| `public` | None (no auth needed) | Landing page + apps without an auth gate | 1 |
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

Test counts per spec are answered by `pnpm test -- --list`, not by this file
(root CLAUDE.md Rule 6 corollary).
