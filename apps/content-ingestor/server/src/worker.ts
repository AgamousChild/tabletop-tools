/**
 * Content Ingestor Worker — discovers and processes 40K content into brain nodes.
 *
 * Daily cron: crawl active sources → discover new URLs → process through pipeline.
 * Manual: add sources or trigger ingest via admin UI.
 */
import { createClient } from '@libsql/client'
import { createDbFromClient, ingestContent, ingestSources } from '@tabletop-tools/db'
import { generateId } from '@tabletop-tools/server-core'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { discoverContent } from './lib/discover'
import { parseGladiaCallback } from './lib/gladia'
import { processDiscovered } from './lib/process'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  GLADIA_API_KEY: string
  ANTHROPIC_API_KEY: string
  SYNC_SECRET?: string
  /**
   * Shared secret for the public Gladia webhook (POST /ingest/callback).
   * Required — not optional like SYNC_SECRET — because this route is the
   * only one reachable by an external, unauthenticated third party
   * (Gladia's callback caller can't send an Authorization header). Deploy
   * prerequisite: `wrangler secret put WEBHOOK_SECRET` before shipping this
   * Worker, or all Gladia callbacks will 401.
   */
  WEBHOOK_SECRET: string
  BRAIN_BUCKET: R2Bucket
  BRAIN_INDEX: VectorizeIndex
  AI: Ai
}

function createDb(env: Env) {
  return createDbFromClient(
    createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    }),
  )
}

/**
 * Bearer-token auth for the content-ingestor admin routes.
 *
 * The previous implementation returned `true` when SYNC_SECRET was unset,
 * on the theory that "no secret means dev, so allow it." That's the exact
 * D2-06 anti-pattern: a route that looks authenticated but silently opens
 * in any environment where the secret was accidentally removed — turning
 * every admin action (discover, process, add-source, patch-source, list-
 * sources/content) into an unauth surface. Prod inherited this open shape
 * for weeks (verified 2026-07-13: HTTP 200 with no auth). Fail closed
 * instead — no secret = 401 with a loud console.error, matching how the
 * Gladia webhook (checkWebhookToken) already behaves.
 *
 * Callers: the admin worker's stats.ts routers thread env.SYNC_SECRET into
 * every service-binding fetch via `serviceHeaders(ctx.syncSecret)`. Prod
 * deploy prerequisite: `wrangler secret put SYNC_SECRET` on both this
 * worker and the admin worker with the same value, before shipping.
 */
function checkAuth(c: { env: Env; req: { header(name: string): string | undefined } }): boolean {
  if (!c.env.SYNC_SECRET) {
    console.error(
      'checkAuth: SYNC_SECRET is unset — rejecting all admin requests. Run `wrangler secret put SYNC_SECRET`.',
    )
    return false
  }
  const auth = c.req.header('Authorization')
  return auth === `Bearer ${c.env.SYNC_SECRET}`
}

