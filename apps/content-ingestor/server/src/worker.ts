import { Hono } from 'hono'
import { createClient } from '@libsql/client'
import { createDbFromClient, ingestJobs } from '@tabletop-tools/db'
import { startYoutubeIngest, completeYoutubeIngest, ingestWebArticle } from './lib/ingest'
import { parseGladiaCallback } from './lib/gladia'
import { desc } from 'drizzle-orm'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  GLADIA_API_KEY: string
  ANTHROPIC_API_KEY: string
  SYNC_SECRET?: string
  BRAIN_BUCKET: R2Bucket
  BRAIN_INDEX: VectorizeIndex
  AI: Ai
}

function createDb(env: Env) {
  return createDbFromClient(createClient({
    url: env.TURSO_DB_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  }))
}

function checkAuth(c: { env: Env; req: { header(name: string): string | undefined } }): boolean {
  if (!c.env.SYNC_SECRET) return true
  const auth = c.req.header('Authorization')
  return auth === `Bearer ${c.env.SYNC_SECRET}`
}

let cachedApp: Hono<{ Bindings: Env }> | null = null

function getApp() {
  if (cachedApp) return cachedApp
  const app = new Hono<{ Bindings: Env }>()

  app.get('/health', (c) => c.json({ status: 'ok' }))

  // Submit YouTube video for ingestion
  app.post('/ingest/youtube', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const { url, sourceName } = await c.req.json() as { url: string; sourceName?: string }
    if (!url) return c.json({ error: 'url required' }, 400)

    const db = createDb(c.env)
    const workerUrl = new URL(c.req.url)
    const callbackUrl = `${workerUrl.origin}/ingest/callback`

    const result = await startYoutubeIngest({
      url, sourceName, callbackUrl,
      gladiaKey: c.env.GLADIA_API_KEY,
      db,
    })
    return c.json(result)
  })

  // Submit web article for ingestion
  app.post('/ingest/web', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const { url, sourceName } = await c.req.json() as { url: string; sourceName?: string }
    if (!url) return c.json({ error: 'url required' }, 400)

    const db = createDb(c.env)
    const result = await ingestWebArticle({
      url, sourceName, db,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      bucket: c.env.BRAIN_BUCKET,
      vectorize: c.env.BRAIN_INDEX,
      ai: c.env.AI,
    })
    return c.json(result)
  })

  // Gladia callback — receives completed transcript
  // Respond immediately, process in background via waitUntil
  app.post('/ingest/callback', async (c) => {
    const body = await c.req.json()
    const parsed = parseGladiaCallback(body)

    if (!parsed.transcript) {
      console.error('Gladia callback error:', parsed.error)
      return c.json({ received: true, error: parsed.error })
    }

    const db = createDb(c.env)
    const env = c.env

    // Process in background — respond to Gladia immediately
    c.executionCtx.waitUntil(
      completeYoutubeIngest({
        gladiaJobId: parsed.id,
        transcript: parsed.transcript,
        db,
        anthropicKey: env.ANTHROPIC_API_KEY,
        bucket: env.BRAIN_BUCKET,
        vectorize: env.BRAIN_INDEX,
        ai: env.AI,
      }).catch(err => console.error('Background ingest failed:', err))
    )

    return c.json({ received: true })
  })

  // List recent jobs
  app.get('/jobs', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const db = createDb(c.env)
    const jobs = await db.select().from(ingestJobs).orderBy(desc(ingestJobs.createdAt)).limit(20)
    return c.json(jobs)
  })

  cachedApp = app
  return app
}

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => getApp().fetch(req, env, ctx),
}
