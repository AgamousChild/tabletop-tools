import 'dotenv/config'

import { createDb } from '@tabletop-tools/db'
import { startDevServer } from '@tabletop-tools/server-core'

import { createNullR2Storage } from './lib/storage/r2'
import { createServer } from './server'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

startDevServer({
  port: 3004,
  createApp: async () =>
    createServer(
      db,
      createNullR2Storage(),
      process.env['AUTH_SECRET'] ?? 'dev-secret-change-in-production',
    ),
})
