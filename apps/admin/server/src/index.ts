import 'dotenv/config'

import { startDevServer } from '@tabletop-tools/server-core'
import { createDb } from '@tabletop-tools/db'

import { createServer } from './server.js'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

const adminEmails = (process.env['ADMIN_EMAILS'] ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

startDevServer({
  port: 3007,
  createApp: async () => createServer(db, adminEmails, process.env['AUTH_SECRET'] ?? 'dev-secret-change-in-production'),
})
