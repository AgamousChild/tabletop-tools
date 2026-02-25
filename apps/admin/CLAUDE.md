# CLAUDE.md — admin

> Read the root CLAUDE.md for platform-wide conventions.

---

## What admin Is

Platform admin dashboard. Requires authentication + admin email whitelist.
Shows platform-wide stats: user counts, active sessions, app usage, and activity trends.

**Port:** 3007 (server), Vite dev server proxies `/trpc` -> `:3007`

---

## Architecture

```
Client (React + tRPC)
  |
  |  HTTP -- tRPC batch link -> /trpc
  v
Server (Hono + tRPC, port 3007)
  |
  |  Drizzle ORM -- reads all platform tables
  v
Turso SQLite (shared DB)
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.

### Admin Access Control

Admin access is controlled via the `ADMIN_EMAILS` environment variable -- a comma-separated
list of email addresses. The `adminProcedure` middleware checks:
1. User is authenticated (has valid session)
2. User's email is in the `adminEmails` list

---

## File Structure

```
apps/admin/
  server/
    src/
      index.ts            port 3007
      worker.ts           Cloudflare Worker entry (createWorkerHandler)
      server.ts           createBaseServer from server-core
      trpc.ts             publicProcedure, protectedProcedure, adminProcedure
      routers/
        index.ts          appRouter (health + stats)
        stats.ts          admin-only endpoints
        stats.test.ts     32 tests
      server.test.ts      6 tests -- HTTP session integration
  client/
    src/
      App.tsx             auth gate + state-machine navigation
      main.tsx            renderApp from packages/ui
      lib/trpc.ts, auth.ts
      pages/
        Dashboard.tsx, UsersPage.tsx, SessionsPage.tsx,
        ActivityPage.tsx, ImportsPage.tsx
      components/
        StatCard.tsx / StatCard.test.tsx (4 tests)
      App.test.tsx        3 tests
    .env.production       VITE_AUTH_SERVER_URL
```

---

## tRPC Routers

### stats (admin-only)

```typescript
stats.overview()        -> { users, sessions, noCheat, versus, listBuilder, gameTracker, tournament, newMeta, elo }
stats.recentUsers({ limit? })     -> { id, name, email, createdAt }[]
stats.activeSessions()            -> { id, userId, userName, ... }[]
stats.appActivity()               -> { app, total, recent }[]
stats.importHistory({ limit? })   -> { id, eventName, eventDate, format, ... }[]
stats.topFactions({ limit? })     -> { faction, count }[]
stats.matchResults()              -> { wins, losses, draws, inProgress, total }
stats.bsdataVersion()             -> { sha, date, message, error }  (public -- no admin required)
```

---

## Deployment

```bash
cd apps/admin/server
wrangler secret put TURSO_DB_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put ADMIN_EMAILS  # comma-separated
wrangler deploy
```

---

## Testing

**85 tests** (38 server + 47 client), all passing.

```
server/src/routers/stats.test.ts    32 tests -- access control, empty DB, data counts, users, sessions, etc.
server/src/server.test.ts            6 tests -- HTTP session integration
client/src/components/StatCard.test.tsx  4 tests
client/src/App.test.tsx              8 tests -- auth states, nav to each page
client/src/pages/
  Dashboard.test.tsx                10 tests -- loading, error, stat cards, sections
  UsersPage.test.tsx                 5 tests -- loading, error, empty, table rows
  SessionsPage.test.tsx              6 tests -- loading, error, empty, table, count
  ActivityPage.test.tsx              6 tests -- loading, error, app labels, progress bars
  ImportsPage.test.tsx               8 tests -- loading, error, empty, table, formats
```

```bash
cd apps/admin/server && pnpm test   # 38 server tests
cd apps/admin/client && pnpm test   # 47 client tests
```
