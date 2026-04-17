import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import type { Node } from './lib/model'
import { retrieve } from './lib/retrieve'
import { formatConversationalAnswer, assembleContext } from './lib/format'

/** Vectorize IDs must be <= 64 bytes. For long node IDs, truncate + append hash. */
function vectorizeId(nodeId: string): string {
  if (nodeId.length <= 64) return nodeId
  // Simple hash: sum char codes, convert to hex
  let hash = 0
  for (let i = 0; i < nodeId.length; i++) {
    hash = ((hash << 5) - hash + nodeId.charCodeAt(i)) | 0
  }
  const hexHash = (hash >>> 0).toString(16).padStart(8, '0')
  return nodeId.substring(0, 55) + '-' + hexHash
}

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

app.get('/browse/unit/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const bucket = c.env.BRAIN_BUCKET
  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return c.json({ error: 'No data' }, 404)
  const manifest = await manifestObj.json() as { files: Record<string, string> }

  let datasheet: Node | null = null
  const weapons: Node[] = []
  const abilities: Node[] = []

  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const obj = await bucket.get(file)
    if (!obj) continue
    const nodes = await obj.json() as Node[]
    for (const n of nodes) {
      if (n.id === id && n.category === 'datasheet') {
        datasheet = n
      } else if (n.datasheetId === id && n.category === 'weapon') {
        weapons.push(n)
      } else if (n.datasheetId === id && n.category === 'unit-ability') {
        abilities.push(n)
      }
    }
  }

  if (!datasheet) return c.json({ error: 'Unit not found' }, 404)

  return c.json({ datasheet, weapons, abilities })
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

