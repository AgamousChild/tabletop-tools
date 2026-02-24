# CLAUDE.md — packages/server-core

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This Is

`server-core` is the shared foundation for every app server in the platform. Eliminates
the 7x duplication of `trpc.ts`, `server.ts`, `worker.ts`, and `index.ts` that existed in V1.

Provides:

1. **Base tRPC setup** — Context type, router, publicProcedure, protectedProcedure, createCallerFactory
2. **Server factory** — Hono + CORS + tRPC handler in one function call
3. **Worker handler** — Module-scope caching for Cloudflare Workers
4. **Dev server factory** — `@hono/node-server` wrapper with port configuration
5. **ID generation** — Consistent nanoid across all apps

---

## File Structure

```
packages/server-core/
  src/
    index.ts              <- barrel export
    trpc.ts               <- initTRPC, BaseContext, User, router, publicProcedure, protectedProcedure
    server.ts             <- createBaseServer() — Hono + CORS + tRPC fetchRequestHandler
    worker.ts             <- createWorkerHandler() — module-scope caching
    dev.ts                <- startDevServer() — @hono/node-server wrapper
    id.ts                 <- generateId() — nanoid (21 chars)
    trpc.test.ts          <- 6 tests
    server.test.ts        <- 6 tests
    worker.test.ts        <- 4 tests
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Exports

```typescript
// Types
export type User = { id: string; email: string; name: string }
export type BaseContext = { user: User | null; req: Request; db: Db }
export type BaseEnv = { TURSO_DB_URL: string; TURSO_AUTH_TOKEN: string }

// tRPC setup
export const router: typeof t.router
export const publicProcedure: typeof t.procedure
export const protectedProcedure  // rejects null user with UNAUTHORIZED
export const createCallerFactory: typeof t.createCallerFactory

// Factories
export function createBaseServer<TContext extends BaseContext>(opts: {
  router: AnyRouter
  createContext: (req: Request) => Promise<TContext>
}): Hono

export function createWorkerHandler<TEnv extends BaseEnv>(opts: {
  createApp: (env: TEnv) => Promise<Hono>
}): { fetch(request: Request, env: TEnv, ctx?: unknown): Promise<Response> }

export function startDevServer(opts: {
  port: number
  createApp: () => Promise<Hono>
}): void

export function generateId(): string  // nanoid, 21 chars
```

---

## How Apps Use server-core

Apps that need additional context (e.g., `gameContent`, `storage`, `adminEmails`) extend
`BaseContext` in their own `trpc.ts`:

```typescript
// apps/versus/server/src/trpc.ts
import { BaseContext, User, router, publicProcedure, protectedProcedure, createCallerFactory }
  from '@tabletop-tools/server-core'
type Context = BaseContext & { gameContent: GameContentAdapter }
// re-export everything for local router use
```

Apps without extended context (tournament, no-cheat with storage) can re-export directly.

Apps with unique middleware (admin's `adminProcedure`, new-meta's `adminProcedure`) define
those locally while importing the base procedures from server-core.

### Worker Pattern

```typescript
// apps/<app>/server/src/worker.ts
export default createWorkerHandler<Env>({
  createApp: async (env) => {
    const db = createDbFromClient(createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN }))
    return createServer(db)
  },
})
```

Module-scope `let cachedApp` inside `createWorkerHandler` ensures the DB client, Drizzle wrapper,
and Hono app are created once per isolate lifetime, not per request.

---

## Testing

**16 tests** across 3 files:

- `trpc.test.ts` (6): publicProcedure allows unauthenticated + authenticated access,
  protectedProcedure rejects unauthenticated with UNAUTHORIZED, passes user through context,
  User type shape, BaseContext type shape
- `server.test.ts` (6): serves tRPC at /trpc/*, CORS headers with credentials,
  preflight OPTIONS handling, authenticated context passing, 401 for protected without auth,
  404 for non-tRPC paths
- `worker.test.ts` (4): calls createApp on first request, reuses cached app on subsequent
  requests, independent caches per handler instance, 404 for unknown paths

All tests use in-memory SQLite. No mocks for the database layer.

```bash
cd packages/server-core && pnpm test
```
