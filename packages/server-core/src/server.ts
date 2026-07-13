import { type KVLike, validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'
import type { AnyRouter } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { BaseContext } from './trpc'

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
  extendContext?: (baseCtx: BaseContext) => TContext | Promise<TContext>
}): Hono {
  const app = new Hono()
  app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: true }))
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