/**
 * SHA-256 digest of a UTF-8 string, as a hex string.
 */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time string comparison to avoid leaking WEBHOOK_SECRET via
 * response-timing side channels. Compares byte-by-byte over the full
 * fixed length of both inputs so the operation count doesn't depend on
 * where (or whether) a mismatch occurs.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Constant-*length* comparison of two strings of potentially different
 * length, without leaking either string's length via comparison timing.
 * SHA-256-hashes both sides first — the digest is always 64 hex chars
 * regardless of input length — then runs a fixed-length constant-time
 * compare on the digests. This is what closes the length side-channel that
 * a plain byte-by-byte compare over max(a.length, b.length) still leaks
 * (iteration count varies with input length even if the comparison itself
 * doesn't short-circuit).
 */
async function timingSafeEqualHashed(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([sha256Hex(a), sha256Hex(b)])
  return timingSafeEqual(hashA, hashB)
}

/**
 * Auth check for the public Gladia webhook — separate from `checkAuth`
 * (Bearer-token, internal admin routes) because Gladia can't send an
 * Authorization header; it only supports a callback URL. The shared secret
 * travels as a `?token=` query param appended when the callback URL is
 * registered with Gladia (see submitTranscription in lib/gladia.ts).
 *
 * Query-param tradeoff: `submitTranscription`'s request to Gladia's v2
 * pre-recorded API (lib/gladia.ts) sends only `callback_url` as a plain
 * string in the JSON body — there is no `callback_headers` (or similarly
 * named) field anywhere in that request, and nothing else in this codebase
 * indicates Gladia supports attaching custom headers to its callback
 * request. Absent evidence that header-based delivery is available, the
 * token stays in the URL. Concretely, that means the token can appear in
 * places a header wouldn't: Cloudflare Worker request logs, Gladia's own
 * access logs, and browser history if the URL is ever opened manually.
 * Rotation: `wrangler secret put WEBHOOK_SECRET` to set a new value, then
 * re-register every outstanding callback by re-submitting any in-flight
 * transcription jobs (the old token stops validating immediately — in-
 * flight Gladia jobs using the old callback URL will 401 until re-created).
 *
 * Unlike `checkAuth`, this does NOT fall open when the secret is unset —
 * this route is reachable by anyone on the internet who discovers the URL,
 * so a missing secret must fail closed (401) with a loud console.error,
 * not silently accept every callback.
 */
export async function checkWebhookToken(c: {
  env: Env
  req: { query(name: string): string | undefined }
}): Promise<boolean> {
  if (!c.env.WEBHOOK_SECRET) {
    console.error(
      'checkWebhookToken: WEBHOOK_SECRET is unset — rejecting all callbacks. Run `wrangler secret put WEBHOOK_SECRET`.',
    )
    return false
  }
  const token = c.req.query('token')
  if (!token) return false
  return timingSafeEqualHashed(token, c.env.WEBHOOK_SECRET)
}

let cachedApp: Hono<{ Bindings: Env }> | null = null

export function getApp() {
  if (cachedApp) return cachedApp
  const app = new Hono<{ Bindings: Env }>()

  app.get('/health', (c) => c.json({ status: 'ok' }))

  // ── Sources ───────────────────────────────────────────────────────────────

  app.get('/sources', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const db = createDb(c.env)
    const sources = await db.select().from(ingestSources)
    return c.json(sources)
  })

  app.post('/sources', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const { name, url, type } = (await c.req.json()) as { name: string; url: string; type: string }
    if (!name || !url || !type) return c.json({ error: 'name, url, type required' }, 400)
    if (type !== 'youtube' && type !== 'web')
      return c.json({ error: 'type must be youtube or web' }, 400)

    const db = createDb(c.env)
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    await db.insert(ingestSources).values({
      id,
      name,
      url,
      type,
      active: 1,
      createdAt: new Date(),
    })

    return c.json({ id, status: 'created' })
  })

  app.patch('/sources/:id', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const id = c.req.param('id')
    const { active } = (await c.req.json()) as { active: boolean }
    const db = createDb(c.env)
    await db
      .update(ingestSources)
      .set({ active: active ? 1 : 0 })
      .where(eq(ingestSources.id, id))
    return c.json({ status: 'updated' })
  })

  // ── Content ───────────────────────────────────────────────────────────────

  app.get('/content', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const db = createDb(c.env)
    const sourceId = c.req.query('source')
    const limit = parseInt(c.req.query('limit') ?? '50', 10)

    const baseQuery = db
      .select({
        id: ingestContent.id,
        url: ingestContent.url,
        title: ingestContent.title,
        sourceId: ingestContent.sourceId,
        status: ingestContent.status,
        nodesExtracted: ingestContent.nodesExtracted,
        error: ingestContent.error,
        discoveredAt: ingestContent.discoveredAt,
        processedAt: ingestContent.processedAt,
      })
      .from(ingestContent)

    const rows = sourceId
      ? await baseQuery
          .where(eq(ingestContent.sourceId, sourceId))
          .orderBy(desc(ingestContent.discoveredAt))
          .limit(limit)
      : await baseQuery.orderBy(desc(ingestContent.discoveredAt)).limit(limit)

    return c.json(rows)
  })

  // ── Discovery + Processing ────────────────────────────────────────────────

  app.post('/discover', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const db = createDb(c.env)
    const results = await discoverContent(db)
    return c.json(results)
  })

  app.post('/process', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const db = createDb(c.env)
    const workerUrl = new URL(c.req.url)

    const result = await processDiscovered({
      db,
      gladiaKey: c.env.GLADIA_API_KEY,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      bucket: c.env.BRAIN_BUCKET,
      vectorize: c.env.BRAIN_INDEX,
      ai: c.env.AI,
      callbackUrl: `${workerUrl.origin}/ingest/callback?token=${c.env.WEBHOOK_SECRET}`,
    })
    return c.json(result)
  })

  // ── Manual ingest (ad-hoc URLs) ───────────────────────────────────────────

  app.post('/ingest/youtube', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const { url, sourceName } = (await c.req.json()) as { url: string; sourceName?: string }
    if (!url) return c.json({ error: 'url required' }, 400)

    const db = createDb(c.env)
    const sourceId = await ensureSource(db, sourceName, 'youtube')
    const contentId = generateId()

    await db.insert(ingestContent).values({
      id: contentId,
      url,
      title: null,
      sourceId,
      status: 'discovered',
      discoveredAt: Date.now(),
    })

    await processDiscovered({
      db,
      gladiaKey: c.env.GLADIA_API_KEY,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      bucket: c.env.BRAIN_BUCKET,
      vectorize: c.env.BRAIN_INDEX,
      ai: c.env.AI,
      callbackUrl: `${new URL(c.req.url).origin}/ingest/callback?token=${c.env.WEBHOOK_SECRET}`,
      batchLimit: 1,
    })

    return c.json({ status: 'triggered', contentId })
  })

  app.post('/ingest/web', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const { url, sourceName } = (await c.req.json()) as { url: string; sourceName?: string }
    if (!url) return c.json({ error: 'url required' }, 400)

    const db = createDb(c.env)
    const sourceId = await ensureSource(db, sourceName, 'web')
    const contentId = generateId()

    await db.insert(ingestContent).values({
      id: contentId,
      url,
      title: null,
      sourceId,
      status: 'discovered',
      discoveredAt: Date.now(),
    })

    await processDiscovered({
      db,
      gladiaKey: c.env.GLADIA_API_KEY,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      bucket: c.env.BRAIN_BUCKET,
      vectorize: c.env.BRAIN_INDEX,
      ai: c.env.AI,
      callbackUrl: `${new URL(c.req.url).origin}/ingest/callback?token=${c.env.WEBHOOK_SECRET}`,
      batchLimit: 1,
    })

    return c.json({ status: 'triggered', contentId })
  })

  // ── Gladia callback ───────────────────────────────────────────────────────

  app.post('/ingest/callback', async (c) => {
    if (!(await checkWebhookToken(c))) return c.json({ error: 'Unauthorized' }, 401)
    const body = await c.req.json()
    const parsed = parseGladiaCallback(body)

    if (!parsed.transcript) {
      console.error('Gladia callback error:', parsed.error)
      return c.json({ received: true, error: parsed.error })
    }

    const db = createDb(c.env)
    const [content] = await db
      .select()
      .from(ingestContent)
      .where(eq(ingestContent.gladiaJobId, parsed.id))
      .limit(1)

    if (!content) {
      console.warn('No ingest_content row for gladiaJobId:', parsed.id)
      return c.json({ received: true, error: 'No matching content row' })
    }

    await db
      .update(ingestContent)
      .set({ transcript: parsed.transcript, status: 'transcribed' })
      .where(eq(ingestContent.id, content.id))

    return c.json({ received: true, contentId: content.id, status: 'transcribed' })
  })

  // ── Jobs list (backward compat for admin UI) ──────────────────────────────

  app.get('/jobs', async (c) => {
    if (!checkAuth(c)) return c.json({ error: 'Unauthorized' }, 401)
    const db = createDb(c.env)
    const rows = await db
      .select({
        id: ingestContent.id,
        url: ingestContent.url,
        title: ingestContent.title,
        sourceId: ingestContent.sourceId,
        sourceType: ingestSources.type,
        sourceName: ingestSources.name,
        status: ingestContent.status,
        nodesExtracted: ingestContent.nodesExtracted,
        error: ingestContent.error,
        createdAt: ingestContent.discoveredAt,
      })
      .from(ingestContent)
      .innerJoin(ingestSources, eq(ingestContent.sourceId, ingestSources.id))
      .orderBy(desc(ingestContent.discoveredAt))
      .limit(20)
    return c.json(rows)
  })

  cachedApp = app
  return app
}

