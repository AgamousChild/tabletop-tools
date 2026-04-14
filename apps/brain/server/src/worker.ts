import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import type { Node } from './lib/model'
import { retrieve } from './lib/retrieve'
import { formatConversationalAnswer, assembleContext } from './lib/format'

type HonoEnv = { Bindings: Env }

const app = new Hono<HonoEnv>()

app.use('*', async (c, next) => {
  const origin = c.env.CORS_ORIGIN || 'https://tabletop-tools.net'
  return cors({
    origin: [origin, 'http://localhost:3008', 'http://localhost:3009', 'http://localhost:3010', 'http://localhost:3011'],
    allowMethods: ['GET', 'POST'],
  })(c, next)
})

// ── Version ────────────────────────────────────────────────────────────────

app.get('/version', (c) => c.json({ version: c.env.BUILD_VERSION || 'dev' }))

// ── Browse endpoints ────────────────────────────────────────────────────────

app.get('/browse/layers', async (c) => {
  const bucket = c.env.BRAIN_BUCKET
  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return c.json({ layers: [] })
  const manifest = await manifestObj.json() as { files: Record<string, string> }

  // Count nodes per layer by reading each node file
  const layers: Array<{ id: string; label: string; count: number }> = []
  const layerLabels: Record<string, string> = {
    core: 'Core Rules', faction: 'Faction', unit: 'Units',
    errata: 'Errata', balance: 'Balance', community: 'Community',
  }

  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const obj = await bucket.get(file)
    if (!obj) continue
    const nodes = await obj.json() as Node[]
    for (const node of nodes) {
      const existing = layers.find(l => l.id === node.layer)
      if (existing) existing.count++
      else layers.push({ id: node.layer, label: layerLabels[node.layer] || node.layer, count: 1 })
    }
  }

  return c.json({ layers })
})

app.get('/browse/nodes', async (c) => {
  const layer = c.req.query('layer')
  if (!layer) return c.json({ error: 'layer query param required' }, 400)

  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500)
  const offset = parseInt(c.req.query('offset') || '0')

  const bucket = c.env.BRAIN_BUCKET
  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return c.json({ nodes: [], total: 0 })
  const manifest = await manifestObj.json() as { files: Record<string, string> }

  const allNodes: Node[] = []
  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const obj = await bucket.get(file)
    if (!obj) continue
    const nodes = await obj.json() as Node[]
    for (const node of nodes) {
      if (node.layer === layer) allNodes.push(node)
    }
  }

  // Sort by category then title
  allNodes.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.title.localeCompare(b.title)
  })

  return c.json({
    nodes: allNodes.slice(offset, offset + limit),
    total: allNodes.length,
  })
})

app.get('/browse/node/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const bucket = c.env.BRAIN_BUCKET
  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return c.json({ error: 'No data' }, 404)
  const manifest = await manifestObj.json() as { files: Record<string, string> }

  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const obj = await bucket.get(file)
    if (!obj) continue
    const nodes = await obj.json() as Node[]
    const found = nodes.find(n => n.id === id)
    if (found) return c.json({ node: found })
  }

  return c.json({ error: 'Node not found' }, 404)
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

  const env = {
    ai: c.env.AI,
    vectorize: c.env.BRAIN_INDEX,
    bucket: c.env.BRAIN_BUCKET,
  }

  const { detected, results } = await retrieve(
    {
      query: body.query,
      limit: body.limit,
      filter: body.filter,
      includeConnected: false,
      dualEmbedding: false,
    },
    env,
  )

  return c.json({ detected, results })
})

