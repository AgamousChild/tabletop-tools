/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-turso.md — Turso database schema (meta_events, bcp_scrape_jobs, etc.)
 */
import { Hono } from 'hono'
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { runScrape } from './lib/scrape'
import { runPipeline } from './lib/pipeline'
import { parsePendingLists } from './lib/parse-lists'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  BCP_EMAIL: string
  BCP_PASSWORD: string
  SYNC_SECRET?: string
}

function createDb(env: Env) {
  return createDbFromClient(createClient({
    url: env.TURSO_DB_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  }))
}

let cachedApp: Hono<{ Bindings: Env }> | null = null

function getApp() {
  if (cachedApp) return cachedApp

  const app = new Hono<{ Bindings: Env }>()

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.post('/scrape', async (c) => {
    if (c.env.SYNC_SECRET) {
      const auth = c.req.header('Authorization')
      if (auth !== `Bearer ${c.env.SYNC_SECRET}`) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    }

    const db = createDb(c.env)

    const result = await runScrape({
      bcpEmail: c.env.BCP_EMAIL,
      bcpPassword: c.env.BCP_PASSWORD,
      db,
    }, 'manual')

    await runPipeline(db)
    await parsePendingLists(db)

    return c.json(result)
  })

  cachedApp = app
  return app
}

export default {
  fetch: (req: Request, env: Env) => getApp().fetch(req, env),

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = createDb(env)
    ctx.waitUntil(
      runScrape({
        bcpEmail: env.BCP_EMAIL,
        bcpPassword: env.BCP_PASSWORD,
        db,
      }, 'cron').then(() => runPipeline(db)).then(() => parsePendingLists(db))
    )
  },
}
