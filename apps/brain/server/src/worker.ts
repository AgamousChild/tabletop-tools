import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import type { Node, NodeRef } from './lib/model'

type HonoEnv = { Bindings: Env }

const app = new Hono<HonoEnv>()

app.use('*', async (c, next) => {
  const origin = c.env.CORS_ORIGIN || 'https://tabletop-tools.net'
  return cors({ origin, allowMethods: ['GET', 'POST'] })(c, next)
})

// ── Data endpoints (serve from R2) ──────────────────────────────────────────

app.get('/manifest.json', async (c) => {
  const obj = await c.env.BRAIN_BUCKET.get('manifest.json')
  if (!obj) {
    return c.json({ error: 'No manifest found - run sync first' }, 404)
  }
  c.header('Cache-Control', 'public, max-age=300')
  return c.json(await obj.json())
})

app.get('/data/:path{.+}', async (c) => {
  const path = c.req.param('path')
  if (!path.endsWith('.json')) {
    return c.json({ error: 'Invalid file' }, 400)
  }
  const obj = await c.env.BRAIN_BUCKET.get(path)
  if (!obj) {
    return c.json({ error: 'File not found' }, 404)
  }
  c.header('Cache-Control', 'public, max-age=3600')
  c.header('Content-Type', 'application/json')
  return c.body(await obj.text())
})

// ── Search endpoint (Vectorize) ─────────────────────────────────────────────

app.post('/search', async (c) => {
  const body = await c.req.json<{
    query: string
    limit?: number
    filter?: {
      layer?: string
      category?: string
      factionId?: string
      phase?: string
    }
  }>()

  if (!body.query) {
    return c.json({ error: 'query is required' }, 400)
  }

  const limit = Math.min(body.limit ?? 10, 50)

  // Generate embedding for the query using Workers AI
  const embeddingResult = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [body.query],
  })

  const queryVector = embeddingResult.data[0]
  if (!queryVector) {
    return c.json({ error: 'Failed to generate embedding' }, 500)
  }

  // Build Vectorize filter from optional filters
  const filter: Record<string, string> = {}
  if (body.filter?.layer) filter.layer = body.filter.layer
  if (body.filter?.category) filter.category = body.filter.category
  if (body.filter?.factionId) filter.factionId = body.filter.factionId
  if (body.filter?.phase) filter.phase = body.filter.phase

  // Query Vectorize
  const results = await c.env.BRAIN_INDEX.query(queryVector, {
    topK: limit,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    returnMetadata: 'all',
  })

  return c.json({
    results: results.matches.map(m => ({
      id: m.id,
      score: m.score,
      title: m.metadata?.title,
      summary: m.metadata?.summary,
      layer: m.metadata?.layer,
      category: m.metadata?.category,
      factionId: m.metadata?.factionId,
      phase: m.metadata?.phase,
    })),
  })
})

// ── Q&A endpoint (RAG: Vectorize → R2 → Claude API) ────────────────────────

app.post('/ask', async (c) => {
  const body = await c.req.json<{
    question: string
    factionId?: string
    depth?: number
  }>()

  if (!body.question) {
    return c.json({ error: 'question is required' }, 400)
  }

  const apiKey = c.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return c.json({ error: 'Q&A not configured - ANTHROPIC_API_KEY not set' }, 503)
  }

  // 1. Embed the question
  const embeddingResult = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [body.question],
  })

  const queryVector = embeddingResult.data[0]
  if (!queryVector) {
    return c.json({ error: 'Failed to generate embedding' }, 500)
  }

  // 2. Search Vectorize for relevant nodes
  const filter: Record<string, string> = {}
  if (body.factionId) filter.factionId = body.factionId

  const searchResults = await c.env.BRAIN_INDEX.query(queryVector, {
    topK: 10,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    returnMetadata: 'all',
  })

  // 3. Fetch full node content from R2 for the top results
  const nodeIds = searchResults.matches.map(m => m.id)
  const nodeContent = await fetchNodesFromR2(c.env.BRAIN_BUCKET, nodeIds)

  // 4. Traverse refs to gather connected context (1 level deep by default)
  const depth = body.depth ?? 1
  const connectedNodes = await fetchConnectedNodes(
    c.env.BRAIN_BUCKET,
    nodeIds,
    depth,
  )

  // 5. Assemble context for Claude
  const context = assembleContext(nodeContent, connectedNodes)

  // 6. Call Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a Warhammer 40,000 rules expert. Answer questions using ONLY the rules context provided below. Always cite your sources. If the context doesn't contain enough information to answer confidently, say so.

When citing sources, use the format: (Source: [title], [page/section if available])

Be precise about game mechanics. If a rule has been errata'd or FAQ'd, mention the correction.`,
      messages: [
        {
          role: 'user',
          content: `Rules context:\n\n${context}\n\n---\n\nQuestion: ${body.question}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return c.json({ error: `Claude API error: ${response.status}`, details: err }, 502)
  }

  const claudeResponse = await response.json() as {
    content: Array<{ type: string; text: string }>
  }

  const answer = claudeResponse.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  // 7. Return attributed answer
  return c.json({
    answer,
    sources: nodeContent.map(n => ({
      id: n.id,
      title: n.title,
      layer: n.layer,
      category: n.category,
      sources: n.sources,
    })),
    connectedCount: connectedNodes.length,
  })
})