// ── Q&A endpoint (RAG: Vectorize → R2 → LLM) ───────────────────────────────

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

  const env = {
    ai: c.env.AI,
    vectorize: c.env.BRAIN_INDEX,
    bucket: c.env.BRAIN_BUCKET,
  }

  let retrieveResult
  try {
    retrieveResult = await retrieve(
      {
        query: body.question,
        limit: 10,
        includeConnected: true,
        dualEmbedding: true,
      },
      env,
    )
  } catch (err) {
    return c.json({ error: 'Retrieval failed', details: err instanceof Error ? err.message : String(err) }, 500)
  }
  const { detected, results, connected, parentMap } = retrieveResult

  // Build Node arrays for assembleContext (results are EnrichedNode, compatible with Node shape)
  const primaryNodes = results as unknown as Node[]
  const connectedNodes = connected as unknown as Node[]

  // Assemble LLM context — pass subfaction so context is structured with subfaction-specific content first
  let context = assembleContext(primaryNodes, connectedNodes, parentMap, detected.subfaction)

  // Find combo pairs — stacks_with refs between connected nodes
  let combos: string[] = []
  try {
    const fwdObj = await c.env.BRAIN_BUCKET.get('refs/forward-index.json')
    if (fwdObj) {
      const fwdIndex = await fwdObj.json() as Record<string, Array<{ targetId: string; rel: string; context: string }>>
      const connectedIdSet = new Set(connected.map(n => n.id))
      const comboPairs: string[] = []

      for (const node of connected) {
        const fwdRefs = fwdIndex[node.id]
        if (!fwdRefs) continue
        for (const ref of fwdRefs) {
          if (ref.rel === 'stacks_with' && connectedIdSet.has(ref.targetId)) {
            comboPairs.push(ref.context)
          }
        }
      }

      combos = [...new Set(comboPairs)]

      // Append to LLM context
      if (combos.length > 0) {
        context += '\n\n========================================\n'
        context += 'COMPETITIVE COMBOS (abilities that stack together for maximum effect):\n'
        context += 'IMPORTANT: If any of these combos are relevant to the question, explain them explicitly.\n'
        context += '========================================\n\n'
        for (const combo of combos) {
          context += `- ${combo}\n`
        }
      }
    }
  } catch { /* forward index not available — skip combos */ }

  const systemPrompt = `You are a Warhammer 40,000 rules expert. Answer questions using ONLY the rules context provided below. Always cite your sources.

MOST IMPORTANT RULE — SECTION STRUCTURE:
When the context has SECTION 1 and SECTION 2, your answer MUST have TWO separate headings. Present ALL of SECTION 1 first under its own heading (e.g., "## Blood Angels Specific"). Then present ALL of SECTION 2 under a second heading (e.g., "## Available to All Space Marines"). NEVER mix content from the two sections. This is mandatory.

COMPETITIVE COMBOS RULE:
When the context includes a COMPETITIVE COMBOS section, these are abilities that STACK together for massive effect. ALWAYS explain these combos explicitly — name both abilities, explain what each does, what weapon type they share, and why combining them is powerful.

OTHER RULES:
1. ALWAYS name the specific unit/datasheet that has each ability or weapon.
2. For unit abilities from characters/leaders, explain that the ability is conferred by ATTACHING the character to a unit — not an "aura". Leader abilities affect ONLY the unit the character is attached to.
3. For faction/detachment abilities, explain which detachment grants it and any activation conditions.
4. For weapons, name the unit(s) that carry them.
5. Prioritize by impact: army-wide rules first, then detachment rules, then leader/character abilities, then individual unit abilities, then native weapon abilities last.
6. When a context entry says "[unit-ability, ON UNIT: X]" or "[weapon, ON UNIT: X]", use X as the unit name.
7. Be precise about game mechanics. If a rule has been errata'd or FAQ'd, mention the correction.
8. If the context doesn't contain enough information to answer confidently, say so.

When citing sources, use the format: (Source: [title])`

  const userMessage = `Rules context:\n\n${context}\n\n---\n\nQuestion: ${body.question}`

  let answer: string
  let answerPath = 'unknown'

  const useClaudeParam = c.req.query('model') === 'claude'
  const useClaude = useClaudeParam && apiKey

  if (useClaude) {
    answerPath = 'claude'
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return c.json({ error: `Claude API error: ${response.status}`, details: err }, 502)
    }

    const claudeResponse = await response.json() as {
      content: Array<{ type: string; text: string }>
    }
    answer = claudeResponse.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n')
  } else {
    // Workers AI — free tier LLM
    // If context is small enough (< 40000 chars), use LLM. Otherwise, format conversationally.
    const MAX_LLM_CONTEXT = 40000

    if (userMessage.length <= MAX_LLM_CONTEXT) {
      answerPath = 'llm'
      try {
        const aiResult = await (c.env.AI as any).run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 2048,
        })
        answer = (aiResult as any).response ?? 'No response from model'
      } catch {
        answerPath = 'deterministic-fallback'
        answer = formatConversationalAnswer(body.question, connectedNodes, parentMap, detected.subfaction, combos)
      }
    } else {
      answerPath = 'deterministic'
      answer = formatConversationalAnswer(body.question, connectedNodes, parentMap, detected.subfaction, combos)
    }
  }

  return c.json({
    detected,
    answer,
    answerPath,
    contextLength: userMessage.length,
    connectedIds: connected.map(c => c.id),
    reference: results,
    sources: results.map(n => ({
      id: n.id,
      title: n.title,
      layer: n.layer,
      category: n.category,
      sources: n.sources,
    })),
    connectedCount: connected.length,
  })
})

