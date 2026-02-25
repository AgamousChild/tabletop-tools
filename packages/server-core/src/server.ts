import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { AnyRouter } from '@trpc/server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'

import type { BaseContext } from './trpc'

export function createBaseServer<TContext extends BaseContext>(opts: {
  router: AnyRouter
  db: Db
  secret: string
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
          user: await validateSession(opts.db, req.headers, opts.secret),
          req,
          db: opts.db,
        }
        return opts.extendContext ? opts.extendContext(baseCtx) : baseCtx
      },
    }),
  )
  return app
}
