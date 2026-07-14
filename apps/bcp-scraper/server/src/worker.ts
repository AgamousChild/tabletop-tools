/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-turso.md — Turso database schema (meta_events, bcp_scrape_jobs, etc.)
 */
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { createWorkerHandler } from '@tabletop-tools/server-core'
import { Hono } from 'hono'

import { parsePendingLists } from './lib/parse-lists'
import { runPipeline } from './lib/pipeline'
import { runScrape } from './lib/scrape'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  BCP_EMAIL: string
  BCP_PASSWORD: string
  SYNC_SECRET?: string
}

function createDb(env: Env) {
  return createDbFromClient(
    createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    }),
  )
}

const handler = createWorkerHandler<Env>({
  createApp: async (env) => {
    const app = new Hono()

    app.get('/health', (c) => c.json({ status: 'ok' }))

    app.post('/scrape', async (c) => {
      // Fail closed: the prior guard `if (env.SYNC_SECRET)` skipped auth
      // entirely when the secret was unset. Verified 2026-07-13 that the
      // deployed bcp-scraper worker had SYNC_SECRET unset — anyone on the
      // internet could POST /scrape and start a real BCP session. Same
      // D2-06 anti-pattern flagged for content-ingestor/checkAuth. No
      // secret = 401 with a loud console.error, so misconfig surfaces
      // instead of hiding as "the endpoint just works for everyone."
      if (!env.SYNC_SECRET) {
        console.error(
          '/scrape: SYNC_SECRET is unset — rejecting request. Run `wrangler secret put SYNC_SECRET`.',
        )
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const auth = c.req.header('Authorization')
      if (auth !== `Bearer ${env.SYNC_SECRET}`) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const db = createDb(env)

      const result = await runScrape(
        {
          bcpEmail: env.BCP_EMAIL,
          bcpPassword: env.BCP_PASSWORD,
          db,
        },
        'manual',
      )

      await runPipeline(db)
      await parsePendingLists(db)

      return c.json(result)
    })

    return app
  },
})

export default {
  fetch: handler.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = createDb(env)
    ctx.waitUntil(
      runScrape(
        {
          bcpEmail: env.BCP_EMAIL,
          bcpPassword: env.BCP_PASSWORD,
          db,
        },
        'cron',
      )
        .then(() => runPipeline(db))
        .then(() => parsePendingLists(db)),
    )
  },
}
