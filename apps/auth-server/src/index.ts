import 'dotenv/config'

import { serve } from '@hono/node-server'
import { buildResendEmailSender, createAuth } from '@tabletop-tools/auth'
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

// Local dev only — the worker.ts entry passes `env.AUTH_SECRET` directly.
// createAuth now fails loud when secret is missing (was silently falling
// back to a known dev secret, which downgraded prod on misconfigure), so
// the Node dev process provides its own dev fallback explicitly here.
const secret = process.env['AUTH_SECRET'] ?? 'dev-secret-change-in-production'
const emailSender = process.env['RESEND_API_KEY']
  ? buildResendEmailSender({
      apiKey: process.env['RESEND_API_KEY'],
      from: process.env['RESEND_FROM'] ?? 'noreply@tabletop-tools.net',
    })
  : undefined
const auth = createAuth(
  db,
  process.env['AUTH_BASE_URL'] ?? 'http://localhost:3000',
  trustedOrigins,
  secret,
  undefined,
  undefined,
  emailSender,
)

const app = new Hono()

app.use(
  '*',
  cors({
    origin: (origin) => (trustedOrigins.includes(origin) ? origin : trustedOrigins[0]!),
    credentials: true,
  }),
)

// All auth routes for the entire platform
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw))

app.get('/health', (c) => c.json({ status: 'ok' }))

serve({ fetch: app.fetch, port: 3000, hostname: '0.0.0.0' }, (info) => {
  console.log(`auth-server running at http://localhost:${info.port}`)
})
