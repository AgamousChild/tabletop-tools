import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createDb } from '@tabletop-tools/db'
import { createAuth } from '@tabletop-tools/auth'
import { createServer } from './server'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

const trustedOrigins = process.env['TRUSTED_ORIGINS']
  ? process.env['TRUSTED_ORIGINS'].split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']

const auth = createAuth(db, 'http://localhost:3003', trustedOrigins)
const app = createServer(auth, db)

serve({ fetch: app.fetch, port: 3003, hostname: '0.0.0.0' }, (info) => {
  console.log(`ListBuilder server running at http://localhost:${info.port}`)
})
