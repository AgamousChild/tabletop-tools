import { detectFactions, stripFactionFromQuery, extractMechanicKeywords, FACTION_PATTERNS, SUBFACTION_TO_PARENT } from './faction-detect'
import { fetchNodesFromR2, fetchConnectedNodes } from './fetch-nodes'
import type { Node } from './model'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrieveOptions {
  query: string
  limit?: number               // default 10, max 50
  filter?: {
    layer?: string
    category?: string
    factionId?: string
    phase?: string
  }
  includeConnected?: boolean   // Ask wants connected nodes; Search/Graph don't
  connectedDepth?: number      // default 1
  dualEmbedding?: boolean      // true for Ask — generates keyword embedding too
}

export interface EnrichedNode {
  id: string
  score: number                // Vectorize relevance score (0-1)
  title: string
  summary: string
  content: string
  layer: string
  category: string
  factionId?: string
  subfaction?: string
  phase?: string
  datasheetId?: string
  parentUnit?: string          // resolved from parentMap
  sources: Array<{ type: string; title: string; url?: string; page?: number; section?: string; timestamp?: string; retrievedAt: string }>
  keywords: string[]
}

export interface RetrieveResult {
  detected: {
    factions: string[]
    subfaction?: string
    strippedQuery: string
    keywords: string[]
  }
  results: EnrichedNode[]
  connected: EnrichedNode[]
  parentMap: Map<string, string>
}

// Environment dependencies (injected for testability)
// Uses `any` for ai/vectorize to avoid coupling to Cloudflare Workers types
// which have complex union return types that don't match our simplified interface.
export interface RetrieveEnv {
  ai: any       // Cloudflare AI binding — we call .run('@cf/baai/bge-base-en-v1.5', { text })
  vectorize: any // Cloudflare Vectorize binding — we call .query(vector, opts)
  bucket: any    // R2Bucket
}

// ── VectorizeMatch type ───────────────────────────────────────────────────────

