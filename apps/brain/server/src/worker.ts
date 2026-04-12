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

  // 5. Assemble context for Claude — parentMap resolves unit names from graph
  const context = assembleContext(nodeContent, connected.nodes, connected.parentMap)

  // 6. Call LLM — use Workers AI (free) by default, Claude as optional upgrade
  const useClaudeParam = c.req.query('model') === 'claude'
  const useClaude = useClaudeParam && apiKey

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
    // If context is small enough, use the LLM. Otherwise, format deterministically.
    const MAX_LLM_CONTEXT = 20000

    if (userMessage.length <= MAX_LLM_CONTEXT) {
      try {
        const aiResult = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 2048,
        })
        answer = (aiResult as any).response ?? 'No response from model'
      } catch {
        // Fallback to deterministic formatting
        answer = formatDeterministicAnswer(body.question, connected.nodes, connected.parentMap)
      }
    } else {
      // Large context — format deterministically from graph data
      // Filter to faction-relevant nodes if a faction was detected
      let relevantNodes = connected.nodes
      if (factionHint) {
        const factionNodes = connected.nodes.filter(n => n.factionId === factionHint || !n.factionId)
        relevantNodes = factionNodes.length > 0 ? factionNodes : connected.nodes
      }
      answer = formatDeterministicAnswer(body.question, relevantNodes, connected.parentMap)
    }
  }

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

/**
 * Walk the graph from the given node IDs using both indexes.
 * Reverse index: find what points TO these nodes
 * Forward index: resolve part_of parents (ability → datasheet name)
 */
async function fetchConnectedNodes(
  bucket: R2Bucket,
  nodeIds: string[],
  depth: number,
  factionHint?: string,
): Promise<{ nodes: Node[]; parentMap: Map<string, string> }> {
  if (depth <= 0) return { nodes: [], parentMap: new Map() }

  // Load both indexes in parallel
  const [revObj, fwdObj] = await Promise.all([
    bucket.get('refs/reverse-index.json'),
    bucket.get('refs/forward-index.json'),
  ])
  if (!revObj) return { nodes: [], parentMap: new Map() }

  type RevEntry = { sourceId: string; rel: string; context: string; factionId?: string }
  type FwdEntry = { targetId: string; rel: string; context: string }

  const reverseIndex = await revObj.json() as Record<string, RevEntry[]>
  const forwardIndex = fwdObj
    ? await fwdObj.json() as Record<string, FwdEntry[]>
    : {} as Record<string, FwdEntry[]>

  // Step 1: Reverse lookup — find all nodes that reference our search results
  const inboundRefs: RevEntry[] = []
  for (const nodeId of nodeIds) {
    const refs = reverseIndex[nodeId]
    if (refs) inboundRefs.push(...refs)
  }

  if (inboundRefs.length === 0) return { nodes: [], parentMap: new Map() }

  // Step 2: Select which connected nodes to fetch
  // Priority: abilities/stratagems first (high impact), weapons last (high volume, low info)
  // Within each priority, faction-matching nodes come first
  const known = new Set(nodeIds)
  const uniqueRefs = new Map<string, RevEntry>()
  for (const r of inboundRefs) {
    if (!known.has(r.sourceId) && !uniqueRefs.has(r.sourceId)) {
      uniqueRefs.set(r.sourceId, r)
    }
  }

  // Categorize by ID prefix to determine priority without loading nodes
  // ability: = unit ability, det: = detachment/stratagem/enhancement, faction: = faction ability, weapon: = weapon
  function refPriority(id: string): number {
    if (id.startsWith('faction:')) return 0  // army-wide abilities — highest impact
    if (id.startsWith('det:')) return 1      // detachment rules, stratagems, enhancements
    if (id.startsWith('ability:')) return 2  // unit abilities (leader grants)
    if (id.startsWith('weapon:')) return 4   // weapons — lowest priority (high volume)
    return 3
  }

  const sortedRefs = [...uniqueRefs.entries()]
    .sort((a, b) => {
      // Priority first
      const pa = refPriority(a[0])
      const pb = refPriority(b[0])
      if (pa !== pb) return pa - pb
      // Then faction match
      const fa = a[1].factionId === factionHint ? 0 : 1
      const fb = b[1].factionId === factionHint ? 0 : 1
      return fa - fb
    })

  // Take ALL high-priority nodes (abilities, stratagems), cap weapons
  const highPriority = sortedRefs.filter(([id]) => refPriority(id) <= 3)
  const weapons = sortedRefs.filter(([id]) => refPriority(id) === 4)
  const selectedIds = [
    ...highPriority.map(([id]) => id),
    ...weapons.map(([id]) => id).slice(0, 15), // representative weapon sample
  ]

  if (selectedIds.length === 0) return { nodes: [], parentMap: new Map() }

  // Step 3: Forward lookup — for each connected node, find its part_of parent
  // This resolves: ability → datasheet, weapon → datasheet, stratagem → detachment
  const parentMap = new Map<string, string>() // child nodeId → parent nodeId
  const parentIdsToFetch = new Set<string>()

  for (const id of selectedIds) {
    const fwdRefs = forwardIndex[id]
    if (!fwdRefs) continue
    for (const ref of fwdRefs) {
      if (ref.rel === 'part_of') {
        parentMap.set(id, ref.targetId)
        if (!known.has(ref.targetId)) {
          parentIdsToFetch.add(ref.targetId)
        }
        break // first parent only
      }
    }
  }

  // Step 4: Fetch connected nodes + their parents in one batch
  const allToFetch = [...new Set([...selectedIds, ...parentIdsToFetch])]
    .filter(id => !known.has(id))

  const nodes = await fetchNodesFromR2(bucket, allToFetch)

  // Step 5: Resolve parentMap IDs to titles
  const nodeById = new Map<string, Node>()
  for (const n of nodes) nodeById.set(n.id, n)

  const resolvedParentMap = new Map<string, string>()
  for (const [childId, parentId] of parentMap) {
    const parent = nodeById.get(parentId)
    if (parent) resolvedParentMap.set(childId, parent.title)
  }

  return { nodes, parentMap: resolvedParentMap }
}

