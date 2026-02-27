# CLAUDE.md — Tabletop Tools Platform (V2)

> Read SOUL.md first. Every decision here flows from it.
> V1 archive: `v1/CLAUDE.md`

---

## V1 → V2 Changes

V1 shipped 8 apps with 866 passing tests and a working deployment. A 4-agent code review found
26 issues — the root cause of most was shared code being copy-pasted instead of extracted into
packages. V2 redesigns the architecture to fix this structurally.

**What changed:**
- **`packages/server-core` (NEW)** — eliminates 7× duplication of trpc.ts, server.ts, worker.ts, index.ts
- **`packages/ui` expansion** — eliminates 6× AuthScreen, 7× auth.ts, 7× main.tsx, 8× tailwind.config
- **Auth security** — HMAC verification, timing-safe comparison, CORS lockdown
- **DB integrity** — indexes on all FKs, unique constraints, cascading deletes
- **SQL-first queries** — no more SELECT * → filter in JS
- **TRPCError everywhere** — proper HTTP status codes from every app
- **Client resilience** — ErrorBoundary, global tRPC error link, client-side routing
- **Worker caching** — DB client + Hono app created once per isolate, not per request
- **Dead code removal** — tfjs dependency, broken R2, non-functional suggestions

**What didn't change:** SOUL.md, the stack choices, the app boundaries, TDD, the data boundary rules.

---

## What This Platform Is

Tabletop Tools is a monorepo of tools for tabletop miniature wargamers. One login. Shared UI.
Each app deploys independently and does exactly one thing. The first app ships, then more follow.

---

## Monorepo Structure

```
tabletop-tools/
  v1/                ← archived V1 CLAUDE.md files (read-only reference)
  packages/
    server-core/     ← NEW: base tRPC, createBaseServer, Worker handler, ID gen
    ui/              ← EXPANDED: AuthScreen, auth client, tRPC factory, AppShell, ErrorBoundary, Tailwind preset
    auth/            ← HARDENED: HMAC verification, timing-safe comparison, declared deps
    db/              ← FIXED: indexes, unique constraints, cascading deletes, timestamp normalization
    game-content/    ← shared parsers, DRY tournament import, fix nested XML
    game-data-store/ ← error handling in hooks, efficient IndexedDB operations
  apps/
    auth-server/     ← central auth Worker (CORS lockdown, caching)
    gateway/         ← unified Cloudflare Pages project (landing + tRPC proxies)
    data-import/     ← BSData importer (client-only SPA, no server)
    no-cheat/        ← dice cheat detection        (port 3001)
    versus/          ← combat simulator             (port 3002)
    list-builder/    ← meta list builder            (port 3003)
    game-tracker/    ← match tracker                (port 3004)
    tournament/      ← tournament manager           (port 3005)
    new-meta/        ← 40K meta analytics           (port 3006)
    admin/           ← platform admin dashboard     (port 3007)
  e2e/               ← Playwright browser tests (all apps, landing, auth flows)
```

All apps are served from a single origin: `tabletop-tools.net/<app>/`. The gateway builds all
client SPAs into `dist/<app>/` and deploys as one Cloudflare Pages project. Pages Functions
proxy each app's `/trpc` calls to its Worker via service bindings. Auth runs on a Workers Route
at `tabletop-tools.net/auth/*`.

---

## App Registry

| App | Port | Tests | Status | Purpose |
|---|---|---|---|---|
| no-cheat | 3001 | 242 | Deployed | Detect loaded dice via CV + statistics |
| versus | 3002 | 142 | Deployed | Simulate 40K combat: hit/wound/save/damage |
| list-builder | 3003 | 87 | Deployed | Build lists with live meta ratings from GT data |
| game-tracker | 3004 | 214 | Deployed | Track matches turn-by-turn with photos |
| tournament | 3005 | 127 | Deployed | Swiss events: pairings, results, standings, ELO |
| new-meta | 3006 | 140 | Deployed | Meta analytics: win rates, Glicko-2 ratings |
| data-import | — | 57 | Deployed (client-only) | BSData importer: fetch + parse XML → IndexedDB |
| admin | 3007 | 93 | Deployed | Platform dashboard: users, sessions, app stats |

