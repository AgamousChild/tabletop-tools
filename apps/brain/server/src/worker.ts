import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { filterBrowseNodes } from './lib/browse'
import { buildDatasheetLayout } from './lib/card-layout'
import { buildCrossRefs, loadIndexes } from './lib/cross-refs'
import { type EntityMap, getEntityIndex, linkEntitiesInContent } from './lib/entity-linker'
import { findErrataForNode } from './lib/errata-linker'
import { assembleContext, formatConversationalAnswer } from './lib/format'
import type { Node } from './lib/model'
import { retrieve } from './lib/retrieve'
import type { Env } from './types'

// ── Module-scope caches (persist across requests in the same Worker isolate) ──
let cachedErrataNodes: Node[] | null = null
let cachedEntityIndex: EntityMap | null = null
let cachedAllNodes: Node[] | null = null
let cacheManifestHash: string | null = null

async function getManifestHash(bucket: any): Promise<string> {
  const obj = await bucket.get('manifest.json')
  if (!obj) return ''
  const text = await obj.text()
  // Hash full content to detect any change
  let h = 0
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

async function getAllNodes(bucket: any): Promise<Node[]> {
  const hash = await getManifestHash(bucket)
  if (cachedAllNodes && cacheManifestHash === hash) return cachedAllNodes

  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return []
  const manifest = (await manifestObj.json()) as { files: Record<string, string> }
  const allNodes: Node[] = []
  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const obj = await bucket.get(file)
    if (!obj) continue
    const nodes = (await obj.json()) as Node[]
    allNodes.push(...nodes)
  }
  cachedAllNodes = allNodes
  cacheManifestHash = hash
  cachedErrataNodes = allNodes.filter((n) => n.category === 'faq' || n.category === 'commentary')
  return allNodes
}

async function getErrataNodes(bucket: any): Promise<Node[]> {
  if (cachedErrataNodes) return cachedErrataNodes
  await getAllNodes(bucket)
  return cachedErrataNodes ?? []
}

async function getCachedEntityIndex(bucket: any) {
  if (cachedEntityIndex) return cachedEntityIndex
  cachedEntityIndex = await getEntityIndex(bucket)
  return cachedEntityIndex
}

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
    origin: [
      origin,
      'http://localhost:3008',
      'http://localhost:3009',
      'http://localhost:3010',
      'http://localhost:3011',
    ],
    allowMethods: ['GET', 'POST'],
  })(c, next)
})

// ── Version ────────────────────────────────────────────────────────────────

app.get('/version', (c) => c.json({ version: c.env.BUILD_VERSION || 'dev' }))

// ── Browse endpoints ────────────────────────────────────────────────────────