/**
 * Assemble node content into a structured context string for the LLM.
 * Uses parentMap from graph traversal to resolve unit/detachment names.
 */
function assembleContext(
  primaryNodes: Node[],
  connectedNodes: Node[],
  parentMap: Map<string, string>,
): string {
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

  // Connected nodes — grouped by category, sorted by impact
  if (connectedNodes.length > 0) {
    const groups: Record<string, Node[]> = {
      'faction-ability': [],
      'detachment-rule': [],
      'stratagem': [],
      'enhancement': [],
      'unit-ability': [],
      'weapon': [],
      'datasheet': [],
      'other': [],
    }
    for (const n of connectedNodes) {
      const key = groups[n.category] ? n.category : 'other'
      groups[key]!.push(n)
    }

    parts.push('--- Connected rules (ordered by impact: army-wide → detachment → leader/unit → weapon) ---')
    parts.push('')

    for (const n of groups['faction-ability']!) {
      const parent = parentMap.get(n.id)
      parts.push(`### ${n.title} [faction-ability${n.factionId ? `, ${n.factionId}` : ''}${parent ? `, from detachment: ${parent}` : ''}]`)
      parts.push(n.content || n.summary)
      parts.push('')
    }

    for (const n of groups['detachment-rule']!) {
      parts.push(`### ${n.title} [detachment-rule${n.factionId ? `, ${n.factionId}` : ''}]`)
      parts.push(n.content || n.summary)
      parts.push('')
    }

    for (const n of groups['stratagem']!) {
      const parent = parentMap.get(n.id)
      parts.push(`### ${n.title} [stratagem${n.factionId ? `, ${n.factionId}` : ''}${parent ? `, detachment: ${parent}` : ''}]`)
      parts.push(n.content || n.summary)
      parts.push('')
    }

    for (const n of groups['enhancement']!) {
      const parent = parentMap.get(n.id)
      parts.push(`### ${n.title} [enhancement${n.factionId ? `, ${n.factionId}` : ''}${parent ? `, detachment: ${parent}` : ''}]`)
      parts.push(n.content || n.summary)
      parts.push('')
    }

    for (const n of groups['unit-ability']!) {
      const parent = parentMap.get(n.id)
      parts.push(`### ${n.title} [unit-ability, ON UNIT: ${parent || 'unknown unit'}${n.factionId ? `, ${n.factionId}` : ''}]`)
      parts.push(n.content || n.summary)
      parts.push('')
    }

    for (const n of groups['weapon']!) {
      const parent = parentMap.get(n.id)
      parts.push(`### ${n.title} [weapon, ON UNIT: ${parent || 'unknown unit'}${n.factionId ? `, ${n.factionId}` : ''}]`)
      parts.push(n.summary)
      parts.push('')
    }

    for (const n of groups['datasheet']!) {
      parts.push(`### ${n.title} [datasheet${n.factionId ? `, ${n.factionId}` : ''}]`)
      parts.push(n.summary)
      parts.push('')
    }

    for (const n of groups['other']!) {
      parts.push(`### ${n.title} [${n.category}]`)
      parts.push(n.summary)
      parts.push('')
    }
  }

  return parts.join('\n')
}