/**
 * Ensure a source exists for ad-hoc manual ingestion.
 * Creates an inactive source if none exists (won't be crawled by cron).
 */
async function ensureSource(
  db: ReturnType<typeof createDb>,
  name: string | undefined,
  type: string,
): Promise<string> {
  const sourceId = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'manual'

  const existing = await db
    .select({ id: ingestSources.id })
    .from(ingestSources)
    .where(eq(ingestSources.id, sourceId))
    .limit(1)
  if (existing.length === 0) {
    await db.insert(ingestSources).values({
      id: sourceId,
      name: name ?? 'Manual',
      url: 'manual',
      type,
      active: 0,
      createdAt: new Date(),
    })
  }
  return sourceId
}

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => getApp().fetch(req, env, ctx),

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = createDb(env)

    ctx.waitUntil(
      discoverContent(db).then(() =>
        processDiscovered({
          db,
          gladiaKey: env.GLADIA_API_KEY,
          anthropicKey: env.ANTHROPIC_API_KEY,
          bucket: env.BRAIN_BUCKET,
          vectorize: env.BRAIN_INDEX,
          ai: env.AI,
          // NOTE: 'content-ingestor' is a non-resolvable placeholder hostname —
          // pre-existing bug, out of scope for this fix. Token param appended
          // for consistency with the other 3 callbackUrl call sites.
          callbackUrl: `https://content-ingestor/ingest/callback?token=${env.WEBHOOK_SECRET}`,
        }),
      ),
    )
  },
}
