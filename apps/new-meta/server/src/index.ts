import 'dotenv/config'

import { serve } from '@hono/node-server'
import { createDb } from '@tabletop-tools/db'

import { createServer } from './server.js'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

const app = createServer(db)

serve({ fetch: app.fetch, port: 3006, hostname: '0.0.0.0' }, (info) => {
  console.log(`new-meta server running at http://localhost:${info.port}`)
})