/** Strip flavor/lore text, keep only mechanical rules content. */
function stripFlavorText(text: string): string {
  return text
    // Remove italic blocks (lore/flavor)
    .replace(/\*[^*]{20,}\*/g, '')
    // Remove lines that are pure lore (no rules keywords)
    .split('\n')
    .filter(line => {
      const l = line.trim()
      if (!l) return false
      // Keep lines with game mechanics indicators
      if (/\*\*(WHEN|TARGET|EFFECT|Type|CP|Turn|Phase|Cost|Range|Role|Keywords|Composition|Points|Transport|Loadout|Damaged):/i.test(l)) return true
      if (/\[SUSTAINED|LETHAL|DEVASTATING|HAZARDOUS|BLAST|TORRENT|MELTA|LANCE|ANTI-|IGNORES|INDIRECT|TWIN|RAPID|PISTOL|HEAVY|ASSAULT|ONE SHOT/i.test(l)) return true
      if (/\d\+|D\d|re-roll|wound|hit|save|attack|model|unit|phase|turn|Engagement Range|Battle-shock/i.test(l)) return true
      if (/Detachment Ability:|Ability:|Enhancement:/i.test(l)) return true
      // Skip pure narrative (long text without mechanical keywords)
      if (l.length > 80 && !/\d/.test(l) && !/\[/.test(l)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n')
    .trim()
}

/**
 * Format an answer directly from graph data without an LLM.
 * For data-lookup queries where the graph traversal already found everything.
 */
function formatDeterministicAnswer(
  question: string,
  nodes: Node[],
  parentMap: Map<string, string>,
): string {
  const groups: Record<string, Array<{ title: string; unit: string; content: string; faction: string }>> = {
    'Faction/Army-Wide Abilities': [],
    'Detachment Rules': [],
    'Stratagems': [],
    'Enhancements': [],
    'Character/Leader Abilities (affect attached unit)': [],
    'Unit Abilities': [],
    'Weapons': [],
    'Other': [],
  }

  for (const n of nodes) {
    const parent = parentMap.get(n.id) ?? ''
    const entry = {
      title: n.title,
      unit: parent,
      content: n.content || n.summary,
      faction: n.factionId ?? '',
    }

    // Strip flavor text — only keep mechanical rules content
    // Flavor text is usually italicized (*text*) or is the first paragraph before any rules keywords
    entry.content = stripFlavorText(entry.content)

    switch (n.category) {
      case 'faction-ability':
        groups['Faction/Army-Wide Abilities']!.push(entry)
        break
      case 'detachment-rule':
        entry.content = '' // detachment rules are context — just the name matters
        groups['Detachment Rules']!.push(entry)
        break
      case 'stratagem':
        groups['Stratagems']!.push(entry)
        break
      case 'enhancement':
        groups['Enhancements']!.push(entry)
        break
      case 'unit-ability': {
        // Determine if this is a leader ability (conferred to attached unit)
        const desc = (n.content || '').toLowerCase()
        if (desc.includes('leading a unit') || desc.includes('this model is leading') || desc.includes("model's unit")) {
          groups['Character/Leader Abilities (affect attached unit)']!.push(entry)
        } else {
          groups['Unit Abilities']!.push(entry)
        }
        break
      }
      case 'weapon':
        groups['Weapons']!.push(entry)
        break
      case 'datasheet':
        break // skip datasheets in the answer
      default:
        groups['Other']!.push(entry)
    }
  }

  const parts: string[] = []
  parts.push(`Results for: "${question}"\n`)

  for (const [groupName, entries] of Object.entries(groups)) {
    if (entries.length === 0) continue
    parts.push(`## ${groupName} (${entries.length})`)
    for (const e of entries) {
      const unitInfo = e.unit ? ` — on **${e.unit}**` : ''
      const factionInfo = e.faction ? ` (${e.faction})` : ''
      const contentInfo = e.content ? `: ${e.content}` : ''
      parts.push(`- **${e.title}**${unitInfo}${factionInfo}${contentInfo}`)
    }
    parts.push('')
  }

  parts.push(`\n*${nodes.length} total results from the knowledge graph. Source: Wahapedia 10th Edition, Core Rules.*`)
  return parts.join('\n')
}

export default {
  fetch: app.fetch,
}