Each app has its own `CLAUDE.md` with full spec, architecture, and V2 implementation detail.

---

## Shared Stack

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

---

## Shared Packages — API Surface

### `packages/server-core`

Eliminates the 7× copy-paste of trpc.ts, server.ts, worker.ts, and index.ts across app servers.

```typescript
// Base context — every app extends this
export type BaseContext = {
  user: User | null
  req: Request
  db: Db
}

// Base tRPC setup — apps import and extend
export const t = initTRPC.context<BaseContext>().create()
export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(authMiddleware)

// Server factory — handles Hono + CORS + tRPC handler + auth
export function createBaseServer<TContext extends BaseContext>(opts: {
  router: AnyRouter
  db: Db
  secret: string
  extendContext?: (baseCtx: BaseContext) => TContext | Promise<TContext>
}): Hono

// Worker handler — module-scope caching, lazy init
export function createWorkerHandler<TEnv extends BaseEnv>(opts: {
  createApp: (env: TEnv) => Promise<Hono>
}): { fetch(request: Request, env: TEnv, ctx?: unknown): Promise<Response> }

// Dev server factory
export function startDevServer(opts: {
  port: number
  createApp: () => Promise<Hono>
}): void

// Shared ID generation
export function generateId(): string  // nanoid, 21 chars
```

### `packages/ui`

Expanded from 1 component to the full shared client library.

```typescript
// Components
export { AuthScreen } from './components/AuthScreen'       // configurable title/subtitle
export { AppShell } from './components/AppShell'           // header + sign out + content
export { ErrorBoundary } from './components/ErrorBoundary' // catches render errors
export { GameContentDisclaimer } from './components/GameContentDisclaimer'

// Auth client factory
export { createAuthClient } from './lib/auth'              // shared Better Auth client

// tRPC link factory
export { createTRPCLinks } from './lib/trpc'               // shared httpBatchLink with credentials

// App entry point
export { renderApp } from './lib/render'                   // StrictMode mount (apps add own providers)

// Tailwind preset
export { default as tailwindPreset } from './tailwind-preset'  // shared colors, fonts, tokens
```

### `packages/auth`

Security-hardened session validation and auth factory.

```typescript
export function createAuth(db, baseURL?, trustedOrigins?, secret?, basePath?): Auth
export async function validateSession(db, headers, secret?): Promise<User | null>
//                                                 ^^^^^^^ NEW: verifies HMAC signature
export type User = { id: string; email: string; name: string }

// Test helpers (for app server tests)
export { setupAuthTables, createRequestHelper, authCookie, TEST_USER, TEST_TOKEN }
```

### `packages/db`

Schema with indexes, constraints, and cascading deletes.

```typescript
export { createDb, createDbFromClient } from './client'
export type { Db } from './client'
export * from './schema'  // all 22 tables + indexes + constraints
```

### `packages/game-content`

Game content adapter boundary + shared parsers.

```typescript
export type { GameContentAdapter, UnitProfile, WeaponProfile, WeaponAbility }
export { BSDataAdapter } from './adapters/bsdata'
export { NullAdapter } from './adapters/null'
export { parseBSDataXml } from './adapters/bsdata/parser'

// Shared unit router factory (eliminates versus/list-builder duplication)
export { createUnitRouter } from './routers/unit'  // no args — uses own tRPC instance
```

### `packages/game-data-store`

Client-side IndexedDB store with error handling.

```typescript
export { saveUnits, getUnit, searchUnits, listFactions, clearAll, setImportMeta, getImportMeta }
export { useUnit, useUnitSearch, useFactions, useGameDataAvailable }
```

