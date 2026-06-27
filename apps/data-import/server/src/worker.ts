/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-indexeddb-game-data.md — IndexedDB game data schema
 */
import { createDb, type Db } from '@tabletop-tools/db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { runSync } from './lib/sync'
import type { Env } from './types'

type HonoEnv = { Bindings: Env }

const app = new Hono<HonoEnv>()

/** Returns a db client when both secrets are present; undefined otherwise (R2-only mode). */
function dbFromEnv(env: Env): Db | undefined {
  if (env.TURSO_DB_URL && env.TURSO_AUTH_TOKEN) {
    return createDb({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })
  }
  return undefined
}

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
  let skipProducers = false
  try {
    const body = await c.req.json<{ force?: boolean; skipProducers?: boolean }>()
    force = body.force === true
    skipProducers = body.skipProducers === true
  } catch {
    /* no body or not JSON — that's fine */
  }
  // Also honor query params so workflows can curl /sync?skipProducers=true
  // without a JSON body.
  if (c.req.query('skipProducers') === 'true') skipProducers = true
  if (c.req.query('force') === 'true') force = true

  const result = await runSync(
    c.env.GAME_DATA_BUCKET,
    c.env.GITHUB_TOKEN,
    force,
    dbFromEnv(c.env),
    {
      skipProducers,
    },
  )
  return c.json(result)
})

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runSync(env.GAME_DATA_BUCKET, env.GITHUB_TOKEN, false, dbFromEnv(env)))
  },
}
