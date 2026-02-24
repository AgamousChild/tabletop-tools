import { validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { appRouter } from './routers/index.js'

export function createServer(db: Db, adminEmails: string[]) {
  const app = new Hono()

  app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: true }))

  app.all('/trpc/*', async (c) => {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: async ({ req }) => {
        const user = await validateSession(db, req.headers)
        return { user, req, db, adminEmails }
      },
    })
  })

  return app
}
