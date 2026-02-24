# CLAUDE.md — Tabletop Tools Platform

> Read SOUL.md first. Every decision here flows from it.

---

## What This Platform Is

Tabletop Tools is a monorepo of tools for tabletop miniature wargamers. One login. Shared UI.
Each app deploys independently and does exactly one thing. The first app ships, then more follow.

---

## Monorepo Structure

```
tabletop-tools/
  packages/
    ui/             ← shared components, dark theme, Geist, shadcn
    auth/           ← shared Better Auth — one login across all tools
    db/             ← shared Turso schema and Drizzle client
    game-content/   ← GameContentAdapter boundary (zero GW content)
    game-data-store/← shared IndexedDB store for client-side game data + React hooks
  apps/
    gateway/        ← unified Cloudflare Pages project (landing page + tRPC proxies)
    data-import/    ← BSData importer (client-only SPA, no server)
    no-cheat/       ← dice cheat detection        (port 3001)
    versus/         ← combat simulator             (port 3002)
    list-builder/   ← meta list builder            (port 3003)
    game-tracker/   ← match tracker                (port 3004)
    tournament/     ← tournament manager           (port 3005)
    new-meta/       ← 40K meta analytics           (port 3006)
    admin/          ← platform admin dashboard     (port 3007)
  e2e/              ← Playwright browser tests (all apps, landing, auth flows)
```

All apps are served from a single origin: `tabletop-tools.net/<app>/`. The gateway
project builds all 8 client SPAs into `dist/<app>/` and deploys as one Cloudflare Pages
project. Pages Functions in the gateway proxy each app's `/trpc` calls to its Worker
via service bindings. Auth runs on a Workers Route at `tabletop-tools.net/auth/*`.

---

## App Registry

| App | Port | Tests | Status | Purpose |
|---|---|---|---|---|
| no-cheat | 3001 | 202 | Deployed | Detect loaded dice via CV + statistics |
| versus | 3002 | 84 | Deployed | Simulate 40K combat: hit/wound/save/damage |
| list-builder | 3003 | 64 | Deployed | Build lists with live meta ratings from GT data |
| game-tracker | 3004 | 45 | Deployed | Track matches turn-by-turn with photos |
| tournament | 3005 | 58 | Deployed | Swiss events: pairings, results, standings, ELO |
| new-meta | 3006 | 128 | Deployed | Meta analytics: win rates, Glicko-2 ratings |
| data-import | — | 17 | Deployed (client-only, no server) | BSData importer: fetch + parse XML → IndexedDB |
| admin | 3007 | 45 | Built | Platform dashboard: users, sessions, app stats, BSData, imports |

Each app has its own `CLAUDE.md` with full spec, architecture, schema, and implementation detail.

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
  searchUnits(opts: { faction?: string; query?: string }): Promise<UnitProfile[]>
  listFactions(): Promise<string[]>
}

// At server startup — operator sets BSDATA_DIR env var:
const gameContent = process.env.BSDATA_DIR
  ? new BSDataAdapter(process.env.BSDATA_DIR)   // loads BSData XML at startup
  : new NullAdapter()                            // returns empty responses (dev/test)
await gameContent.load()
```

**What this means in practice:**
- No `.cat` or `.gst` BSData XML files committed
- Faction strings entered by users are stored verbatim — never validated against GW data
- Army list text is stored raw — never parsed for GW content
- If `BSDATA_DIR` is unset, apps serve empty unit lists (not an error)
- `GameContentDisclaimer` UI component (in `packages/ui`) surfaces the data source to users

---

## Shared Server Pattern

Every app server follows this exact shape:

```typescript
// server/src/trpc.ts
export type Context = {
  user: User | null   // null = unauthenticated
  req: Request
  db: Db
  // app-specific additions (storage: R2Storage, gameContent: GameContentAdapter, …)
}

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

// server/src/server.ts
export function createServer(db: Db /*, …app-specific deps */) {
  const app = new Hono()
  app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: true }))
  app.all('/trpc/*', async (c) =>
    fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: async ({ req }) => {
        const user = await validateSession(db, req.headers)
        return { user, req, db }
      },
    }),
  )
  return app
}
```

Auth is handled by Better Auth HTTP routes mounted separately (not in tRPC). The tRPC context
carries the already-validated user. All protected procedures share the `protectedProcedure`
middleware pattern. Router tests use `createCallerFactory` with an in-memory SQLite database.

---

## Shared UI Design System

**Component library:** shadcn/ui + Tailwind CSS — components you own, not a dependency.
Built on Radix UI primitives. TypeScript-native, Vite-compatible. Include only what you use.

**Typography:** Geist — clean, modern, readable at small sizes.

**Color tokens (all apps use these):**
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

Tests live next to the code they test (`foo.ts` / `foo.test.ts`). Pure functions
(stats, algorithms, business logic) are always tested in isolation before wiring into
tRPC routers. Routers are tested using `createCallerFactory` against an in-memory
SQLite database — no mocks for the database layer.

The specific test file structure for each app is documented in that app's own CLAUDE.md.

**Platform total: 866 tests, all passing.**

---

## E2E Browser Tests (Playwright)

End-to-end tests exercise the full deployed application in a real browser. They catch
integration bugs (auth routing, CORS, Worker crashes) that unit tests cannot.

**Stack:** Playwright + Chromium. TypeScript-native, auto-waits, multi-browser support.

```
e2e/
  playwright.config.ts          ← 3 projects: auth-flow, public, authed
  global-setup.ts               ← creates test user → auth-state.json
  fixtures/
    auth.ts                     ← signUp / logIn / logOut / testEmail helpers
  specs/
    landing.spec.ts             ← landing page loads, 7 app cards link correctly
    auth.spec.ts                ← register, login, logout, session persistence
    cross-app-auth.spec.ts      ← login in one app → session carries to another
    no-cheat.spec.ts            ← auth gate → main screen, dice set UI
    versus.spec.ts              ← auth gate → simulator, faction selectors
    list-builder.spec.ts        ← auth gate → list builder, faction selector
    game-tracker.spec.ts        ← auth gate → main screen, new match button
    tournament.spec.ts          ← auth gate → main screen, create tournament button
    new-meta.spec.ts            ← NO auth gate → nav tabs, dashboard renders
    data-import.spec.ts         ← NO auth gate → repo config, load button
```

### Three Playwright Projects

| Project | Auth | What it tests |
|---|---|---|
| `auth-flow` | None (tests auth itself) | Register, login, logout, cross-app session |
| `public` | None (no auth needed) | Landing page, new-meta, data-import |
| `authed` | `storageState` from global-setup | All auth-gated apps (no-cheat, versus, list-builder, game-tracker, tournament) |

The `authed` project depends on `auth-flow` — auth-flow creates the session state
file that authed tests reuse.

### Running E2E Tests

```bash
# Against production
cd e2e && BASE_URL=https://tabletop-tools.net pnpm test

# Against local dev (start gateway or app dev servers first)
cd e2e && pnpm test

# Headed mode (see the browser)
cd e2e && pnpm test:headed

# Playwright UI mode (interactive debugging)
cd e2e && pnpm test:ui
```

### Targeting

- `BASE_URL` env var: defaults to `http://localhost:5173` for local dev
- Set to `https://tabletop-tools.net` for production
- Auth tests require a working auth endpoint (register + login)
