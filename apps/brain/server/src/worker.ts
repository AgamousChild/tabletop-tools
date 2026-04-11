import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import type { Node, NodeRef } from './lib/model'

type HonoEnv = { Bindings: Env }

const app = new Hono<HonoEnv>()

app.use('*', async (c, next) => {
  const origin = c.env.CORS_ORIGIN || 'https://tabletop-tools.net'
  return cors({
    origin: [origin, 'http://localhost:3008', 'http://localhost:3009', 'http://localhost:3010', 'http://localhost:3011'],
    allowMethods: ['GET', 'POST'],
  })(c, next)
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

  // 1. Generate embeddings — one for the full question, one for extracted keywords
  //    Full questions dilute keyword signal ("space marine player get sustained hits"
  //    matches "space marine" more than "sustained hits"). Searching for just the
  //    mechanic keyword separately ensures we find the core rule node.
  const keywords = extractMechanicKeywords(body.question)
  const textsToEmbed = [body.question, ...(keywords.length > 0 ? [keywords.join(' ')] : [])]

  const embeddingResult = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: textsToEmbed,
  })

  const questionVector = embeddingResult.data[0]
  if (!questionVector) {
    return c.json({ error: 'Failed to generate embedding' }, 500)
  }

  // 2. Search Vectorize — question embedding + keyword embedding
  const questionResults = await c.env.BRAIN_INDEX.query(questionVector, {
    topK: 10,
    returnMetadata: 'all',
  })

  let keywordResults = { matches: [] as typeof questionResults.matches }
  if (embeddingResult.data[1]) {
    keywordResults = await c.env.BRAIN_INDEX.query(embeddingResult.data[1], {
      topK: 5,
      returnMetadata: 'all',
    })
  }

  // Merge and deduplicate (keyword results first — they're more targeted)
  const seenIds = new Set<string>()
  const allMatches = [...keywordResults.matches, ...questionResults.matches].filter(m => {
    if (seenIds.has(m.id)) return false
    seenIds.add(m.id)
    return true
  })

  // 3. Fetch full node content from R2 for the top results
  const nodeIds = allMatches.map(m => m.id)
  const nodeContent = await fetchNodesFromR2(c.env.BRAIN_BUCKET, nodeIds)

  // 4. Traverse reverse index to gather connected context
  const depth = body.depth ?? 1
  const factionHint = body.factionId || detectFactionFromQuestion(body.question)
  const connected = await fetchConnectedNodes(
    c.env.BRAIN_BUCKET,
    nodeIds,
    depth,
    factionHint,
  )

  // 5. Assemble context for Claude
  const context = assembleContext(nodeContent, connected.nodes, connected.refs)

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
    connectedCount: connected.nodes.length,
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
      const texts = batch.map(n => `${n.title}. ${n.summary}. ${n.keywords.join(', ')}`)

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

/** Detect faction from question text. */
function detectFactionFromQuestion(question: string): string | undefined {
  const lower = question.toLowerCase()
  const factions: Array<{ pattern: string; slug: string }> = [
    { pattern: 'space marine', slug: 'space-marines' },
    { pattern: 'ork', slug: 'orks' },
    { pattern: 'necron', slug: 'necrons' },
    { pattern: 'tyranid', slug: 'tyranids' },
    { pattern: 'aeldari', slug: 'aeldari' },
    { pattern: 'eldar', slug: 'aeldari' },
    { pattern: 'tau', slug: 't-au-empire' },
    { pattern: 't\'au', slug: 't-au-empire' },
    { pattern: 'chaos space marine', slug: 'chaos-space-marines' },
    { pattern: 'death guard', slug: 'death-guard' },
    { pattern: 'thousand sons', slug: 'thousand-sons' },
    { pattern: 'world eater', slug: 'world-eaters' },
    { pattern: 'custodes', slug: 'adeptus-custodes' },
    { pattern: 'sororitas', slug: 'adepta-sororitas' },
    { pattern: 'sisters of battle', slug: 'adepta-sororitas' },
    { pattern: 'mechanicus', slug: 'adeptus-mechanicus' },
    { pattern: 'imperial guard', slug: 'astra-militarum' },
    { pattern: 'astra militarum', slug: 'astra-militarum' },
    { pattern: 'imperial knight', slug: 'imperial-knights' },
    { pattern: 'chaos knight', slug: 'chaos-knights' },
    { pattern: 'genestealer', slug: 'genestealer-cults' },
    { pattern: 'grey knight', slug: 'grey-knights' },
    { pattern: 'drukhari', slug: 'drukhari' },
    { pattern: 'dark eldar', slug: 'drukhari' },
    { pattern: 'votann', slug: 'leagues-of-votann' },
    { pattern: 'blood angel', slug: 'blood-angels' },
    { pattern: 'dark angel', slug: 'dark-angels' },
    { pattern: 'space wolf', slug: 'space-wolves' },
    { pattern: 'space wolves', slug: 'space-wolves' },
    { pattern: 'black templar', slug: 'black-templars' },
    { pattern: 'deathwatch', slug: 'deathwatch' },
    { pattern: 'daemon', slug: 'chaos-daemons' },
  ]
  for (const { pattern, slug } of factions) {
    if (lower.includes(pattern)) return slug
  }
  return undefined
}

