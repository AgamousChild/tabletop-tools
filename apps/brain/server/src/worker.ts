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

  const { detected, results, connected, parentMap } = await retrieve(
    {
      query: body.question,
      limit: 10,
      includeConnected: true,
      dualEmbedding: true,
    },
    env,
  )

  // Build Node arrays for assembleContext (results are EnrichedNode, compatible with Node shape)
  const primaryNodes = results as unknown as Node[]
  const connectedNodes = connected as unknown as Node[]

  // Assemble LLM context
  const context = assembleContext(primaryNodes, connectedNodes, parentMap)

  const systemPrompt = `You are a Warhammer 40,000 rules expert. Answer questions using ONLY the rules context provided below. Always cite your sources.

CRITICAL RULES FOR ANSWERS:
1. ALWAYS name the specific unit/datasheet that has each ability or weapon. Never say "Keep Counting!" without saying which unit has it (e.g., "Uriel Ventris has Keep Counting!").
2. For unit abilities from characters/leaders, explain that the ability is conferred by ATTACHING the character to a unit — not an "aura". Leader abilities affect ONLY the unit the character is attached to. Aura abilities have a range and affect multiple nearby units — these are different mechanics.
3. For faction/detachment abilities, explain which detachment grants it and any activation conditions.
4. For weapons, name the unit(s) that carry them.
5. Prioritize by impact: army-wide rules first, then detachment rules, then leader/character abilities (these affect entire attached units), then individual unit abilities, then native weapon abilities last.
6. When a context entry says "[unit-ability, ON UNIT: X]" or "[weapon, ON UNIT: X]", use X as the unit name.
7. Be precise about game mechanics. If a rule has been errata'd or FAQ'd, mention the correction.
8. If the context doesn't contain enough information to answer confidently, say so.

When citing sources, use the format: (Source: [title])`

  const userMessage = `Rules context:\n\n${context}\n\n---\n\nQuestion: ${body.question}`

  let answer: string

  const useClaudeParam = c.req.query('model') === 'claude'
  const useClaude = useClaudeParam && apiKey

  if (useClaude) {
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
      try {
        const aiResult = await (c.env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 2048,
        })
        answer = (aiResult as any).response ?? 'No response from model'
      } catch {
        // Fallback to conversational formatting
        answer = formatConversationalAnswer(body.question, connectedNodes, parentMap)
      }
    } else {
      // Large context — format conversationally from graph data
      answer = formatConversationalAnswer(body.question, connectedNodes, parentMap)
    }
  }

  return c.json({
    detected,
    answer,
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

  const { detected, results } = await retrieve(
    {
      query: body.query,
      limit: body.limit || 20,
      filter: body.filter,
      includeConnected: false,
      dualEmbedding: false,
    },
    env,
  )

  // Fetch forward/reverse indexes for edge building
  const [revObj, fwdObj] = await Promise.all([
    bucket.get('refs/reverse-index.json'),
    bucket.get('refs/forward-index.json'),
  ])

  const resultIds = new Set(results.map(r => r.id))
  const edges: Array<{ source: string; target: string; rel: string }> = []

  if (fwdObj) {
    const fwdIndex = await fwdObj.json() as Record<string, Array<{ targetId: string; rel: string }>>
    for (const nodeId of resultIds) {
      const fwd = fwdIndex[nodeId]
      if (fwd) {
        for (const ref of fwd) {
          if (resultIds.has(ref.targetId)) {
            edges.push({ source: nodeId, target: ref.targetId, rel: ref.rel })
          }
        }
      }
    }
  }

  return c.json({ detected, nodes: results, edges })
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
