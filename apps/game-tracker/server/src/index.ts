import 'dotenv/config'

import { serve } from '@hono/node-server'
import { createDb } from '@tabletop-tools/db'

import { createServer } from './server'
import { createR2StorageFromEnv } from './lib/storage/r2'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

const storage = createR2StorageFromEnv()

const app = createServer(db, storage)

serve({ fetch: app.fetch, port: 3004, hostname: '0.0.0.0' }, (info) => {
  console.log(`game-tracker server running at http://localhost:${info.port}`)
})
