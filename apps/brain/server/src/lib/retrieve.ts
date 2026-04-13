import { detectFactions, stripFactionFromQuery, extractMechanicKeywords } from './faction-detect'
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
  const { query, filter, includeConnected = false, connectedDepth = 1, dualEmbedding = false } = options
  const limit = Math.min(options.limit ?? 10, 50)

  // Step 1: Detect factions
  const detected = detectFactions(query)

  // Step 2: Strip faction from query
  const strippedQuery = stripFactionFromQuery(query, detected.factions)

  // Step 3: Extract mechanic keywords
  const keywords = extractMechanicKeywords(query)

  // Step 4: Generate primary embedding
  const embeddingText = strippedQuery || query
  const aiResult = await env.ai.run('@cf/baai/bge-base-en-v1.5', { text: [embeddingText] })
  const primaryVector = aiResult.data[0]!

  // Step 5: If dualEmbedding and keywords exist, generate keyword embedding
  let keywordVector: number[] | null = null
  if (dualEmbedding && keywords.length > 0) {
    const keywordResult = await env.ai.run('@cf/baai/bge-base-en-v1.5', { text: [keywords.join(' ')] })
    keywordVector = keywordResult.data[0]!
  }

  // Build Vectorize query options — include faction filter if detected
  // Fetch extra results when faction-filtering to compensate for post-filter loss
  // Vectorize caps topK at 50 when returnMetadata='all'
  const fetchMultiplier = detected.factions.length > 0 ? 5 : 3
  const topK = Math.min(limit * fetchMultiplier, 50)
  const vectorizeOpts: any = { topK, returnMetadata: 'all' }
  if (detected.factions.length > 0 || filter) {
    const filterObj: Record<string, any> = {}
    if (filter?.layer) filterObj.layer = filter.layer
    if (filter?.category) filterObj.category = filter.category
    if (filter?.phase) filterObj.phase = filter.phase
    // Don't pre-filter by factionId in Vectorize — we do post-filtering to keep generic nodes
    vectorizeOpts.filter = filterObj
  }

  // Step 6: Query Vectorize with primary embedding
  const primaryMatches = await env.vectorize.query(primaryVector, vectorizeOpts)

  // Step 7: If dual embedding, do second Vectorize query and merge/deduplicate
  let allMatches: VectorizeMatch[]
  if (keywordVector) {
    const keywordMatches = await env.vectorize.query(keywordVector, vectorizeOpts)
    // Merge: keep the higher score when same ID appears in both
    const mergedMap = new Map<string, VectorizeMatch>()
    for (const m of primaryMatches.matches) {
      mergedMap.set(m.id, m)
    }
    for (const m of keywordMatches.matches) {
      const existing = mergedMap.get(m.id)
      if (!existing || m.score > existing.score) {
        mergedMap.set(m.id, m)
      }
    }
    allMatches = [...mergedMap.values()]
  } else {
    allMatches = primaryMatches.matches
  }

  // Step 8: Post-filter by faction (keep faction-match + generic), then subfaction
  const detectedFactionSet = new Set(detected.factions)

  let filtered = allMatches
  if (detectedFactionSet.size > 0) {
    filtered = allMatches.filter(m => {
      const mFaction = m.metadata?.factionId
      // Keep nodes with no faction (generic) OR matching detected faction
      if (!mFaction) return true
      return detectedFactionSet.has(mFaction)
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

  // Step 9: Sort — subfaction-matched first → faction-matched → generic, each group by score desc
  const sortedMatches = filtered.sort((a, b) => {
    const rankA = matchRank(a, detected.factions, detected.subfaction)
    const rankB = matchRank(b, detected.factions, detected.subfaction)
    if (rankA !== rankB) return rankA - rankB
    return b.score - a.score
  })

  // Step 10: Slice to limit
  const limitedMatches = sortedMatches.slice(0, limit)

  // Step 11: Fetch full node content from R2
  const nodeIds = limitedMatches.map(m => m.id)
  const nodes = await fetchNodesFromR2(env.bucket, nodeIds)
  const nodesById = new Map<string, Node>(nodes.map(n => [n.id, n]))

  // Step 12: Enrich results — merge Vectorize metadata (score) with full node content
  const results: EnrichedNode[] = limitedMatches
    .map(m => {
      const node = nodesById.get(m.id)
      if (!node) return null
      return enrichNode(node, m.score, new Map())
    })
    .filter((n): n is EnrichedNode => n !== null)

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
