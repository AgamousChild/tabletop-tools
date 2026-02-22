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

| App | Dir | Port | Status | Purpose |
|---|---|---|---|---|
| no-cheat | `apps/no-cheat` | 3001 | scaffold + schema done | Detect loaded dice via CV + statistics |
| versus | `apps/versus` | 3002 | not started | Combat simulator — unit vs unit math |
| list-builder | `apps/list-builder` | 3003 | not started | Meta list builder with live unit ratings |
| game-tracker | `apps/game-tracker` | 3004 | not started | Turn-by-turn match recorder |
| tournament | `apps/tournament` | 3005 | not started | Full tournament management platform |
| new-meta | `apps/new-meta` | 3006 | scaffold only | Warhammer 40K meta analytics |

Each app has its own `CLAUDE.md` with full spec, architecture, schema, and implementation plan.

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

No GW (Games Workshop) content is ever committed to this repository.

Unit profiles, weapon stats, ability text, and faction data are loaded at runtime from
BSData (community-maintained XML) or from operator-imported files. The platform adapts
to this data at startup — it does not store or version-control it.

Every app that touches 40K data routes through `packages/game-content` (the `GameContentAdapter`
boundary). Nothing from GW ever lands in the database schema or in committed source files.

---

## Shared Server Pattern

Every app server follows the same shape:

```
Hono HTTP server
  └── tRPC adapter mounted at /trpc
        ├── auth router        (shared — wraps Better Auth)
        ├── [app-specific routers]
        └── Drizzle → Turso   (shared DB client from packages/db)
```

- Auth is handled once in `packages/auth` and imported into every server
- DB client is shared from `packages/db` (Drizzle + libSQL)
- Each app server has its own `drizzle.config.ts` pointing at its own Turso DB URL
- tRPC context carries the authenticated user — routers enforce auth via middleware

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

Tests live next to the code they test (`foo.ts` / `foo.test.ts`). The specific test
file structure for each app is documented in that app's own CLAUDE.md.