// ── Graph data endpoint ─────────────────────────────────────────────────────

app.post('/graph-data', async (c) => {
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

  const bucket = c.env.BRAIN_BUCKET

  const env = {
    ai: c.env.AI,
    vectorize: c.env.BRAIN_INDEX,
    bucket,
  }

  const { detected, results, connected } = await retrieve(
    {
      query: body.query,
      limit: body.limit || 20,
      filter: body.filter,
      includeConnected: true,
      dualEmbedding: true,
    },
    env,
  )

  // Combine primary results + connected nodes for the graph
  const allNodes = [...results, ...connected]
  const seenIds = new Set<string>()
  const dedupedNodes = allNodes.filter(n => {
    if (seenIds.has(n.id)) return false
    seenIds.add(n.id)
    return true
  })

  // Build edges from forward/reverse indexes — only between nodes in our set
  const [revObj, fwdObj] = await Promise.all([
    bucket.get('refs/reverse-index.json'),
    bucket.get('refs/forward-index.json'),
  ])

  const nodeIdSet = new Set(dedupedNodes.map(n => n.id))
  const edges: Array<{ source: string; target: string; rel: string }> = []

  if (fwdObj) {
    const fwdIndex = await fwdObj.json() as Record<string, Array<{ targetId: string; rel: string }>>
    for (const nodeId of nodeIdSet) {
      const fwd = fwdIndex[nodeId]
      if (fwd) {
        for (const ref of fwd) {
          if (nodeIdSet.has(ref.targetId)) {
            edges.push({ source: nodeId, target: ref.targetId, rel: ref.rel })
          }
        }
      }
    }
  }

  if (revObj) {
    const revIndex = await revObj.json() as Record<string, Array<{ sourceId: string; rel: string }>>
    const edgeSet = new Set(edges.map(e => `${e.source}|${e.target}|${e.rel}`))
    for (const nodeId of nodeIdSet) {
      const rev = revIndex[nodeId]
      if (rev) {
        for (const ref of rev) {
          const key = `${ref.sourceId}|${nodeId}|${ref.rel}`
          if (nodeIdSet.has(ref.sourceId) && !edgeSet.has(key)) {
            edges.push({ source: ref.sourceId, target: nodeId, rel: ref.rel })
            edgeSet.add(key)
          }
        }
      }
    }
  }

  return c.json({ detected, nodes: dedupedNodes, edges })
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
        }) as { data: number[][] }

        const vectors = batch.map((node, idx) => ({
          id: node.id,
          values: embResult.data[idx]!,
          metadata: {
            title: node.title,
            summary: node.summary.substring(0, 500),
            layer: node.layer,
            category: node.category,
            factionId: node.factionId ?? '',
            subfaction: node.subfaction ?? '',
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

export default {
  fetch: app.fetch,
}