/** Browse category definitions — each has a filter function over nodes */
const BROWSE_CATEGORIES: Array<{
  id: string
  label: string
  filter: (n: Node) => boolean
}> = [
  {
    id: 'core-rules',
    label: 'Core Rules',
    filter: (n) => {
      if (n.layer !== 'core') return false
      if (
        [
          'faq',
          'commentary',
          'challenger',
          'primary-mission',
          'secondary-mission',
          'twist',
          'deployment-zone',
          'terrain-layout',
        ].includes(n.category)
      )
        return false
      // Filter out table fragment nodes (titles like "+", "2+", single symbols)
      if (/^[+\-\d".\s]+$/.test(n.title)) return false
      // Filter out Tournament Companion nodes (previous season rules)
      if (n.id.startsWith('tc:')) return false
      return true
    },
  },
  {
    id: 'errata',
    label: 'Errata',
    filter: (n) => n.layer === 'errata' || n.category === 'faq' || n.category === 'commentary',
  },
  {
    id: 'ca-deployments',
    label: 'Chapter Approved Deployments',
    filter: (n) => n.category === 'deployment-zone',
  },
  {
    id: 'ca-terrain',
    label: 'Chapter Approved Terrain',
    filter: (n) => n.category === 'terrain-layout',
  },
  {
    id: 'ca-primary-missions',
    label: 'Chapter Approved Primary Missions',
    filter: (n) => n.category === 'primary-mission',
  },
  {
    id: 'ca-secondary-missions',
    label: 'Chapter Approved Secondary Missions',
    filter: (n) => n.category === 'secondary-mission' && !n.id.startsWith('tc:'),
  },
  {
    id: 'ca-twists',
    label: 'Chapter Approved Twists',
    filter: (n) => n.category === 'twist',
  },
  {
    id: 'ca-challengers',
    label: 'Chapter Approved Challenger Cards',
    filter: (n) => n.category === 'challenger',
  },
  {
    id: 'factions',
    label: 'Factions',
    filter: (n) => n.category === 'faction',
  },
  {
    id: 'army-rules',
    label: 'Army Rules',
    filter: (n) => n.category === 'army-rule',
  },
  {
    id: 'detachments',
    label: 'Detachments',
    filter: (n) => n.category === 'detachment-rule',
  },
  {
    id: 'stratagems',
    label: 'Stratagems',
    filter: (n) => n.category === 'stratagem',
  },
  {
    id: 'enhancements',
    label: 'Enhancements',
    // Filter out misclassified stat-line nodes (titles like "6\" 3+ 7+", "-3+ 7+", "10\" 2+ 6+")
    filter: (n) =>
      n.category === 'enhancement' && !/^[\d\-\u2011]/.test(n.title) && !/^\d+"/.test(n.title),
  },
  {
    id: 'units',
    label: 'Units',
    filter: (n) => n.category === 'datasheet',
  },
  {
    id: 'community',
    label: 'Community',
    filter: (n) => n.layer === 'community',
  },
]

app.get('/browse/layers', async (c) => {
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)
  if (!allNodes.length) return c.json({ layers: [] })

  const layers = BROWSE_CATEGORIES.map((cat) => {
    const count = allNodes.filter(cat.filter).length
    return { id: cat.id, label: cat.label, count }
  }).filter((l) => l.count > 0)

  return c.json({ layers })
})

app.get('/browse/nodes', async (c) => {
  const layer = c.req.query('layer')
  if (!layer) return c.json({ error: 'layer query param required' }, 400)

  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const pageSize = Math.min(Math.max(1, parseInt(c.req.query('pageSize') || '20')), 100)

  const allCached = await getAllNodes(c.env.BRAIN_BUCKET)
  if (!allCached.length) return c.json({ nodes: [], total: 0, page, pageSize, totalPages: 0 })

  const catDef = BROWSE_CATEGORIES.find((cat) => cat.id === layer)
  const allNodes = catDef
    ? allCached.filter(catDef.filter)
    : allCached.filter((n) => n.layer === layer)

  // Filter to top-level records only
  const filtered = filterBrowseNodes(allNodes)

  // Sort by category then title
  filtered.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.title.localeCompare(b.title)
  })

  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  return c.json({ nodes: paged, total, page, pageSize, totalPages })
})

app.get('/browse/node/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)
  const found = allNodes.find((n) => n.id === id)
  if (found) return c.json({ node: found })
  return c.json({ error: 'Node not found' }, 404)
})

app.get('/browse/unit/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)

  let datasheet: Node | null = null
  const weapons: Node[] = []
  const abilities: Node[] = []

  for (const n of allNodes) {
    if (n.id === id && n.category === 'datasheet') {
      datasheet = n
    } else if (n.datasheetId === id && n.category === 'weapon') {
      weapons.push(n)
    } else if (n.datasheetId === id && n.category === 'unit-ability') {
      abilities.push(n)
    }
  }

  if (!datasheet) return c.json({ error: 'Unit not found' }, 404)

  // Build a server-driven layout descriptor for datasheet cards.
  // The client uses this to render via LayoutRenderer without category-specific code.
  const layout = buildDatasheetLayout({ datasheet, weapons, abilities })

  return c.json({ datasheet, weapons, abilities, layout })
})

app.get('/browse/detachment/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)

  let detachment: Node | null = null
  const stratagems: Node[] = []
  const enhancements: Node[] = []
  const abilities: Node[] = []

  for (const n of allNodes) {
    if (n.id === id && n.category === 'detachment-rule') {
      detachment = n
    } else if (n.detachmentId === id || n.detachmentId === id.split(':').pop()) {
      if (n.category === 'stratagem') stratagems.push(n)
      else if (n.category === 'enhancement') enhancements.push(n)
      else if (n.category === 'faction-ability') abilities.push(n)
    }
  }

  if (!detachment) return c.json({ error: 'Detachment not found' }, 404)

  return c.json({ detachment, stratagems, enhancements, abilities })
})

