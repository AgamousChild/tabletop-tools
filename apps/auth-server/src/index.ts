import 'dotenv/config'

import { serve } from '@hono/node-server'
import { createAuth } from '@tabletop-tools/auth'
import { createDb } from '@tabletop-tools/db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

const trustedOrigins = process.env['TRUSTED_ORIGINS']
  ? process.env['TRUSTED_ORIGINS'].split(',')
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
      'http://localhost:5178',
    ]

const auth = createAuth(
  db,
  process.env['AUTH_BASE_URL'] ?? 'http://localhost:3000',
  trustedOrigins,
)

const app = new Hono()

app.use(
  '*',
  cors({
    origin: (origin) =>
      trustedOrigins.includes(origin) ? origin : trustedOrigins[0]!,
    credentials: true,
  }),
)

// All auth routes for the entire platform
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw))

app.get('/health', (c) => c.json({ status: 'ok' }))

serve({ fetch: app.fetch, port: 3000, hostname: '0.0.0.0' }, (info) => {
  console.log(`auth-server running at http://localhost:${info.port}`)
})
