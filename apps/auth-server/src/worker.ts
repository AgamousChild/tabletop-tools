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

let cachedApp: Hono | null = null

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!cachedApp) {
      const client = createClient({
        url: env.TURSO_DB_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      })
      const db = createDbFromClient(client)

      const allowedOrigins = env.TRUSTED_ORIGINS
        ? env.TRUSTED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
        : ['https://tabletop-tools.net']

      const auth = createAuth(
        db,
        env.AUTH_BASE_URL ?? 'https://tabletop-tools.net',
        allowedOrigins,
        env.AUTH_SECRET,
        '/auth/api/auth',
      )

      const app = new Hono()
      app.use(
        '*',
        cors({
          origin: (origin) =>
            allowedOrigins.includes(origin) ? origin : allowedOrigins[0]!,
          credentials: true,
        }),
      )
      app.get('/auth/health', (c) => c.json({ status: 'ok' }))
      // Workers Route delivers requests at /auth/** — basePath matches directly
      app.on(['GET', 'POST'], '/auth/api/auth/**', (c) => auth.handler(c.req.raw))

      cachedApp = app
    }

    return cachedApp.fetch(request, env)
  },
}