app.get('/browse/army-rule/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)

  let armyRule: Node | null = null
  const subAbilities: Node[] = []

  for (const n of allNodes) {
    if (n.id === id && n.category === 'army-rule') {
      armyRule = n
    } else if (n.category === 'army-ability' && n.id.startsWith(id + ':')) {
      subAbilities.push(n)
    }
  }

  if (!armyRule) return c.json({ error: 'Army rule not found' }, 404)

  return c.json({ armyRule, subAbilities })
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
    page?: number
    pageSize?: number
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

  const page = Math.max(1, body.page ?? 1)
  const pageSize = Math.min(Math.max(1, body.pageSize ?? 10), 50)

  const env = {
    ai: c.env.AI,
    vectorize: c.env.BRAIN_INDEX,
    bucket: c.env.BRAIN_BUCKET,
  }

  const {
    detected,
    results,
    records: rawRecords,
  } = await retrieve(
    {
      query: body.query,
      limit: body.limit,
      filter: body.filter,
      includeConnected: false,
      dualEmbedding: false,
      returnRecords: true,
    },
    env,
  )

  if (!rawRecords) {
    return c.json({ detected, records: [], total: 0, page, pageSize, totalPages: 0, results })
  }

  // Use module-scope cached errata + entity index (loaded once per isolate)
  const errataNodes = await getErrataNodes(c.env.BRAIN_BUCKET)
  const entityIndex = await getCachedEntityIndex(c.env.BRAIN_BUCKET)
  const linkedRecords = rawRecords.map((record) => ({
    ...record,
    errata: findErrataForNode(record.primaryNode, errataNodes),
    primaryNode: {
      ...record.primaryNode,
      content: linkEntitiesInContent(record.primaryNode.content, entityIndex),
    },
  }))

  // Build nodeId → factionId/subfaction maps from all cached nodes
  const nodeFactionMap = new Map<string, string>()
  const nodeSubfactionMap = new Map<string, string>()
  const allCachedNodes = await getAllNodes(c.env.BRAIN_BUCKET)
  for (const n of allCachedNodes) {
    if (n.factionId) nodeFactionMap.set(n.id, n.factionId)
    if (n.subfaction) nodeSubfactionMap.set(n.id, n.subfaction)
  }

  // Infer faction + subfaction from top result if not detected from query
  let searchFactionScope = detected.factions
  let searchSubfaction = detected.subfaction
  if (
    searchFactionScope.length === 0 &&
    rawRecords.length > 0 &&
    rawRecords[0].primaryNode.factionId
  ) {
    searchFactionScope = [rawRecords[0].primaryNode.factionId]
    searchSubfaction = rawRecords[0].primaryNode.subfaction
  }

  // Build cross-refs using cached indexes (loaded once per Worker isolate)
  const { fwd, rev } = await loadIndexes(c.env.BRAIN_BUCKET)
  const records = buildCrossRefs(
    linkedRecords,
    fwd,
    rev,
    searchFactionScope,
    nodeFactionMap,
    nodeSubfactionMap,
    searchSubfaction,
  )

  // Paginate
  const total = records.length
  const totalPages = Math.ceil(total / pageSize)
  const paginatedRecords = records.slice((page - 1) * pageSize, page * pageSize)

  return c.json({ detected, records: paginatedRecords, total, page, pageSize, totalPages, results })
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

async function getCachedGemini(
  bucket: R2Bucket,
  question: string,
): Promise<CachedGeminiResult | null> {
  const key = `cache/gemini/${hashQuestion(question)}.json`
  const obj = await bucket.get(key)
  if (!obj) return null
  const cached = (await obj.json()) as CachedGeminiResult
  if (Date.now() - new Date(cached.cachedAt).getTime() > GEMINI_CACHE_TTL_MS) return null
  return cached
}

async function setCachedGemini(
  bucket: R2Bucket,
  question: string,
  result: { answer: string; sources: GeminiSource[] },
): Promise<void> {
  const key = `cache/gemini/${hashQuestion(question)}.json`
  const cached: CachedGeminiResult = { ...result, cachedAt: new Date().toISOString() }
  await bucket.put(key, JSON.stringify(cached))
}

// ── Gemini with Google Search grounding ─────────────────────────────────────

interface GeminiSource {
  url: string
  title: string
}

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

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
      }
    }>
  }

  const candidate = data.candidates?.[0]
  const answer =
    candidate?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('\n') ?? ''

  const sources: GeminiSource[] = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((ch: any) => ch.web?.uri)
    .map((ch: any) => ({ url: ch.web!.uri!, title: ch.web!.title ?? ch.web!.uri! }))

  return { answer, sources }
}