// ── Index vectors endpoint ──────────────────────────────────────────────────

app.post('/index-vectors', async (c) => {
  const secret = c.env.SYNC_SECRET
  if (secret) {
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }

  // Accept optional ?file= param to index one file at a time
  const targetFile = c.req.query('file')

  const manifestObj = await c.env.BRAIN_BUCKET.get('manifest.json')
  if (!manifestObj) {
    return c.json({ error: 'No manifest found - upload graph to R2 first' }, 404)
  }

  const manifest = await manifestObj.json() as { files: Record<string, string> }
  const allNodeFiles = Object.keys(manifest.files).filter(f => f.startsWith('nodes/'))
  const nodeFiles = targetFile ? [targetFile] : allNodeFiles

  let indexed = 0
  let errors = 0
  const BATCH_SIZE = 50 // Keep batches small for Workers CPU limits

  for (const file of nodeFiles) {
    const obj = await c.env.BRAIN_BUCKET.get(file)
    if (!obj) continue
    const nodes = await obj.json() as Node[]

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE)
      const texts = batch.map(n => `${n.title}. ${n.summary}`)

      try {
        const embResult = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: texts,
        })

        const vectors = batch.map((node, idx) => ({
          id: node.id,
          values: embResult.data[idx]!,
          metadata: {
            title: node.title,
            summary: node.summary.substring(0, 500),
            layer: node.layer,
            category: node.category,
            factionId: node.factionId ?? '',
            phase: node.phase ?? '',
          },
        }))

        await c.env.BRAIN_INDEX.upsert(vectors)
        indexed += batch.length
      } catch (err) {
        errors += batch.length
      }
    }
  }

  return c.json({
    indexed,
    errors,
    totalFiles: nodeFiles.length,
    allFiles: allNodeFiles, // return full list so caller can iterate
  })
})

// ── Sync trigger ────────────────────────────────────────────────────────────

app.post('/sync', async (c) => {
  const secret = c.env.SYNC_SECRET
  if (secret) {
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }

  return c.json({ message: 'Brain sync via HTTP not yet implemented - use build-graph.ts CLI and upload to R2' })
})

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch full node objects from R2 by their IDs. */
async function fetchNodesFromR2(bucket: R2Bucket, nodeIds: string[]): Promise<Node[]> {
  // Get the manifest to know which files to look in
  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return []

  const manifest = await manifestObj.json() as { files: Record<string, string> }
  const nodeFiles = Object.keys(manifest.files).filter(f => f.startsWith('nodes/'))

  const nodes: Node[] = []
  const idSet = new Set(nodeIds)

  // Fetch each node file and find matching nodes
  // In production, this should be cached
  for (const file of nodeFiles) {
    const obj = await bucket.get(file)
    if (!obj) continue
    const fileNodes = await obj.json() as Node[]
    for (const node of fileNodes) {
      if (idSet.has(node.id)) {
        nodes.push(node)
        idSet.delete(node.id)
      }
    }
    if (idSet.size === 0) break
  }

  return nodes
}

/** Fetch nodes connected to the given IDs via refs, up to N levels deep. */
async function fetchConnectedNodes(
  bucket: R2Bucket,
  nodeIds: string[],
  depth: number,
): Promise<Node[]> {
  if (depth <= 0) return []

  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return []

  const manifest = await manifestObj.json() as { files: Record<string, string> }
  const refFiles = Object.keys(manifest.files).filter(f => f.startsWith('refs/'))

  // Collect all connected node IDs from refs
  const connectedIds = new Set<string>()
  const sourceSet = new Set(nodeIds)

  for (const file of refFiles) {
    const obj = await bucket.get(file)
    if (!obj) continue
    const refs = await obj.json() as NodeRef[]
    for (const ref of refs) {
      if (sourceSet.has(ref.sourceId)) {
        connectedIds.add(ref.targetId)
      }
      if (sourceSet.has(ref.targetId) && ref.bidirectional) {
        connectedIds.add(ref.sourceId)
      }
    }
  }

  // Remove already-known IDs
  for (const id of nodeIds) connectedIds.delete(id)

  if (connectedIds.size === 0) return []

  // Fetch the connected nodes
  return fetchNodesFromR2(bucket, [...connectedIds])
}

/** Assemble node content into a context string for the LLM. */
function assembleContext(primaryNodes: Node[], connectedNodes: Node[]): string {
  const parts: string[] = []

  // Primary results first
  for (const node of primaryNodes) {
    parts.push(`## ${node.title} [${node.layer}/${node.category}]`)
    parts.push(node.content)
    if (node.sources.length > 0) {
      const srcText = node.sources
        .map(s => `${s.title}${s.page ? `, p.${s.page}` : ''}`)
        .join('; ')
      parts.push(`(Source: ${srcText})`)
    }
    parts.push('')
  }

  // Connected context (more concise)
  if (connectedNodes.length > 0) {
    parts.push('--- Related rules ---')
    for (const node of connectedNodes.slice(0, 10)) {
      parts.push(`### ${node.title} [${node.layer}/${node.category}]`)
      parts.push(node.summary)
      parts.push('')
    }
  }

  return parts.join('\n')
}

export default {
  fetch: app.fetch,
}