/** Extract game mechanic keywords from a question. */
function extractMechanicKeywords(question: string): string[] {
  const lower = question.toLowerCase()
  const mechanics = [
    'sustained hits', 'lethal hits', 'devastating wounds', 'hazardous',
    'blast', 'torrent', 'twin-linked', 'rapid fire', 'pistol', 'melta',
    'lance', 'anti-', 'ignores cover', 'indirect fire',
    'feel no pain', 'deadly demise', 'deep strike', 'lone operative',
    'stealth', 'scouts', 'infiltrators', 'battle-shock', 'fights first',
    'overwatch', 'wound roll', 'hit roll', 'saving throw',
    'engagement range', 'coherency', 'visibility', 'cover',
    'advance', 'fall back', 'charge', 'mortal wound',
    'invulnerable', 'firing deck', 'transport',
  ]
  return mechanics.filter(m => lower.includes(m))
}

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

/** Fetch nodes connected to the given IDs via the reverse index. */
async function fetchConnectedNodes(
  bucket: R2Bucket,
  nodeIds: string[],
  depth: number,
  factionHint?: string,
): Promise<{ nodes: Node[]; refs: Array<{ sourceId: string; rel: string; context: string }> }> {
  if (depth <= 0) return { nodes: [], refs: [] }

  // Load the reverse index (single file, cached by R2)
  const revObj = await bucket.get('refs/reverse-index.json')
  if (!revObj) return { nodes: [], refs: [] }

  const reverseIndex = await revObj.json() as Record<string, Array<{ sourceId: string; rel: string; context: string; factionId?: string }>>

  const allRefs: Array<{ sourceId: string; rel: string; context: string; factionId?: string }> = []

  for (const nodeId of nodeIds) {
    const inbound = reverseIndex[nodeId]
    if (inbound) {
      for (const ref of inbound) {
        allRefs.push(ref)
      }
    }
  }

  if (allRefs.length === 0) return { nodes: [], refs: [] }

  // If we have a faction hint, prioritize refs whose sourceId contains the faction slug
  // This is a heuristic — faction nodes have IDs like det:space-marines:... or weapon IDs
  // that we can't check without loading. So we also fetch from the faction-specific node file.
  let prioritizedIds: string[]
  if (factionHint) {
    const factionRefs = allRefs.filter(r => r.factionId === factionHint)
    const otherRefs = allRefs.filter(r => r.factionId !== factionHint)

    const factionIds = [...new Set(factionRefs.map(r => r.sourceId))]
    const otherIds = [...new Set(otherRefs.map(r => r.sourceId))]

    // Remove already-known IDs
    const known = new Set(nodeIds)
    prioritizedIds = [
      ...factionIds.filter(id => !known.has(id)).slice(0, 30),
      ...otherIds.filter(id => !known.has(id)).slice(0, 10),
    ]
  } else {
    const known = new Set(nodeIds)
    prioritizedIds = [...new Set(allRefs.map(r => r.sourceId))]
      .filter(id => !known.has(id))
      .slice(0, 30)
  }

  if (prioritizedIds.length === 0) return { nodes: [], refs: allRefs }

  const nodes = await fetchNodesFromR2(bucket, prioritizedIds)
  return { nodes, refs: allRefs }
}

/** Assemble node content into a context string for the LLM. */
function assembleContext(primaryNodes: Node[], connectedNodes: Node[], refs?: NodeRef[]): string {
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

  // Ref summary — shows what connects to what
  if (refs && refs.length > 0) {
    parts.push('--- Graph connections ---')
    const refsByTarget = new Map<string, NodeRef[]>()
    for (const r of refs) {
      const arr = refsByTarget.get(r.targetId) ?? []
      arr.push(r)
      refsByTarget.set(r.targetId, arr)
    }
    for (const [targetId, targetRefs] of refsByTarget) {
      const count = targetRefs.length
      const sample = targetRefs.slice(0, 5).map(r => `${r.rel}: ${r.context.substring(0, 80)}`).join('\n  ')
      parts.push(`${targetId} has ${count} connections:`)
      parts.push(`  ${sample}`)
      if (count > 5) parts.push(`  ... and ${count - 5} more`)
    }
    parts.push('')
  }

  // Connected context (more concise)
  if (connectedNodes.length > 0) {
    parts.push('--- Related rules ---')
    for (const node of connectedNodes.slice(0, 15)) {
      parts.push(`### ${node.title} [${node.layer}/${node.category}${node.factionId ? `, ${node.factionId}` : ''}]`)
      parts.push(node.summary)
      parts.push('')
    }
  }

  return parts.join('\n')
}

export default {
  fetch: app.fetch,
}
