import { type KVLike, validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'
import type { AnyRouter } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { BaseContext } from './trpc'

/**
 * Default allowed origin for CORS. The platform ships as a single origin
 * (auth-server, all app workers, and the SPA gateway all live under
 * tabletop-tools.net), so the lock-down is safe. Override via
 * `trustedOrigins` for local dev (Vite serves the SPA on 5173, etc.).
 */
const DEFAULT_TRUSTED_ORIGIN = 'https://tabletop-tools.net'

export function createBaseServer<TContext extends BaseContext>(opts: {
  router: AnyRouter
  db: Db
  secret: string
  /**
   * Optional KV binding for session lookup. When present, this is the same
   * namespace Better Auth writes sessions to via `secondaryStorage` on the
   * auth-server side. Every request tries KV before falling back to Turso,
   * cutting a DB round-trip off the hot path. See validateSession() for the
   * KV key/value shape.
   */
  sessionKV?: KVLike
  /**
   * Origins allowed to make credentialed cross-origin requests. Defaults
   * to `[DEFAULT_TRUSTED_ORIGIN]`. The previous behaviour reflected every
   * incoming origin with `credentials: true` — modern browsers block that
   * for cross-site fetch when the session cookie is SameSite=Lax, but the
   * shape was still an "open door with a screen" that violated D2-06
   * (fail loud) and could leak data if the SameSite policy ever loosens.
   * Local dev overrides this to include the Vite dev ports.
   */
  trustedOrigins?: string[]
  extendContext?: (baseCtx: BaseContext) => TContext | Promise<TContext>
}): Hono {
  const app = new Hono()
  const allowedOrigins = opts.trustedOrigins ?? [DEFAULT_TRUSTED_ORIGIN]
  app.use(
    '*',
    cors({
      origin: (origin) => (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]!),
      credentials: true,
    }),
  )
  app.all('/trpc/*', async (c) =>
    fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: opts.router,
      createContext: async ({ req }) => {
        const baseCtx: BaseContext = {
          user: await validateSession(opts.db, req.headers, opts.secret, opts.sessionKV),
          req,
          db: opts.db,
        }
        return opts.extendContext ? opts.extendContext(baseCtx) : baseCtx
      },
    }),
  )
  return app
}