app.get('/pages/:path{.+}', async (c) => {
  const path = c.req.param('path')
  if (!path.endsWith('.png')) {
    return c.json({ error: 'Invalid file' }, 400)
  }
  const obj = await c.env.BRAIN_BUCKET.get(`pages/${path}`)
  if (!obj) {
    return c.json({ error: 'Page not found' }, 404)
  }
  c.header('Cache-Control', 'public, max-age=86400')
  c.header('Content-Type', 'image/png')
  return c.body(await obj.arrayBuffer())
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

// ── Gemini cache helpers ────────────────────────────────────────────────────

function hashQuestion(q: string): string {
  const normalized = q.toLowerCase().trim().replace(/\s+/g, ' ')
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const GEMINI_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CachedGeminiResult {
  answer: string
  sources: GeminiSource[]
  cachedAt: string
}

async function getCachedGemini(bucket: R2Bucket, question: string): Promise<CachedGeminiResult | null> {
  const key = `cache/gemini/${hashQuestion(question)}.json`
  const obj = await bucket.get(key)
  if (!obj) return null
  const cached = await obj.json() as CachedGeminiResult
  if (Date.now() - new Date(cached.cachedAt).getTime() > GEMINI_CACHE_TTL_MS) return null
  return cached
}

async function setCachedGemini(bucket: R2Bucket, question: string, result: { answer: string; sources: GeminiSource[] }): Promise<void> {
  const key = `cache/gemini/${hashQuestion(question)}.json`
  const cached: CachedGeminiResult = { ...result, cachedAt: new Date().toISOString() }
  await bucket.put(key, JSON.stringify(cached))
}

// ── Gemini with Google Search grounding ─────────────────────────────────────

interface GeminiSource { url: string; title: string }

async function callGemini(
  question: string,
  apiKey: string,
): Promise<{ answer: string; sources: GeminiSource[] }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Warhammer 40,000 10th Edition: ${question}` }] }],
        tools: [{ google_search: {} }],
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
      }
    }>
  }

  const candidate = data.candidates?.[0]
  const answer = candidate?.content?.parts
    ?.filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join('\n') ?? ''

  const sources: GeminiSource[] = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((ch: any) => ch.web?.uri)
    .map((ch: any) => ({ url: ch.web!.uri!, title: ch.web!.title ?? ch.web!.uri! }))

  return { answer, sources }
}

// ── Google scrape fallback ──────────────────────────────────────────────────

async function scrapeGoogleSearch(
  question: string,
): Promise<{ answer: string; sources: GeminiSource[] }> {
  const query = encodeURIComponent(`Warhammer 40K 10th Edition ${question}`)
  const url = `https://www.google.com/search?q=${query}&hl=en`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  if (!res.ok) throw new Error(`Google search ${res.status}`)
  const html = await res.text()

  // Extract AI Overview (data-attrid="ai_overview" or class containing "ai-dd")
  let aiOverview = ''
  const aiMatch = html.match(/data-attrid="[^"]*ai[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)
    || html.match(/class="[^"]*ai-dd[^"]*"[^>]*>([\s\S]*?)<\/div>/)
  if (aiMatch) {
    aiOverview = aiMatch[1]!
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Extract featured snippet
  let featuredSnippet = ''
  const featuredMatch = html.match(/class="[^"]*hgKElc[^"]*"[^>]*>([\s\S]*?)<\/span>/)
    || html.match(/data-attrid="wa:\/description"[^>]*>([\s\S]*?)<\/span>/)
  if (featuredMatch) {
    featuredSnippet = featuredMatch[1]!
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Extract search result snippets + links
  const sources: GeminiSource[] = []
  const snippets: string[] = []

  // Match result blocks: <a href="/url?q=..."><h3>...</h3></a> ... <span class="...">snippet</span>
  const linkPattern = /href="\/url\?q=([^&"]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g
  let linkMatch
  while ((linkMatch = linkPattern.exec(html)) !== null && sources.length < 5) {
    const linkUrl = decodeURIComponent(linkMatch[1]!)
    const title = linkMatch[2]!.replace(/<[^>]+>/g, '').trim()
    if (linkUrl.startsWith('http') && !linkUrl.includes('google.com')) {
      sources.push({ url: linkUrl, title })
    }
  }

  // Extract snippets from result descriptions
  const snippetPattern = /class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/span>/g
  let snippetMatch
  while ((snippetMatch = snippetPattern.exec(html)) !== null && snippets.length < 5) {
    const text = snippetMatch[1]!
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
    if (text.length > 30) snippets.push(text)
  }

  // Build answer from whatever we got
  const parts: string[] = []
  if (aiOverview) parts.push(aiOverview)
  if (featuredSnippet && featuredSnippet !== aiOverview) parts.push(featuredSnippet)
  if (snippets.length > 0) parts.push(...snippets)

  const answer = parts.join('\n\n')
  if (!answer) throw new Error('No content extracted from Google search')

  return { answer, sources }
}

// ── Server-side entity linking ──────────────────────────────────────────────

function linkEntitiesInText(
  text: string,
  entityMap: Map<string, { nodeId: string; title: string }>,
): string {
  if (entityMap.size === 0) return text

  // Sort names longest-first for greedy matching
  const names = Array.from(entityMap.keys()).sort((a, b) => b.length - a.length)

  // Build a regex that matches any entity name (case-insensitive, word boundaries)
  // Escape regex special chars in names
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')

  // Track which entity IDs we've already linked (only link first occurrence)
  const linked = new Set<string>()

  return text.replace(pattern, (match) => {
    const key = match.toLowerCase()
    const entity = entityMap.get(key)
    if (!entity || linked.has(entity.nodeId)) return match
    linked.add(entity.nodeId)
    return `[${match}](brain:${entity.nodeId})`
  })
}

// ── Q&A endpoint (RAG: Vectorize → R2 → Gemini + Brain → LLM) ─────────────

app.post('/ask', async (c) => {
  const body = await c.req.json<{
    question: string
    factionId?: string
    depth?: number
  }>()

  if (!body.question) {
    return c.json({ error: 'question is required' }, 400)
  }

  const anthropicKey = c.env.ANTHROPIC_API_KEY
  const geminiKey = c.env.GEMINI_API_KEY

  const env = {
    ai: c.env.AI,
    vectorize: c.env.BRAIN_INDEX,
    bucket: c.env.BRAIN_BUCKET,
  }

  // Check Gemini cache first
  const cachedGemini = await getCachedGemini(c.env.BRAIN_BUCKET, body.question)

  // Fire Brain retrieval + Gemini in parallel — surface errors, don't swallow them
  let retrieveResult: Awaited<ReturnType<typeof retrieve>> | null = null
  let retrieveError: string | null = null
  let geminiResult: { answer: string; sources: GeminiSource[] } | null = cachedGemini
  let geminiError: string | null = null

  const [retrieveOutcome, geminiOutcome] = await Promise.allSettled([
    retrieve(
      {
        query: body.question,
        limit: 10,
        includeConnected: true,
        dualEmbedding: true,
      },
      env,
    ),
    // Skip Gemini call if we have a cached result
    // Fallback chain: cache → Gemini API → null (scraping done offline via GitHub Action)
    cachedGemini
      ? Promise.resolve(cachedGemini)
      : geminiKey
        ? callGemini(body.question, geminiKey).catch(() => null)
        : Promise.resolve(null),
  ])

  if (retrieveOutcome.status === 'fulfilled') {
    retrieveResult = retrieveOutcome.value
  } else {
    retrieveError = retrieveOutcome.reason instanceof Error ? retrieveOutcome.reason.message : String(retrieveOutcome.reason)
  }

  if (geminiOutcome.status === 'fulfilled') {
    geminiResult = geminiOutcome.value
    // Cache fresh results (Gemini or scrape — not already-cached ones)
    if (geminiResult && !cachedGemini && geminiResult.answer) {
      setCachedGemini(c.env.BRAIN_BUCKET, body.question, geminiResult).catch(() => {})
    }
  } else {
    geminiError = geminiOutcome.reason instanceof Error ? geminiOutcome.reason.message : String(geminiOutcome.reason)
  }

  const detected = retrieveResult?.detected ?? { factions: [], strippedQuery: body.question, keywords: [] }
  const results = retrieveResult?.results ?? []
  const connected = retrieveResult?.connected ?? []
  const parentMap = retrieveResult?.parentMap ?? {}

  // Build Node arrays for assembleContext
  const primaryNodes = results as unknown as Node[]
  const connectedNodes = connected as unknown as Node[]

  // Assemble Brain context
  let brainContext = retrieveResult
    ? assembleContext(primaryNodes, connectedNodes, parentMap, detected.subfaction)
    : ''

  // Find combo pairs
  let combos: string[] = []
  try {
    const fwdObj = await c.env.BRAIN_BUCKET.get('refs/forward-index.json')
    if (fwdObj) {
      const fwdIndex = await fwdObj.json() as Record<string, Array<{ targetId: string; rel: string; context: string }>>
      const allNodeIds = new Set([...results.map(n => n.id), ...connected.map(n => n.id)])
      const primaryIdSet = new Set(results.map(n => n.id))

      const scoredCombos: Array<{ text: string; score: number }> = []
      const allRelevantNodes = [...results, ...connected]

      for (const node of allRelevantNodes) {
        const fwdRefs = fwdIndex[node.id]
        if (!fwdRefs) continue
        for (const ref of fwdRefs) {
          if (ref.rel !== 'stacks_with') continue
          if (!allNodeIds.has(ref.targetId)) continue

          const srcPrimary = primaryIdSet.has(node.id) ? 1 : 0
          const tgtPrimary = primaryIdSet.has(ref.targetId) ? 1 : 0
          let score = srcPrimary + tgtPrimary
          if (score === 0) {
            const comboLower = ref.context.toLowerCase()
            if (detected.keywords.some(k => comboLower.includes(k))) {
              score = 0.5
            }
          }
          if (score > 0) {
            scoredCombos.push({ text: ref.context, score })
          }
        }
      }

      const seen = new Set<string>()
      const uniqueScored = scoredCombos.filter(c => {
        if (seen.has(c.text)) return false
        seen.add(c.text)
        return true
      }).sort((a, b) => b.score - a.score).slice(0, 10)
      combos = uniqueScored.map(c => c.text)

      if (combos.length > 0) {
        brainContext += '\n\n========================================\n'
        brainContext += 'COMPETITIVE COMBOS (abilities that stack together for maximum effect):\n'
        brainContext += '========================================\n\n'
        for (const combo of combos) {
          brainContext += `- ${combo}\n`
        }
      }
    }
  } catch { /* forward index not available — skip combos */ }

  // If question asks for a faction's units, fetch the unit list
  let unitListContext = ''
  if (detected.factions.length > 0) {
    const unitListMatch = body.question.match(/\b(units?|datasheets?|army|roster|list)\b/i)
    if (unitListMatch) {
      try {
        const manifest = await c.env.BRAIN_BUCKET.get('manifest.json')
        if (manifest) {
          const manifestData = await manifest.json() as { files: Record<string, string> }
          const factionUnits: string[] = []
          for (const file of Object.keys(manifestData.files)) {
            if (!file.startsWith('nodes/faction-')) continue
            const obj = await c.env.BRAIN_BUCKET.get(file)
            if (!obj) continue
            const nodes = await obj.json() as Node[]
            for (const n of nodes) {
              if (n.category === 'datasheet' && detected.factions.some(f =>
                n.factionId === f || n.factionId?.toLowerCase().replace(/\s+/g, '-') === f
              )) {
                factionUnits.push(n.title)
              }
            }
          }
          if (factionUnits.length > 0) {
            factionUnits.sort()
            unitListContext = `\n\nFACTION UNIT LIST (${detected.factions.join(', ')}):\n${factionUnits.map(u => `- ${u}`).join('\n')}\n`
          }
        }
      } catch { /* skip unit list on error */ }
    }
  }

  // Build the combined LLM prompt
  const systemPrompt = `You are a Warhammer 40,000 10th Edition rules expert. You have two sources of information:

1. BRAIN KNOWLEDGE GRAPH — structured rules data from official sources
2. WEB SEARCH RESULTS — a Gemini AI answer grounded in web sources

Synthesize BOTH sources into ONE comprehensive answer. When they agree, present the information confidently. When they differ, prefer the Brain knowledge graph (it's from official rules) but include useful context from web results.

RULES:
1. ALWAYS name the specific unit/datasheet that has each ability or weapon.
2. For unit abilities from characters/leaders, explain that the ability is conferred by ATTACHING the character — not an "aura".
3. For faction/detachment abilities, explain which detachment grants it.
4. When the context has SECTION 1 and SECTION 2, present them under separate headings.
5. When COMPETITIVE COMBOS are listed, explain each combo: name both abilities, the unit, and why combining them is powerful.
6. If a FACTION UNIT LIST is provided and the question asks about units, include the full list organized by role.
7. Be precise about game mechanics. Mention errata/FAQ corrections if present.
8. Use markdown: ## headings, **bold** for names, - bullets for lists.`

  let userMessage = ''
  if (brainContext) {
    userMessage += `=== BRAIN KNOWLEDGE GRAPH ===\n\n${brainContext}\n\n`
  }
  if (unitListContext) {
    userMessage += `=== ${unitListContext}\n\n`
  }
  if (geminiResult?.answer) {
    userMessage += `=== WEB SEARCH RESULTS (Gemini with Google Search) ===\n\n${geminiResult.answer}\n\n`
  }
  userMessage += `---\n\nQuestion: ${body.question}`

  let answer: string
  let answerPath = 'unknown'

  const useClaudeParam = c.req.query('model') === 'claude'
  const useClaude = useClaudeParam && anthropicKey

  if (useClaude) {
    answerPath = 'claude'
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
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

  // Server-side entity linking — build map from all retrieved + connected nodes
  const entityMap = new Map<string, { nodeId: string; title: string }>()
  for (const node of [...results, ...connected]) {
    const key = node.title.toLowerCase()
    if (key.length > 2 && !entityMap.has(key)) {
      entityMap.set(key, { nodeId: node.id, title: node.title })
    }
  }
  answer = linkEntitiesInText(answer, entityMap)

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
    webSources: geminiResult?.sources ?? [],
    geminiCached: !!cachedGemini,
    webSource: cachedGemini ? 'cache' : geminiResult ? (geminiError ? 'scrape' : 'gemini') : 'none',
    errors: {
      ...(retrieveError ? { retrieve: retrieveError } : {}),
      ...(geminiError ? { gemini: geminiError } : {}),
    },
    debug: {
      retrieveHasResult: !!retrieveResult,
      retrieveResultCount: results.length,
      connectedCount2: connected.length,
      geminiHasResult: !!geminiResult,
      geminiAnswerLen: geminiResult?.answer?.length ?? 0,
      brainContextLen: brainContext.length,
    },
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
  const errorMessages: string[] = []
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
          id: vectorizeId(node.id),
          values: embResult.data[idx]!,
          metadata: {
            originalId: node.id,
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
        errorMessages.push(err instanceof Error ? err.message : String(err))
      }
    }
  }

  return c.json({
    indexed,
    errors,
    errorMessages: errorMessages.slice(0, 5),
    totalFiles: nodeFiles.length,
    allFiles: allNodeFiles,
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
