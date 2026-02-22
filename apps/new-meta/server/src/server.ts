import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { Auth } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'
import { appRouter } from './routers/index.js'

export function createServer(auth: Auth, db: Db) {
  const app = new Hono()

  app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: true }))

  app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw))

  app.all('/trpc/*', async (c) => {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: async ({ req }) => {
        const session = await auth.api.getSession({ headers: req.headers })
        return {
          user: session?.user
            ? { id: session.user.id, email: session.user.email, name: session.user.name }
            : null,
          req,
          db,
        }
      },
    })
  })

  return app
}
