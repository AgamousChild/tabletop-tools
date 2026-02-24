# CLAUDE.md — admin

> Read the root CLAUDE.md for platform-wide conventions.

---

## What admin Is

Platform admin dashboard. Requires authentication + admin email whitelist.
Shows platform-wide stats: user counts, active sessions, app usage, and activity trends.

**Port:** 3007 (server), Vite dev server proxies `/trpc` → `:3007`

---

## Current State

| Layer | Status |
|---|---|
| Server scaffold (Hono + tRPC) | Done — 23 tests |
| Client UI (dashboard + pages) | Done — 7 tests |
| Admin access control | Done — ADMIN_EMAILS env var |
| Gateway integration | Done — service binding + Pages Function |

---

## Architecture

```
Client (React + tRPC)
  │
  │  HTTP — tRPC batch link → /trpc
  ▼
Server (Hono + tRPC, port 3007)
  │
  │  Drizzle ORM — reads all platform tables
  ▼
Turso SQLite (shared DB)
```

### Admin Access Control

Admin access is controlled via the `ADMIN_EMAILS` environment variable — a comma-separated
list of email addresses that are allowed to access admin endpoints. Set as a Cloudflare
Worker secret in production.

The `adminProcedure` middleware in `trpc.ts` checks:
1. User is authenticated (has valid session)
2. User's email is in the `adminEmails` list

---

## File Structure

```
apps/admin/
  CLAUDE.md
  server/
    package.json          name: "admin-server"
    wrangler.toml         ADMIN_EMAILS secret
    tsconfig.json
    src/
      index.ts            port 3007
      worker.ts           Cloudflare Worker entry
      server.ts           Hono + CORS + tRPC handler
      trpc.ts             publicProcedure, protectedProcedure, adminProcedure
      routers/
        index.ts          appRouter (health + stats)
        stats.ts          admin-only — overview, recentUsers, activeSessions, appActivity
        stats.test.ts     23 tests
  client/
    package.json          name: "admin-client"
    index.html
    vite.config.ts        base: '/admin/', proxy /trpc → :3007
    tailwind.config.ts
    tsconfig.json
    postcss.config.js
    src/
      App.tsx             auth gate + state-machine navigation
      main.tsx
      index.css
      lib/
        trpc.ts           createTRPCReact<AppRouter>
        auth.ts           Better Auth client
      pages/
        Dashboard.tsx     overview cards — all platform stats
        UsersPage.tsx     recent users table
        SessionsPage.tsx  active sessions table
        ActivityPage.tsx  per-app activity bars
      components/
        AuthScreen.tsx    login/register form
        StatCard.tsx      reusable stat display card
        StatCard.test.tsx 4 tests
      test/
        setup.ts
      App.test.tsx        3 tests
```

---

## tRPC Routers

### stats (admin-only)

```typescript
stats.overview()        → { users, sessions, noCheat, versus, listBuilder, gameTracker, tournament, newMeta, elo }
stats.recentUsers({ limit? })     → { id, name, email, createdAt }[]
stats.activeSessions()            → { id, userId, userName, userEmail, createdAt, expiresAt, ipAddress, userAgent }[]
stats.appActivity()               → { app, total, recent }[]
```

All endpoints require admin access (authenticated + email in ADMIN_EMAILS).

---

## Deployment

```bash
# Set secrets (first deploy only)
cd apps/admin/server
wrangler secret put TURSO_DB_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put ADMIN_EMAILS  # comma-separated: admin@example.com,other@example.com

# Deploy
wrangler deploy
```

---

## Testing

```
server/src/routers/stats.test.ts    23 tests — access control, empty DB, data counts, users, sessions, activity
client/src/components/StatCard.test.tsx  4 tests — renders label, value, subtitle
client/src/App.test.tsx             3 tests — loading, auth gate, nav when logged in
Total: 30 tests, all passing
```