---

## Data Boundary Rules

**No GW (Games Workshop) content is ever committed to this repository.**

Unit profiles, weapon stats, ability text, and faction data are loaded at runtime from
BSData (community-maintained XML). The platform adapts to this data at startup via
`packages/game-content`. Nothing from GW ever lands in committed source files or the DB schema.

```typescript
// packages/game-content exports:
interface GameContentAdapter {
  load(): Promise<void>
  getUnit(id: string): Promise<UnitProfile | null>
  searchUnits(opts: { faction?: string; name?: string }): Promise<UnitProfile[]>
  listFactions(): Promise<string[]>
}

// At server startup — operator sets BSDATA_DIR env var:
const gameContent = process.env.BSDATA_DIR
  ? new BSDataAdapter(process.env.BSDATA_DIR)
  : new NullAdapter()
await gameContent.load()
```

**What this means in practice:**
- No `.cat` or `.gst` BSData XML files committed
- Faction strings entered by users are stored verbatim — never validated against GW data
- Army list text is stored raw — never parsed for GW content
- If `BSDATA_DIR` is unset, apps serve empty unit lists (not an error)
- `GameContentDisclaimer` UI component (in `packages/ui`) surfaces the data source to users

---

## Shared Server Pattern (V2)

Every app server uses `packages/server-core` instead of copy-pasting boilerplate.

```typescript
// apps/<app>/server/src/routers/index.ts
import { router } from '@tabletop-tools/server-core'
import { appSpecificRouter } from './appSpecific'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
  ...appSpecificRouter,
})
export type AppRouter = typeof appRouter

// apps/<app>/server/src/server.ts  — no auth imports, no validateSession
import { createBaseServer } from '@tabletop-tools/server-core'
import { appRouter } from './routers'

// Simple apps (tournament, new-meta, versus, list-builder) — no extra context needed
export const createServer = (db: Db, secret: string) =>
  createBaseServer({ router: appRouter, db, secret })

// Apps with extra context (admin, no-cheat, game-tracker)
export const createServer = (db: Db, storage: R2Storage, secret: string) =>
  createBaseServer({
    router: appRouter, db, secret,
    extendContext: (ctx) => ({ ...ctx, storage }),
  })

// apps/<app>/server/src/worker.ts  — module-scope caching
import { createWorkerHandler } from '@tabletop-tools/server-core'
import { createServer } from './server'

export default createWorkerHandler({
  createApp: async (env) => {
    const db = createDbFromClient(createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    }))
    return createServer(db, env.AUTH_SECRET)
  },
})
```

Auth is middleware inside `server-core` — `createBaseServer` calls `validateSession` internally.
Apps never import from `packages/auth` directly. The tRPC context carries the already-validated
user. All protected procedures share the `protectedProcedure` middleware from `server-core`.
Router tests use `createCallerFactory` with an in-memory SQLite database.

---

## Shared Client Pattern (V2)

Every app client uses `packages/ui` instead of copy-pasting boilerplate.

```typescript
// apps/<app>/client/src/main.tsx  — 3 lines, not 20
import { renderApp } from '@tabletop-tools/ui'
import { App } from './App'
renderApp(App)

// apps/<app>/client/src/App.tsx
import { AuthScreen, AppShell, ErrorBoundary } from '@tabletop-tools/ui'
import { trpc, trpcClient, queryClient } from './lib/trpc'

export function App() {
  // ... app-specific UI, using shared components
}

// apps/<app>/client/tailwind.config.ts  — 4 lines, not 28
import { tailwindPreset } from '@tabletop-tools/ui'
export default {
  presets: [tailwindPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
}
```

---

## Shared UI Design System

**Component library:** shadcn/ui + Tailwind CSS — components you own, not a dependency.
Built on Radix UI primitives. TypeScript-native, Vite-compatible. Include only what you use.

**Typography:** Geist — clean, modern, readable at small sizes.