// ── Global entity index and linking — see lib/entity-linker.ts ─────────────

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
    retrieveError =
      retrieveOutcome.reason instanceof Error
        ? retrieveOutcome.reason.message
        : String(retrieveOutcome.reason)
  }

  if (geminiOutcome.status === 'fulfilled') {
    geminiResult = geminiOutcome.value
    // Cache fresh results (Gemini or scrape — not already-cached ones)
    if (geminiResult && !cachedGemini && geminiResult.answer) {
      setCachedGemini(c.env.BRAIN_BUCKET, body.question, geminiResult).catch(() => {})
    }
  } else {
    geminiError =
      geminiOutcome.reason instanceof Error
        ? geminiOutcome.reason.message
        : String(geminiOutcome.reason)
  }

  const detected = retrieveResult?.detected ?? {
    factions: [],
    strippedQuery: body.question,
    keywords: [],
  }
  const results = retrieveResult?.results ?? []
  const connected = retrieveResult?.connected ?? []
  const parentMap = retrieveResult?.parentMap ?? new Map<string, string>()

  // Attach errata to primary results so the LLM context includes corrections
  const errataNodesForAsk = await getErrataNodes(c.env.BRAIN_BUCKET)
  const primaryNodes = results as unknown as Node[]
  const primaryErrata: string[] = []
  for (const node of primaryNodes) {
    const errata = findErrataForNode(node as Node, errataNodesForAsk)
    for (const e of errata) {
      primaryErrata.push(`ERRATA for ${node.title}: ${e.content}`)
    }
  }

  // Build Node arrays for assembleContext
  const allConnected = connected as unknown as Node[]

  // Filter connected nodes by relevance to the actual question
  // Score each connected node: how many query keywords appear in its title/summary/content
  const queryWords = detected.strippedQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const mechanicKeywords = detected.keywords.map((k) => k.toLowerCase())
  const allQueryTerms = [...new Set([...queryWords, ...mechanicKeywords])]

  const MAX_CONNECTED_FOR_CONTEXT = 15
  const scoredConnected = allConnected.map((node) => {
    const text = `${node.title} ${node.summary} ${node.keywords.join(' ')}`.toLowerCase()
    let score = 0
    for (const term of allQueryTerms) {
      if (text.includes(term)) score++
    }
    return { node, score }
  })
  scoredConnected.sort((a, b) => b.score - a.score)
  const connectedNodes = scoredConnected
    .slice(0, MAX_CONNECTED_FOR_CONTEXT)
    .filter((s) => s.score > 0) // only include nodes with at least one keyword match
    .map((s) => s.node)

  // Assemble Brain context
  let brainContext = retrieveResult
    ? assembleContext(primaryNodes, connectedNodes, parentMap, detected.subfaction)
    : ''

  // Append errata corrections to context so the LLM always cites them
  if (primaryErrata.length > 0) {
    brainContext += '\n\n========================================\n'
    brainContext += 'ERRATA / FAQ CORRECTIONS (always mention these):\n'
    brainContext += '========================================\n\n'
    for (const e of primaryErrata) brainContext += `- ${e}\n`
  }

  // Find combo pairs
  let combos: string[] = []
  try {
    const fwdObj = await c.env.BRAIN_BUCKET.get('refs/forward-index.json')
    if (fwdObj) {
      const fwdIndex = (await fwdObj.json()) as Record<
        string,
        Array<{ targetId: string; rel: string; context: string }>
      >
      const allNodeIds = new Set([...results.map((n) => n.id), ...allConnected.map((n) => n.id)])
      const primaryIdSet = new Set(results.map((n) => n.id))

      const scoredCombos: Array<{ text: string; score: number }> = []
      const allRelevantNodes = [...results, ...allConnected]

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
            if (detected.keywords.some((k) => comboLower.includes(k))) {
              score = 0.5
            }
          }
          if (score > 0) {
            scoredCombos.push({ text: ref.context, score })
          }
        }
      }

      const seen = new Set<string>()
      const uniqueScored = scoredCombos
        .filter((c) => {
          if (seen.has(c.text)) return false
          seen.add(c.text)
          return true
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
      combos = uniqueScored.map((c) => c.text)

      if (combos.length > 0) {
        brainContext += '\n\n========================================\n'
        brainContext += 'COMPETITIVE COMBOS (abilities that stack together for maximum effect):\n'
        brainContext += '========================================\n\n'
        for (const combo of combos) {
          brainContext += `- ${combo}\n`
        }
      }
    }
  } catch {
    /* forward index not available — skip combos */
  }

  // If question asks for a faction's units, fetch the unit list
  let unitListContext = ''
  if (detected.factions.length > 0) {
    const unitListMatch = body.question.match(/\b(units?|datasheets?|army|roster|list)\b/i)
    if (unitListMatch) {
      try {
        const manifest = await c.env.BRAIN_BUCKET.get('manifest.json')
        if (manifest) {
          const manifestData = (await manifest.json()) as { files: Record<string, string> }
          const factionUnits: string[] = []
          for (const file of Object.keys(manifestData.files)) {
            if (!file.startsWith('nodes/faction-')) continue
            const obj = await c.env.BRAIN_BUCKET.get(file)
            if (!obj) continue
            const nodes = (await obj.json()) as Node[]
            for (const n of nodes) {
              if (
                n.category === 'datasheet' &&
                detected.factions.some(
                  (f) => n.factionId === f || n.factionId?.toLowerCase().replace(/\s+/g, '-') === f,
                )
              ) {
                factionUnits.push(n.title)
              }
            }
          }
          if (factionUnits.length > 0) {
            factionUnits.sort()
            unitListContext = `\n\nFACTION UNIT LIST (${detected.factions.join(', ')}):\n${factionUnits.map((u) => `- ${u}`).join('\n')}\n`
          }
        }
      } catch {
        /* skip unit list on error */
      }
    }
  }

  // Build the combined LLM prompt
  const factionScope =
    detected.factions.length > 0
      ? `\n\nIMPORTANT FACTION SCOPE: The user is asking about ${detected.subfaction || detected.factions.join(' / ')}. ONLY discuss abilities, stratagems, enhancements, and rules that are available to this specific faction. Do NOT mention abilities from other factions or chapters unless the user explicitly asks for a comparison. If a unit or ability belongs to a different faction or chapter, do NOT include it in your answer.`
      : ''

  const systemPrompt = `You are a Warhammer 40,000 10th Edition rules expert. Answer the user's SPECIFIC question using the provided context. Do NOT summarize the entire faction — only address what was asked.${factionScope}

CRITICAL: Focus on the question. If they ask "how does Oath of Moment work?" — explain Oath of Moment. Do NOT list every stratagem, enhancement, and ability the faction has.

Sources (in priority order):
1. BRAIN KNOWLEDGE GRAPH — official rules data (prefer this)
2. WEB SEARCH RESULTS — supplementary context

Rules:
- Name the specific unit/datasheet that has each ability
- Leader abilities are conferred by ATTACHING the character (not an aura)
- For faction/detachment abilities, state which detachment grants it
- Be precise about game mechanics. Cite errata if present.
- Use markdown: ## headings, **bold** for names, - bullets for lists
- Keep your answer focused and concise — under 500 words unless the question demands more`

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

    const claudeResponse = (await response.json()) as {
      content: Array<{ type: string; text: string }>
    }
    answer = claudeResponse.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
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
        answer = formatConversationalAnswer(
          body.question,
          connectedNodes,
          parentMap,
          detected.subfaction,
          combos,
        )
      }
    } else {
      answerPath = 'deterministic'
      answer = formatConversationalAnswer(
        body.question,
        connectedNodes,
        parentMap,
        detected.subfaction,
        combos,
      )
    }
  }

  // Server-side entity linking — global index + retrieved nodes
  const globalEntities = await getEntityIndex(c.env.BRAIN_BUCKET)
  const entityMap = new Map(globalEntities)
  // Override with retrieved nodes (more specific context)
  for (const node of [...results, ...connected]) {
    const key = node.title.toLowerCase()
    if (key.length > 2) {
      entityMap.set(key, { nodeId: node.id, title: node.title })
    }
  }
  answer = linkEntitiesInContent(answer, entityMap)

  return c.json({
    detected,
    answer,
    answerPath,
    contextLength: userMessage.length,
    connectedIds: connected.map((c) => c.id),
    reference: results,
    sources: results.map((n) => ({
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
  // Filter by faction + subfaction — infer from top result if not in query
  let factionScope = detected.factions
  let subfactionScope = detected.subfaction
  if (factionScope.length === 0 && results.length > 0 && results[0].factionId) {
    factionScope = [results[0].factionId]
    subfactionScope = results[0].subfaction
  }
  // Include both the parent faction AND the subfaction slug as allowed factionIds
  // (Blood Angels data exists under both factionId:"space-marines" and factionId:"blood-angels")
  const factionSet = factionScope.length > 0 ? new Set(factionScope) : null
  if (factionSet && subfactionScope) {
    factionSet.add(subfactionScope.replace(/\s+/g, '-'))
  }
  const allNodes = [...results, ...connected].filter((n) => {
    if (!factionSet) return true
    if (!n.factionId) return true // generic/core — always include
    if (!factionSet.has(n.factionId)) return false
    // If we have a subfaction scope, filter out other subfactions
    if (subfactionScope && n.subfaction && n.subfaction !== subfactionScope) return false
    return true
  })
  const seenIds = new Set<string>()
  const dedupedNodes = allNodes.filter((n) => {
    if (seenIds.has(n.id)) return false
    seenIds.add(n.id)
    return true
  })

  // Load ref indexes
  const [revObj, fwdObj] = await Promise.all([
    bucket.get('refs/reverse-index.json'),
    bucket.get('refs/forward-index.json'),
  ])

  const fwdIndex = fwdObj
    ? ((await fwdObj.json()) as Record<string, Array<{ targetId: string; rel: string }>>)
    : ({} as Record<string, Array<{ targetId: string; rel: string }>>)
  const revIndex = revObj
    ? ((await revObj.json()) as Record<string, Array<{ sourceId: string; rel: string }>>)
    : ({} as Record<string, Array<{ sourceId: string; rel: string }>>)

  const nodeIdSet = new Set(dedupedNodes.map((n) => n.id))

  // Walk eligible_for refs from datasheets to pull in their detachments
  const detachmentIdsToFetch = new Set<string>()
  for (const node of dedupedNodes) {
    if (node.category !== 'datasheet') continue
    const fwd = fwdIndex[node.id]
    if (!fwd) continue
    for (const ref of fwd) {
      if (ref.rel === 'eligible_for' && !nodeIdSet.has(ref.targetId)) {
        detachmentIdsToFetch.add(ref.targetId)
      }
    }
  }

  // Also walk eligible_for REVERSE — from detachments, find eligible units
  const unitIdsToFetch = new Set<string>()
  for (const node of dedupedNodes) {
    if (node.category !== 'detachment' && node.category !== 'detachment-rule') continue
    const rev = revIndex[node.id]
    if (!rev) continue
    for (const ref of rev) {
      if (ref.rel === 'eligible_for' && !nodeIdSet.has(ref.sourceId)) {
        unitIdsToFetch.add(ref.sourceId)
      }
    }
  }

  // Fetch both detachments (for units) and units (for detachments)
  const idsToFetch = new Set([...detachmentIdsToFetch, ...unitIdsToFetch])
  if (idsToFetch.size > 0) {
    const allCachedForGraph = await getAllNodes(bucket)
    for (const n of allCachedForGraph) {
      if (!idsToFetch.has(n.id)) continue
      if (factionSet && n.factionId && !factionSet.has(n.factionId)) continue
      if (subfactionScope && n.subfaction && n.subfaction !== subfactionScope) continue
      dedupedNodes.push(n as any)
      nodeIdSet.add(n.id)
    }
  }

  // Build edges from forward/reverse indexes — only between nodes in our set
  const edges: Array<{ source: string; target: string; rel: string }> = []

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

  const edgeSet = new Set(edges.map((e) => `${e.source}|${e.target}|${e.rel}`))
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

  // Attach errata to graph nodes
  const graphErrataNodes = await getErrataNodes(c.env.BRAIN_BUCKET)
  const nodesWithErrata = dedupedNodes.map((n) => ({
    ...n,
    errata: findErrataForNode(n as unknown as Node, graphErrataNodes),
  }))

  return c.json({ detected, nodes: nodesWithErrata, edges })
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

  const manifest = (await manifestObj.json()) as { files: Record<string, string> }
  const allNodeFiles = Object.keys(manifest.files).filter((f) => f.startsWith('nodes/'))
  const nodeFiles = targetFile ? [targetFile] : allNodeFiles

  let indexed = 0
  let errors = 0
  const errorMessages: string[] = []
  const BATCH_SIZE = 50 // Keep batches small for Workers CPU limits

  for (const file of nodeFiles) {
    const obj = await c.env.BRAIN_BUCKET.get(file)
    if (!obj) continue
    const nodes = (await obj.json()) as Node[]

    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE)
      const texts = batch.map((n) => `${n.title}. ${n.summary}. ${n.keywords.join(', ')}`)

      try {
        const embResult = (await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: texts,
        })) as { data: number[][] }

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

  return c.json({
    message: 'Brain sync via HTTP not yet implemented - use build-graph.ts CLI and upload to R2',
  })
})

export default {
  fetch: app.fetch,
}
