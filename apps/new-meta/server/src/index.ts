import 'dotenv/config'

import { startDevServer } from '@tabletop-tools/server-core'
import { createDb } from '@tabletop-tools/db'

import { createServer } from './server.js'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

startDevServer({
  port: 3006,
  createApp: async () => createServer(db, [], process.env['AUTH_SECRET'] ?? 'dev-secret-change-in-production'),
})
