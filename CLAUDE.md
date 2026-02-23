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
  apps/
    no-cheat/       ← dice cheat detection        (port 3001)
    versus/         ← combat simulator             (port 3002)
    list-builder/   ← meta list builder            (port 3003)
    game-tracker/   ← match tracker                (port 3004)
    tournament/     ← tournament manager           (port 3005)
    new-meta/       ← 40K meta analytics           (port 3006)
```

---

## App Registry

| App | Port | Tests | Status | Purpose |
|---|---|---|---|---|
| no-cheat | 3001 | 194 | Phases 1–10 done; deployment next | Detect loaded dice via CV + statistics |
| versus | 3002 | 80 | Phases 1–6 done; deployment next | Simulate 40K combat: hit/wound/save/damage |
| list-builder | 3003 | 58 | Phases 2–8 done; deployment next | Build lists with live meta ratings from GT data |
| game-tracker | 3004 | 39 | Phases 2–7 done; deployment next | Track matches turn-by-turn with photos |
| tournament | 3005 | 52 | Phases 2–9 done; deployment next | Swiss events: pairings, results, standings, ELO |
| new-meta | 3006 | 122 | Phases 1–6 done; deployment next | Meta analytics: win rates, Glicko-2 ratings |

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

**Platform total: 654 tests, all passing.**
