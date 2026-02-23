import { createClient } from '@libsql/client/web'
import { createAuth } from '@tabletop-tools/auth'
import { createDbFromClient } from '@tabletop-tools/db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  AUTH_SECRET: string
  AUTH_BASE_URL: string
  TRUSTED_ORIGINS: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    })
    const db = createDbFromClient(client)

    const trustedOrigins = env.TRUSTED_ORIGINS
      ? env.TRUSTED_ORIGINS.split(',')
      : []

    const auth = createAuth(
      db,
      env.AUTH_BASE_URL ?? 'https://auth.tabletop-tools.workers.dev',
      trustedOrigins,
      env.AUTH_SECRET,
    )

    const app = new Hono()
    app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: true }))
    app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw))
    app.get('/health', (c) => c.json({ status: 'ok' }))

    return app.fetch(request, env)
  },
}