interface VectorizeMatch {
  id: string
  score: number
  metadata?: Record<string, any>
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export async function retrieve(options: RetrieveOptions, env: RetrieveEnv): Promise<RetrieveResult> {
  const { query, filter, includeConnected = false, connectedDepth = 2, dualEmbedding = false } = options
  const limit = Math.min(options.limit ?? 10, 50)

  // Step 1: Detect factions
  const detected = detectFactions(query)

  // Step 2: Strip faction from query
  const strippedQuery = stripFactionFromQuery(query, detected.factions)

  // Step 3: Extract mechanic keywords
  const keywords = extractMechanicKeywords(query)

  // ── Faction browse mode ──────────────────────────────────────────────────
  // When the user typed just a faction/subfaction name (stripped query is empty
  // or very short) and no mechanic keywords, skip Vectorize entirely.
  // UNLESS the original query differs from just the faction name — it might be
  // a unit name that contains the faction (e.g., "Genestealers", "Grey Knights Terminator Squad").
  // Only use faction browse when the query IS the faction name (e.g., "necrons", "space marines").
  // If faction stripping consumed the query entirely but the original doesn't exactly match
  // a known faction pattern, fall through to semantic search — it might be a unit name
  // that contains a faction word (e.g., "Genestealers" contains "genestealer").
  const strippedIsEmpty = strippedQuery.trim().length <= 3
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const queryMatchesFactionExactly = FACTION_PATTERNS.some(({ pattern }) => {
    const re = new RegExp(`^\\s*${escRe(pattern)}s?\\s*$`, 'i')
    return re.test(query)
  }) || Object.keys(SUBFACTION_TO_PARENT).some(sf => {
    const re = new RegExp(`^\\s*${escRe(sf)}s?\\s*$`, 'i')
    return re.test(query)
  })
  const isFactionBrowse = detected.factions.length > 0
    && strippedIsEmpty
    && keywords.length === 0
    && queryMatchesFactionExactly

  if (isFactionBrowse) {
    return await factionBrowse(detected, strippedQuery, keywords, limit, includeConnected, connectedDepth, env, query)
  }

  // ── Semantic search mode (normal path) ───────────────────────────────────

  // Step 4: Generate embeddings
  // When faction stripping removes significant text (e.g., "Grey Knights Terminator Squad" → "Terminator Squad"),
  // also embed the original query so we find units whose name includes the faction.
  const embeddingText = strippedQuery || query
  const needsOriginalQuery = strippedQuery !== query && strippedQuery.length < query.length * 0.7

  const embeddingTexts = [embeddingText]
  if (needsOriginalQuery) embeddingTexts.push(query)

  const aiResult = await env.ai.run('@cf/baai/bge-base-en-v1.5', { text: embeddingTexts })
  const primaryVector = aiResult.data[0]!
  const originalVector = needsOriginalQuery ? aiResult.data[1]! : null

  // Step 5: If dualEmbedding and keywords exist, generate keyword embedding
  let keywordVector: number[] | null = null
  if (dualEmbedding && keywords.length > 0) {
    const keywordResult = await env.ai.run('@cf/baai/bge-base-en-v1.5', { text: [keywords.join(' ')] })
    keywordVector = keywordResult.data[0]!
  }

  // Build Vectorize query options — include faction filter if detected
  // Fetch extra results to compensate for post-filter loss and category re-ranking
  // Vectorize caps topK at 50 when returnMetadata='all'
  const topK = 50 // always fetch max to give category boosting the best pool
  const vectorizeOpts: any = { topK, returnMetadata: 'all' }
  if (detected.factions.length > 0 || filter) {
    const filterObj: Record<string, any> = {}
    if (filter?.layer) filterObj.layer = filter.layer
    if (filter?.category) filterObj.category = filter.category
    if (filter?.phase) filterObj.phase = filter.phase
    // Don't pre-filter by factionId in Vectorize — we do post-filtering to keep generic nodes
    vectorizeOpts.filter = filterObj
  }

  // Step 6: Query Vectorize — run unfiltered + datasheet-only in parallel to ensure datasheets are in the pool
  const datasheetOpts = { ...vectorizeOpts, filter: { ...vectorizeOpts.filter, category: 'datasheet' } }
  const [primaryMatches, datasheetMatches] = await Promise.all([
    env.vectorize.query(primaryVector, vectorizeOpts),
    env.vectorize.query(primaryVector, datasheetOpts),
  ])

  // Step 6b: If original query differs from stripped, also search with the unstripped text
  let originalMatches: { matches: VectorizeMatch[] } = { matches: [] }
  let originalDatasheetMatches: { matches: VectorizeMatch[] } = { matches: [] }
  if (originalVector) {
    ;[originalMatches, originalDatasheetMatches] = await Promise.all([
      env.vectorize.query(originalVector, vectorizeOpts),
      env.vectorize.query(originalVector, datasheetOpts),
    ])
  }

  // Step 7: Merge all query results — keep highest score per ID
  const mergedMap = new Map<string, VectorizeMatch>()
  for (const m of [...primaryMatches.matches, ...datasheetMatches.matches,
                    ...originalMatches.matches, ...originalDatasheetMatches.matches]) {
    const existing = mergedMap.get(m.id)
    if (!existing || m.score > existing.score) {
      mergedMap.set(m.id, m)
    }
  }

  // If dual embedding, also merge keyword query results
  if (keywordVector) {
    const [keywordMatches, keywordDatasheetMatches] = await Promise.all([
      env.vectorize.query(keywordVector, vectorizeOpts),
      env.vectorize.query(keywordVector, datasheetOpts),
    ])
    for (const m of [...keywordMatches.matches, ...keywordDatasheetMatches.matches]) {
      const existing = mergedMap.get(m.id)
      if (!existing || m.score > existing.score) {
        mergedMap.set(m.id, m)
      }
    }
  }

  let allMatches = [...mergedMap.values()]

  // Step 8: Post-filter by faction (keep faction-match + generic), then subfaction
  // BUT always keep datasheets whose title matches the original query (unit might be cross-faction)
  const detectedFactionSet = new Set(detected.factions)
  const queryLowerForFilter = query.toLowerCase().trim()

  let filtered = allMatches
  if (detectedFactionSet.size > 0) {
    filtered = allMatches.filter(m => {
      const mFaction = m.metadata?.factionId
      // Keep nodes with no faction (generic)
      if (!mFaction) return true
      // Keep nodes matching detected faction
      if (detectedFactionSet.has(mFaction)) return true
      // Keep datasheets whose title matches the original query (cross-faction units)
      if (m.metadata?.category === 'datasheet' &&
          (m.metadata?.title as string)?.toLowerCase() === queryLowerForFilter) return true
      return false
    })
  }

  // Subfaction post-filter: keep subfaction-match + generic (no subfaction)
  if (detected.subfaction) {
    const sub = detected.subfaction
    filtered = filtered.filter(m => {
      const mSub = m.metadata?.subfaction
      if (!mSub) return true
      return mSub === sub
    })
  }

  // Step 9: Sort — datasheets with title match first, then subfaction → faction → generic, then by score
  const queryLower = query.toLowerCase().trim()
  const sortedMatches = filtered.sort((a, b) => {
    // Exact title match on datasheets gets absolute highest priority — regardless of score
    const aDatasheet = a.metadata?.category === 'datasheet' ? 1 : 0
    const bDatasheet = b.metadata?.category === 'datasheet' ? 1 : 0
    const aTitle = (a.metadata?.title as string)?.toLowerCase() ?? ''
    const bTitle = (b.metadata?.title as string)?.toLowerCase() ?? ''
    const aTitleMatch = aDatasheet && aTitle === queryLower ? 1 : 0
    const bTitleMatch = bDatasheet && bTitle === queryLower ? 1 : 0
    if (aTitleMatch !== bTitleMatch) return bTitleMatch - aTitleMatch

    // Datasheets with title containing the query (or query containing the title) get priority
    const aContains = aDatasheet && (aTitle.includes(queryLower) || queryLower.includes(aTitle)) ? 1 : 0
    const bContains = bDatasheet && (bTitle.includes(queryLower) || queryLower.includes(bTitle)) ? 1 : 0
    if (aContains !== bContains) return bContains - aContains

    // Datasheets always rank above non-datasheets at any score — users searching by name want the unit
    if (aDatasheet !== bDatasheet) {
      return bDatasheet - aDatasheet
    }

    // Then faction/subfaction ranking
    const rankA = matchRank(a, detected.factions, detected.subfaction)
    const rankB = matchRank(b, detected.factions, detected.subfaction)
    if (rankA !== rankB) return rankA - rankB
    return b.score - a.score
  })

  // Step 10: Slice to limit
  const limitedMatches = sortedMatches.slice(0, limit)

  // Step 11: Fetch full node content from R2
  // Use originalId from metadata (Vectorize IDs may be hashed for long node IDs)
  const nodeIds = limitedMatches.map(m => (m.metadata?.originalId as string) || m.id)
  const nodes = await fetchNodesFromR2(env.bucket, nodeIds)
  const nodesById = new Map<string, Node>(nodes.map(n => [n.id, n]))

  // Step 12: Enrich results — merge Vectorize metadata (score) with full node content
  const results: EnrichedNode[] = limitedMatches
    .map(m => {
      const originalId = (m.metadata?.originalId as string) || m.id
      const node = nodesById.get(originalId)
      if (!node) return null
      return enrichNode(node, m.score, new Map())
    })
    .filter((n): n is EnrichedNode => n !== null)

  // Step 12b: Direct title match — find ALL datasheets whose title matches the original query
  // and inject them at position 0 if not already present. Handles cross-faction units
  // (e.g., "Genestealers" exists in both tyranids and genestealer-cults).
  const resultIdSet = new Set(results.map(r => r.id))
  const queryTitleLower = query.toLowerCase().trim()

  // Scan R2 node files for exact title matches
  const manifestObj = await env.bucket.get('manifest.json')
  if (manifestObj) {
    const manifest = await manifestObj.json() as { files: Record<string, string> }
    const titleMatches: EnrichedNode[] = []

    for (const file of Object.keys(manifest.files)) {
      if (!file.startsWith('nodes/')) continue
      const obj = await env.bucket.get(file)
      if (!obj) continue
      const fileNodes = await obj.json() as Node[]
      for (const n of fileNodes) {
        if (n.category === 'datasheet' &&
            n.title.toLowerCase() === queryTitleLower &&
            !resultIdSet.has(n.id)) {
          titleMatches.push(enrichNode(n, 1.0, new Map()))
          resultIdSet.add(n.id)
        }
      }
    }

    if (titleMatches.length > 0) {
      results.unshift(...titleMatches)
    }
  }

  // Step 13: If includeConnected, call fetchConnectedNodes
  let connected: EnrichedNode[] = []
  let parentMap = new Map<string, string>()

  if (includeConnected && nodeIds.length > 0) {
    const factionFilter = detected.factions.length > 0
      ? { factionId: detected.factions[0], subfaction: detected.subfaction }
      : undefined

    const connectedResult = await fetchConnectedNodes(env.bucket, nodeIds, connectedDepth, factionFilter)
    parentMap = connectedResult.parentMap

    // Step 14: Enrich connected nodes
    connected = connectedResult.nodes.map(node => enrichNode(node, 0, parentMap))
  }

  return {
    detected: {
      factions: detected.factions,
      subfaction: detected.subfaction,
      strippedQuery,
      keywords,
    },
    results,
    connected,
    parentMap,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a sort rank for a Vectorize match:
 * 0 = subfaction-matched, 1 = faction-matched, 2 = generic
 */
function matchRank(
  match: VectorizeMatch,
  detectedFactions: string[],
  subfaction?: string,
): number {
  const mFaction = match.metadata?.factionId
  const mSub = match.metadata?.subfaction

  // Subfaction-matched (most specific)
  if (subfaction && mSub === subfaction) return 0
  // Faction-matched
  if (mFaction && detectedFactions.includes(mFaction)) return 1
  // Generic (no faction)
  return 2
}

// ── Faction browse ──────────────────────────────────────────────────────────

/**
 * When the user typed just a faction name with no mechanic query,
 * fetch all nodes for that faction from R2 directly.
 * Sort: subfaction-specific first, then generic, grouped by category impact.
 */
async function factionBrowse(
  detected: { factions: string[]; subfaction?: string },
  strippedQuery: string,
  keywords: string[],
  limit: number,
  includeConnected: boolean,
  connectedDepth: number,
  env: RetrieveEnv,
  originalQuery?: string,
): Promise<RetrieveResult> {
  const factionId = detected.factions[0]!
  const subfaction = detected.subfaction

  // Load the faction's node file from R2 via the manifest
  // Faction nodes are stored as nodes/faction-{slug}.json
  const manifestObj = await env.bucket.get('manifest.json')
  if (!manifestObj) {
    return { detected: { factions: detected.factions, subfaction, strippedQuery, keywords }, results: [], connected: [], parentMap: new Map() }
  }
  const manifest = await manifestObj.json() as { files: Record<string, string> }

  // Collect all nodes for this faction from both faction and unit layer files
  const factionFile = `nodes/faction-${factionId}.json`
  const allNodes: Node[] = []

  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    // Load faction-specific file always
    // Also load core.json for generic rules
    if (file === factionFile || file === 'nodes/core.json') {
      const obj = await env.bucket.get(file)
      if (obj) {
        const nodes = await obj.json() as Node[]
        allNodes.push(...nodes)
      }
    }
  }

  // Filter: keep nodes matching factionId or generic (no factionId)
  let filtered = allNodes.filter(n => n.factionId === factionId || !n.factionId)

  // Subfaction filter: remove other chapters' content
  if (subfaction) {
    filtered = filtered.filter(n => {
      if (!n.subfaction) return true // generic — keep
      return n.subfaction === subfaction // same subfaction — keep; other subfactions — drop
    })
  }

  // Sort: subfaction first, then faction, then generic. Within each: datasheets before abilities before weapons.
  const CATEGORY_ORDER: Record<string, number> = {
    'detachment-rule': 0,
    'faction-ability': 1,
    'stratagem': 2,
    'enhancement': 3,
    'datasheet': 4,
    'unit-ability': 5,
    'weapon': 6,
  }

  filtered.sort((a, b) => {
    // Subfaction first
    const aSubRank = (subfaction && a.subfaction === subfaction) ? 0 : (!a.subfaction ? 1 : 2)
    const bSubRank = (subfaction && b.subfaction === subfaction) ? 0 : (!b.subfaction ? 1 : 2)
    if (aSubRank !== bSubRank) return aSubRank - bSubRank
    // Then by category
    const aCat = CATEGORY_ORDER[a.category] ?? 7
    const bCat = CATEGORY_ORDER[b.category] ?? 7
    if (aCat !== bCat) return aCat - bCat
    // Then alphabetical
    return a.title.localeCompare(b.title)
  })

  // No hard limit for faction browse — return all faction content
  // (limit only applies to Vectorize searches)
  const results: EnrichedNode[] = filtered.map(n => enrichNode(n, 1.0, new Map()))

  // Inject cross-faction datasheets whose title matches the original query
  // (e.g., "Genestealers" exists in both tyranids and genestealer-cults)
  if (originalQuery) {
    const titleLower = originalQuery.toLowerCase().trim()
    const resultIdSet = new Set(results.map(r => r.id))

    for (const file of Object.keys(manifest.files)) {
      if (!file.startsWith('nodes/') || file === factionFile) continue
      const obj = await env.bucket.get(file)
      if (!obj) continue
      const fileNodes = await obj.json() as Node[]
      for (const n of fileNodes) {
        if (n.category === 'datasheet' &&
            n.title.toLowerCase() === titleLower &&
            !resultIdSet.has(n.id)) {
          results.unshift(enrichNode(n, 1.0, new Map()))
          resultIdSet.add(n.id)
        }
      }
    }
  }

  return {
    detected: { factions: detected.factions, subfaction, strippedQuery, keywords },
    results,
    connected: [],
    parentMap: new Map(),
  }
}

function enrichNode(node: Node, score: number, parentMap: Map<string, string>): EnrichedNode {
  return {
    id: node.id,
    score,
    title: node.title,
    summary: node.summary,
    content: node.content,
    layer: node.layer,
    category: node.category,
    factionId: node.factionId,
    subfaction: node.subfaction,
    phase: node.phase,
    datasheetId: node.datasheetId,
    parentUnit: parentMap.get(node.id),
    sources: node.sources,
    keywords: node.keywords,
  }
}
