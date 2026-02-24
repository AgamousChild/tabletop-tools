import 'dotenv/config'

import { startDevServer } from '@tabletop-tools/server-core'
import { createDb } from '@tabletop-tools/db'

import { createServer } from './server'
import { createNullR2Storage } from './lib/storage/r2'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

startDevServer({
  port: 3004,
  createApp: async () => createServer(db, createNullR2Storage()),
})
