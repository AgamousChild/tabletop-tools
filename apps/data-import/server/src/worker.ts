/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-game-data.md — IndexedDB game data schema
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { runSync } from './lib/sync'

type HonoEnv = { Bindings: Env }

const app = new Hono<HonoEnv>()

app.use('*', async (c, next) => {
  const origin = c.env.CORS_ORIGIN || 'https://tabletop-tools.net'
  return cors({ origin, allowMethods: ['GET', 'POST'] })(c, next)
})

app.get('/manifest.json', async (c) => {
  const obj = await c.env.GAME_DATA_BUCKET.get('manifest.json')
  if (!obj) {
    return c.json({ error: 'No manifest found — run sync first' }, 404)
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

app.post('/sync', async (c) => {
  const secret = c.env.SYNC_SECRET
  if (secret) {
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }

  let force = false
  try {
    const body = await c.req.json<{ force?: boolean }>()
    force = body.force === true
  } catch { /* no body or not JSON — that's fine */ }
  const result = await runSync(c.env.GAME_DATA_BUCKET, c.env.GITHUB_TOKEN, force)
  return c.json(result)
})

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(runSync(env.GAME_DATA_BUCKET, env.GITHUB_TOKEN))
  },
}
