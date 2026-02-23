import 'dotenv/config'

import { serve } from '@hono/node-server'
import { createDb } from '@tabletop-tools/db'
import { BSDataAdapter, NullAdapter } from '@tabletop-tools/game-content'

import { createServer } from './server'

const db = createDb({
  url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
  authToken: process.env['TURSO_AUTH_TOKEN'],
})

const gameContent = process.env['BSDATA_DIR']
  ? new BSDataAdapter({ dataDir: process.env['BSDATA_DIR'] })
  : new NullAdapter()

await gameContent.load()

const app = createServer(db, gameContent)

serve({ fetch: app.fetch, port: 3003, hostname: '0.0.0.0' }, (info) => {
  console.log(`list-builder server running at http://localhost:${info.port}`)
})
