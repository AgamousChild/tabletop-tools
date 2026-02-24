import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { AnyRouter } from '@trpc/server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { BaseContext } from './trpc'

export function createBaseServer<TContext extends BaseContext>(opts: {
  router: AnyRouter
  createContext: (req: Request) => Promise<TContext>
}): Hono {
  const app = new Hono()
  app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: true }))
  app.all('/trpc/*', async (c) =>
    fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: opts.router,
      createContext: ({ req }) => opts.createContext(req),
    }),
  )
  return app
}