**Color tokens (all apps use these via the shared Tailwind preset):**
```
Background:    slate-950  (#0f172a)  — near black
Surface:       slate-900  (#0f172a)  — cards, panels
Border:        slate-800  (#1e293b)  — subtle separation
Text:          slate-100  (#f1f5f9)  — primary
Muted text:    slate-400  (#94a3b8)  — labels, secondary

Accent:        amber-400  (#fbbf24)  — buttons, highlights, active states
```

App-specific result colors (defined per app, not here).

---

## Auth Routing (Path-Based)

- **Prod** (`apps/auth-server/src/worker.ts`): Better Auth configured with `basePath: '/auth/api/auth'`.
  Workers Route delivers requests at `/auth/**`. CORS restricted to `https://tabletop-tools.net`.
- **Dev** (`apps/auth-server/src/index.ts`): Default basePath `/api/auth`, port 3000.
- `AUTH_BASE_URL` in wrangler.toml: `https://tabletop-tools.net` (no `/auth` suffix).
- Client `VITE_AUTH_SERVER_URL=https://tabletop-tools.net/auth/api/auth`.
- Cookie: `__Secure-better-auth.session_token` on HTTPS, `better-auth.session_token` on HTTP.
  `validateSession` verifies HMAC signature before accepting the token (V2 fix).
- Cookie `path: /` — shared across all apps on same origin.

---

## Rules for Every Session

- Plan before touching anything — understand every layer first.
- No features that aren't needed yet.
- Validate statistically before claiming anything.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.

---

## Security & Authentication

**Auth is middleware, not application code.** Session validation runs inside `server-core`
before any app code sees the request. Apps receive `ctx.user` pre-populated and never import
from `packages/auth` directly.

- `createBaseServer` accepts `db` and `secret`, calls `validateSession` internally
- Apps opt into auth by using `protectedProcedure` — that's the entire auth surface area
- Apps that need extra context (storage, adminEmails) use `extendContext`
- One implementation, one place to audit, tested once in `server-core`

**Why middleware, not utility function:** If Express, Rails, Django, and ASP.NET all handle
auth as built-in middleware, so should we. Don't follow tRPC tutorial patterns that inline
auth in `createContext` — follow 30 years of web application architecture. Security-critical
code should never be scattered across 7 app boundaries.

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

Tests live next to the code they test (`foo.ts` / `foo.test.ts`). Pure functions
(stats, algorithms, business logic) are always tested in isolation before wiring into
tRPC routers. Routers are tested using `createCallerFactory` against an in-memory
SQLite database — no mocks for the database layer.

The specific test file structure for each app is documented in that app's own CLAUDE.md.

**Platform total: 1,427 unit tests, all passing.** Plus 36 Playwright E2E browser tests.

---

## E2E Browser Tests (Playwright)

See `e2e/CLAUDE.md` for full conventions.

```bash
# Against production
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test

# Against local dev
cd e2e && pnpm test
```

---

## V2 Implementation Status

All 8 phases of the V1 → V2 migration are complete:

1. **DB migration** — 27 indexes, 4 unique constraints, 23 cascading deletes ✅
2. **`packages/auth` hardening** — HMAC verification, timing-safe comparison, custom scrypt params ✅
3. **`packages/server-core` creation** — base tRPC, createBaseServer, Worker handler, ID gen (16 tests) ✅
4. **`packages/ui` expansion** — AuthScreen, AppShell, ErrorBoundary, auth/tRPC factories, Tailwind preset (21 tests) ✅
5. **App server migration** — all 7 apps use server-core ✅
6. **App client migration** — all 8 apps use packages/ui ✅
7. **Per-app fixes** — TRPCError, authorization, SQL-first queries, dead code removal, R2 bindings ✅
8. **Client routing** — hash-based routing for tournament and new-meta ✅
9. **Deployment verification** — pending (requires Cloudflare credentials)
