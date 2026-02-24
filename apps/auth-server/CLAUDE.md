# CLAUDE.md — apps/auth-server

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

The central authentication Worker for the entire platform. Handles user registration, login,
logout, and session management. Deployed as a Cloudflare Worker on a Workers Route at
`tabletop-tools.net/auth/*`. All other apps delegate auth to this single endpoint.

This is NOT a tRPC app. It runs Better Auth's HTTP handler directly via Hono.

**Port:** 3000 (local dev only -- production uses Workers Route)

---

## Architecture

```
Client (any app)
  |
  |  HTTP -- Better Auth protocol
  |  POST /auth/api/auth/sign-up/email
  |  POST /auth/api/auth/sign-in/email
  |  POST /auth/api/auth/sign-out
  |  GET  /auth/api/auth/session
  v
Auth Worker (Cloudflare Workers Route: tabletop-tools.net/auth/*)
  |
  |  Better Auth + Drizzle adapter
  v
Turso SQLite (shared DB -- authUsers, authSessions, authAccounts, authVerifications)
```

---

## File Structure

```
apps/auth-server/
  src/
    index.ts            <- Node.js dev server (port 3000, basePath /api/auth)
    worker.ts           <- Cloudflare Worker entry (basePath /auth/api/auth)
  wrangler.toml         <- Worker config, Workers Route, env vars
  package.json
  tsconfig.json
```

---

## Key Implementation Details

### CORS Lockdown

CORS restricted to `['https://tabletop-tools.net']` in production (configured via
`TRUSTED_ORIGINS` env var). Prevents cross-origin auth exploitation with credentials.

### Worker Module-Scope Caching

Uses `let cachedApp` pattern at module scope. The Turso client, Drizzle wrapper, and Hono app
are created once per Worker isolate lifetime, not per request.

### Path Routing

- **Production**: Workers Route `tabletop-tools.net/auth/*` -> Worker receives at `/auth/**`
- **Dev**: Hono serves directly at `/api/auth/**`
- `basePath` on Better Auth: `/auth/api/auth` (prod) or `/api/auth` (dev)
- `AUTH_BASE_URL`: `https://tabletop-tools.net` (no `/auth` suffix -- basePath handles prefix)

---

## Deployment

```bash
cd apps/auth-server
wrangler secret put TURSO_DB_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put AUTH_SECRET
wrangler deploy
```

---

## Testing

The auth-server has no unit tests of its own -- it's a thin Hono wrapper around `packages/auth`.
Auth logic is tested in `packages/auth/src/auth.test.ts` (17 tests). Integration is verified by
E2E tests (`e2e/specs/auth.spec.ts`, `e2e/specs/cross-app-auth.spec.ts`).
