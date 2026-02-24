import 'dotenv/config'

import { startDevServer } from '@tabletop-tools/server-core'
import { createDb } from '@tabletop-tools/db'
import { BSDataAdapter, NullAdapter } from '@tabletop-tools/game-content'

import { createServer } from './server.js'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

const gameContent = process.env['BSDATA_DIR']
  ? new BSDataAdapter({ dataDir: process.env['BSDATA_DIR'] })
  : new NullAdapter()

await gameContent.load()

startDevServer({
  port: 3002,
  createApp: async () => createServer(db, gameContent),
})
