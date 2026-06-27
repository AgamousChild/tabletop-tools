/**
 * Read-only proxy in front of the data-import R2 bucket. Serves the manifest
 * and per-file JSON to the data-import client and any consumer that reads
 * raw game data from R2.
 *
 * The sync pipeline (Wahapedia + BSData + MFM + producers) runs in GitHub
 * Actions, not here — see .github/workflows/sync-data.yml and
 * apps/data-import/server/src/sync-cli.ts. Cloudflare Workers can't fit the
 * full sync in one invocation's CPU budget, and per CLAUDE.md Rule 9 that's
 * not the right place for offline batch work anyway.
 *
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-game-data.md — IndexedDB game data schema
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { Env } from './types'

type HonoEnv = { Bindings: Env }

const app = new Hono<HonoEnv>()

app.use('*', async (c, next) => {
  const origin = c.env.CORS_ORIGIN || 'https://tabletop-tools.net'
  return cors({ origin, allowMethods: ['GET'] })(c, next)
})

app.get('/manifest.json', async (c) => {
  const obj = await c.env.GAME_DATA_BUCKET.get('manifest.json')
  if (!obj) {
    return c.json({ error: 'No manifest found — sync workflow has not run yet' }, 404)
  }
  c.header('Cache-Control', 'public, max-age=300')
  return c.json(await obj.json())
})

app.get('/data/:file', async (c) => {
  const file = c.req.param('file')
  if (!file.endsWith('.json')) {
    return c.json({ error: 'Invalid file' }, 400)
  }
  const obj = await c.env.GAME_DATA_BUCKET.get(`data/${file}`)
  if (!obj) {
    return c.json({ error: 'File not found' }, 404)
  }
  c.header('Cache-Control', 'public, max-age=3600')
  c.header('Content-Type', 'application/json')
  return c.body(await obj.text())
})

export default {
  fetch: app.fetch,
}
