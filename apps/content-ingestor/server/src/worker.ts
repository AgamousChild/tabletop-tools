import { Hono } from 'hono'
import { createClient } from '@libsql/client'
import { createDbFromClient, ingestJobs } from '@tabletop-tools/db'
import { startYoutubeIngest, saveTranscript, processJob, ingestWebArticle } from './lib/ingest'
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

  app.get('/test-r2', async (c) => {
    try {
      // Test 1: basic write
      await c.env.BRAIN_BUCKET.put('_test', 'hello ' + Date.now())
      const obj = await c.env.BRAIN_BUCKET.get('_test')
      const text = obj ? await obj.text() : 'null'
      await c.env.BRAIN_BUCKET.delete('_test')

      // Test 2: read community.json size
      const community = await c.env.BRAIN_BUCKET.get('nodes/community.json')
      const communityText = community ? await community.text() : '[]'
      const parsed = JSON.parse(communityText)

      // Test 3: write a known test node to community.json
      parsed.push({ id: 'community:test-r2-write-' + Date.now(), layer: 'community', category: 'tactic', title: 'R2 Write Test', content: 'test', summary: 'test', sources: [], refs: [], version: 1, keywords: ['test'], edition: '11th' })
      await c.env.BRAIN_BUCKET.put('nodes/community.json', JSON.stringify(parsed))

      // Test 4: re-read and verify
      const verify = await c.env.BRAIN_BUCKET.get('nodes/community.json')
      const verifyText = verify ? await verify.text() : '[]'
      const verifyParsed = JSON.parse(verifyText)

      return c.json({ r2Write: 'ok', readBack: text, before: parsed.length - 1, after: verifyParsed.length })
    } catch (err) {
      return c.json({ r2Write: 'FAIL', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : '' })
    }
  })

  // Step 0: Submit YouTube URL to Gladia
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

  // Step 0 (web): Fetch article + extract + commit in one shot (articles are fast)
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

  // Step 1: Gladia callback — save transcript to DB (fast, <1s)
  app.post('/ingest/callback', async (c) => {
    const body = await c.req.json()
    const parsed = parseGladiaCallback(body)

    if (!parsed.transcript) {
      console.error('Gladia callback error:', parsed.error)
      return c.json({ received: true, error: parsed.error })
    }

    const db = createDb(c.env)
    const { jobId } = await saveTranscript({
      gladiaJobId: parsed.id,
      transcript: parsed.transcript,
      db,
    })

    return c.json({ received: true, jobId, status: 'transcribed' })
  })

  // Step 2: Extract + commit (Claude API → R2 + Vectorize)
  app.post('/ingest/process/:id', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const jobId = c.req.param('id')
    const db = createDb(c.env)

    try {
      const result = await processJob({
        jobId, db,
        anthropicKey: c.env.ANTHROPIC_API_KEY,
        bucket: c.env.BRAIN_BUCKET,
        vectorize: c.env.BRAIN_INDEX,
        ai: c.env.AI,
      })
      return c.json(result)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
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
