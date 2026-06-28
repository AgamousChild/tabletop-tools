import { type EditionFilter, nodeMatchesEdition } from './edition'
import {
  detectFactions,
  extractMechanicKeywords,
  FACTION_PATTERNS,
  stripFactionFromQuery,
  SUBFACTION_TO_PARENT,
} from './faction-detect'
import { fetchConnectedNodes, fetchNodesFromR2 } from './fetch-nodes'
import type { Node } from './model'
import type { AggregatedRecord } from './records'
import { aggregateToRecords, classifyNode, fetchAllChildren } from './records'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetrieveOptions {
  query: string
  limit?: number // default 10, max 50
  filter?: {
    layer?: string
    category?: string
    factionId?: string
    phase?: string
  }
  includeConnected?: boolean // Ask wants connected nodes; Search/Graph don't
  connectedDepth?: number // default 1
  dualEmbedding?: boolean // true for Ask — generates keyword embedding too
  returnRecords?: boolean // Search wants aggregated AggregatedRecord[]; Ask/Graph don't
  page?: number // 1-based page number (used by callers, not by retrieve itself)
  pageSize?: number // page size (used by callers, not by retrieve itself)
  /** Switchable edition filter. Defaults to 'any' (no filter). */
  edition?: EditionFilter
}

export interface EnrichedNode {
  id: string
  score: number // Vectorize relevance score (0-1)
  title: string
  summary: string
  content: string
  layer: string
  category: string
  factionId?: string
  factionName?: string // Preferred display name (e.g., "SPACE MARINES")
  subfaction?: string
  phase?: string
  datasheetId?: string
  edition?: string
  parentUnit?: string // resolved from parentMap
  sources: Array<{
    type: string
    title: string
    url?: string
    page?: number
    section?: string
    timestamp?: string
    retrievedAt: string
  }>
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
  /** Populated when RetrieveOptions.returnRecords is true. Undefined otherwise. */
  records?: AggregatedRecord[]
  /** The edition filter that was actually applied (after any fallback). */
  edition?: EditionFilter
  /** True when the requested edition produced no results and we widened the filter. */
  fallback?: boolean
  /** The edition originally requested when a fallback was applied. */
  fallbackFrom?: EditionFilter
}

// Environment dependencies (injected for testability)
// Uses `any` for ai/vectorize to avoid coupling to Cloudflare Workers types
// which have complex union return types that don't match our simplified interface.
export interface RetrieveEnv {
  ai: any // Cloudflare AI binding — we call .run('@cf/baai/bge-base-en-v1.5', { text })
  vectorize: any // Cloudflare Vectorize binding — we call .query(vector, opts)
  bucket: any // R2Bucket
}

// ── VectorizeMatch type ───────────────────────────────────────────────────────

interface VectorizeMatch {
  id: string
  score: number
  metadata?: Record<string, any>
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export async function retrieve(
  options: RetrieveOptions,
  env: RetrieveEnv,
): Promise<RetrieveResult> {
  const {
    query,
    filter,
    includeConnected = false,
    connectedDepth = 2,
    dualEmbedding = false,
  } = options
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
  const queryMatchesFactionExactly =
    FACTION_PATTERNS.some(({ pattern }) => {
      const re = new RegExp(`^\\s*${escRe(pattern)}s?\\s*$`, 'i')
      return re.test(query)
    }) ||
    Object.keys(SUBFACTION_TO_PARENT).some((sf) => {
      const re = new RegExp(`^\\s*${escRe(sf)}s?\\s*$`, 'i')
      return re.test(query)
    })
  const isFactionBrowse =
    detected.factions.length > 0 &&
    strippedIsEmpty &&
    keywords.length === 0 &&
    queryMatchesFactionExactly

  if (isFactionBrowse) {
    // Try to find the faction root node first — if it exists, return it as the
    // single result with its direct connections. Much cleaner than dumping 1000+ nodes.
    const factionRootResult = await factionRootBrowse(detected, env)
    if (factionRootResult) {
      return applyEditionToResult(factionRootResult, options.edition ?? 'any', query)
    }

    // Fallback: old-style faction browse (for factions without a root node)
    const browseResult = await factionBrowse(
      detected,
      strippedQuery,
      keywords,
      limit,
      includeConnected,
      connectedDepth,
      env,
      query,
      options.returnRecords,
    )
    return applyEditionToResult(browseResult, options.edition ?? 'any', query)
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
    const keywordResult = await env.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [keywords.join(' ')],
    })
    keywordVector = keywordResult.data[0]!
  }

  // Build Vectorize query options — include faction filter if detected
  // Fetch extra results to compensate for post-filter loss and category re-ranking
  // Vectorize caps topK at 50 when returnMetadata='all'
  const topK = 50 // always fetch max to give category boosting the best pool
  const vectorizeOpts: any = { topK, returnMetadata: 'all' }
  // Edition pre-filter: when caller asked for a specific edition, push it into
  // Vectorize so candidates get shed before the R2 fetch. Skip for 'any'.
  // The post-`applyEditionFilter` step below stays in place as defence in depth
  // (catches mis-indexed nodes and the 'unknown' sentinel from /index-vectors).
  const editionPreFilter: EditionFilter = options.edition ?? 'any'
  const hasEditionPreFilter = editionPreFilter !== 'any'
  if (detected.factions.length > 0 || filter || hasEditionPreFilter) {
    const filterObj: Record<string, any> = {}
    if (filter?.layer) filterObj.layer = filter.layer
    if (filter?.category) filterObj.category = filter.category
    if (filter?.phase) filterObj.phase = filter.phase
    if (hasEditionPreFilter) filterObj.edition = editionPreFilter
    // Don't pre-filter by factionId in Vectorize — we do post-filtering to keep generic nodes
    vectorizeOpts.filter = filterObj
  }

  // Step 6: Query Vectorize — single unfiltered query to get all record types
  const primaryMatches = await env.vectorize.query(primaryVector, vectorizeOpts)

  // Step 6b: If original query differs from stripped, also search with the unstripped text
  let originalMatches: { matches: VectorizeMatch[] } = { matches: [] }
  if (originalVector) {
    originalMatches = await env.vectorize.query(originalVector, vectorizeOpts)
  }

  // Step 7: Merge all query results — keep highest score per ID
  const mergedMap = new Map<string, VectorizeMatch>()
  for (const m of [...primaryMatches.matches, ...originalMatches.matches]) {
    const existing = mergedMap.get(m.id)
    if (!existing || m.score > existing.score) {
      mergedMap.set(m.id, m)
    }
  }

  // If dual embedding, also merge keyword query results
  if (keywordVector) {
    const keywordMatches = await env.vectorize.query(keywordVector, vectorizeOpts)
    for (const m of keywordMatches.matches) {
      const existing = mergedMap.get(m.id)
      if (!existing || m.score > existing.score) {
        mergedMap.set(m.id, m)
      }
    }
  }

  const allMatches = [...mergedMap.values()]

  // Step 8: Post-filter by faction (keep faction-match + generic), then subfaction
  // BUT always keep datasheets whose title matches the original query (unit might be cross-faction)
  const detectedFactionSet = new Set(detected.factions)
  const queryLowerForFilter = query.toLowerCase().trim()

  let filtered = allMatches
  if (detectedFactionSet.size > 0) {
    filtered = allMatches.filter((m) => {
      const mFaction = m.metadata?.factionId
      // Keep nodes with no faction (generic)
      if (!mFaction) return true
      // Keep nodes matching detected faction
      if (detectedFactionSet.has(mFaction)) return true
      // Keep datasheets whose title matches the original query (cross-faction units)
      if (
        m.metadata?.category === 'datasheet' &&
        (m.metadata?.title as string)?.toLowerCase() === queryLowerForFilter
      )
        return true
      return false
    })
  }

  // Subfaction post-filter: keep subfaction-match + generic (no subfaction)
  if (detected.subfaction) {
    const sub = detected.subfaction
    filtered = filtered.filter((m) => {
      const mSub = m.metadata?.subfaction
      if (!mSub) return true
      return mSub === sub
    })
  }

  // Step 9: Sort — exact title match first, then by score
  const queryLower = query.toLowerCase().trim()
  const sortedMatches = filtered.sort((a, b) => {
    const aTitle = (a.metadata?.title as string)?.toLowerCase() ?? ''
    const bTitle = (b.metadata?.title as string)?.toLowerCase() ?? ''

    // Exact title match gets absolute highest priority — any category
    const aTitleExact = aTitle === queryLower ? 1 : 0
    const bTitleExact = bTitle === queryLower ? 1 : 0
    if (aTitleExact !== bTitleExact) return bTitleExact - aTitleExact

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
  const nodeIds = limitedMatches.map((m) => (m.metadata?.originalId as string) || m.id)
  const nodes = await fetchNodesFromR2(env.bucket, nodeIds)
  const nodesById = new Map<string, Node>(nodes.map((n) => [n.id, n]))

  // Step 12: Enrich results — merge Vectorize metadata (score) with full node content
  // (let, not const — edition post-filter may reassign at end of pipeline)
  let results: EnrichedNode[] = limitedMatches
    .map((m) => {
      const originalId = (m.metadata?.originalId as string) || m.id
      const node = nodesById.get(originalId)
      if (!node) return null
      return enrichNode(node, m.score, new Map())
    })
    .filter((n): n is EnrichedNode => n !== null)

  // Step 12b: Direct title match — find ALL nodes whose title matches the original query
  // and inject them at position 0 if not already present. Covers cross-faction units,
  // army rules, CA cards, tournament companion rules, etc.
  // Skip child categories (weapons, abilities) — they'll be aggregated into parent records.
  const CHILD_CATEGORIES = new Set([
    'weapon',
    'unit-ability',
    'wargear-option',
    'leader-attachment',
    'unit-composition',
  ])
  const resultIdSet = new Set(results.map((r) => r.id))
  const queryTitleLower = query.toLowerCase().trim()

  const manifestObj = await env.bucket.get('manifest.json')
  if (manifestObj) {
    const manifest = (await manifestObj.json()) as { files: Record<string, string> }
    const titleMatches: EnrichedNode[] = []

    for (const file of Object.keys(manifest.files)) {
      if (!file.startsWith('nodes/')) continue
      const obj = await env.bucket.get(file)
      if (!obj) continue
      const fileNodes = (await obj.json()) as Node[]
      for (const n of fileNodes) {
        if (
          !CHILD_CATEGORIES.has(n.category) &&
          n.title.toLowerCase() === queryTitleLower &&
          !resultIdSet.has(n.id)
        ) {
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
    const factionFilter =
      detected.factions.length > 0
        ? { factionId: detected.factions[0], subfaction: detected.subfaction }
        : undefined

    const connectedResult = await fetchConnectedNodes(
      env.bucket,
      nodeIds,
      connectedDepth,
      factionFilter,
    )
    parentMap = connectedResult.parentMap

    // Step 14: Enrich connected nodes
    connected = connectedResult.nodes.map((node) => enrichNode(node, 0, parentMap))
  }

  // Step 15: Aggregate into records (only when requested)
  // Build allResultNodes in the SAME ORDER as `results` (which has exact title matches first)
  let records: AggregatedRecord[] | undefined
  if (options.returnRecords) {
    const allResultNodes: Node[] = []
    const seenIds = new Set<string>()
    // Follow `results` ordering (exact matches first, then scored results)
    for (const r of results) {
      if (seenIds.has(r.id)) continue
      // Try to find in already-fetched nodes first
      const existing = nodes.find((n) => n.id === r.id)
      if (existing) {
        allResultNodes.push(existing)
        seenIds.add(r.id)
      } else {
        // Fetch from R2 (title-match injection)
        const fetched = await fetchNodesFromR2(env.bucket, [r.id])
        for (const n of fetched) {
          if (!seenIds.has(n.id)) {
            allResultNodes.push(n)
            seenIds.add(n.id)
          }
        }
      }
    }
    records = await buildRecords(allResultNodes, env.bucket)
  }

  // ── Edition post-filter (Step 10 of 2026-06-27-data-problems-followup) ──
  // Wahapedia is stuck on 10e; BSData+MFM are the 11e source. Apply the filter
  // here (post-Vectorize) because edition isn't yet in Vectorize metadata —
  // pushing it upstream would require re-indexing all ~25k nodes.
  const editionFilter: EditionFilter = options.edition ?? 'any'
  const filteredOut = applyEditionFilter({ results, connected, records }, editionFilter)

  let appliedEdition: EditionFilter = editionFilter
  let fallback = false
  let fallbackFrom: EditionFilter | undefined

  if (editionFilter === '11th' && filteredOut.results.length === 0 && results.length > 0) {
    // Soft-fallback: 11e returned nothing but we had pre-filter hits. Widen to
    // any-edition and tag the response so the caller can show a banner.
    // Don't fall back for 10e/9e — those are explicit historical queries.
    console.warn(`[retrieve] edition=11th returned 0 results for "${query}"; falling back to any`)
    fallback = true
    fallbackFrom = '11th'
    appliedEdition = 'any'
  } else {
    results = filteredOut.results
    connected = filteredOut.connected
    records = filteredOut.records
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
    records,
    edition: appliedEdition,
    ...(fallback ? { fallback, fallbackFrom } : {}),
  }
}

/**
 * Wrap a RetrieveResult from the faction-browse paths with edition filtering +
 * soft-fallback semantics. Mirrors the inline filter in the semantic-search
 * path so every retrieval-mode return value honours `options.edition`.
 */
function applyEditionToResult(
  result: RetrieveResult,
  edition: EditionFilter,
  query: string,
): RetrieveResult {
  if (edition === 'any') {
    return { ...result, edition: 'any' }
  }
  const filtered = applyEditionFilter(
    { results: result.results, connected: result.connected, records: result.records },
    edition,
  )

  if (edition === '11th' && filtered.results.length === 0 && result.results.length > 0) {
    console.warn(
      `[retrieve] edition=11th returned 0 results for "${query}" (faction-browse); falling back to any`,
    )
    return {
      ...result,
      edition: 'any',
      fallback: true,
      fallbackFrom: '11th',
    }
  }

  return {
    ...result,
    results: filtered.results,
    connected: filtered.connected,
    records: filtered.records,
    edition,
  }
}

/**
 * Filter a retrieval bundle by edition. `any` returns the input unchanged.
 * Records are filtered by their primaryNode's edition — children carry their
 * parent's edition by construction, so we don't need to drill in further.
 */
function applyEditionFilter(
  bundle: {
    results: EnrichedNode[]
    connected: EnrichedNode[]
    records: AggregatedRecord[] | undefined
  },
  edition: EditionFilter,
): {
  results: EnrichedNode[]
  connected: EnrichedNode[]
  records: AggregatedRecord[] | undefined
} {
  if (edition === 'any') return bundle
  return {
    results: bundle.results.filter((r) => nodeMatchesEdition({ edition: r.edition }, edition)),
    connected: bundle.connected.filter((r) => nodeMatchesEdition({ edition: r.edition }, edition)),
    records: bundle.records?.filter((rec) => nodeMatchesEdition(rec.primaryNode, edition)),
  }
}

// ── buildRecords ──────────────────────────────────────────────────────────────

/**
 * Aggregate a list of search-result nodes into AggregatedRecord[].
 *
 * 1. Build an allNodes map from the already-fetched nodes.
 * 2. Determine which container IDs (primary nodes) are missing from allNodes —
 *    this covers both weapon→datasheet and army-rule-sub-rule→parent scenarios.
 * 3. Fetch missing primaries from R2 in one batch.
 * 4. Aggregate nodes into records.
 * 5. Fetch ALL children for unit records (complete weapon/ability lists).
 */
async function buildRecords(
  nodes: Node[],
  bucket: RetrieveEnv['bucket'],
): Promise<AggregatedRecord[]> {
  // Step 1: Build allNodes map from already-fetched nodes
  const allNodesMap = new Map<string, Node>()
  for (const node of nodes) allNodesMap.set(node.id, node)

  // Step 2: Find container IDs that are missing from allNodesMap.
  //         classifyNode gives us the containerId for each node — if a weapon maps
  //         to its parent datasheet, or an army-rule sub-rule maps to its parent,
  //         we need that parent in the map before we can build the record.
  const missingContainerIds = new Set<string>()
  for (const node of nodes) {
    const { containerId } = classifyNode(node)
    if (containerId !== node.id && !allNodesMap.has(containerId)) {
      missingContainerIds.add(containerId)
    }
  }

  // Step 3: Fetch missing primaries in one batch
  if (missingContainerIds.size > 0) {
    const parentNodes = await fetchNodesFromR2(bucket, [...missingContainerIds])
    for (const pn of parentNodes) allNodesMap.set(pn.id, pn)
  }

  // Step 4: Aggregate
  const records = aggregateToRecords(nodes, allNodesMap)

  // Step 5: Fetch ALL children for unit records (weapons, abilities, etc.)
  const datasheetIds = records.filter((r) => r.type === 'unit').map((r) => r.primaryNode.id)

  if (datasheetIds.length > 0) {
    const allChildren = await fetchAllChildren(bucket, datasheetIds)
    const childrenByParent = new Map<string, Node[]>()
    for (const child of allChildren) {
      if (!child.datasheetId) continue
      if (!childrenByParent.has(child.datasheetId)) childrenByParent.set(child.datasheetId, [])
      childrenByParent.get(child.datasheetId)!.push(child)
    }
    for (const record of records) {
      if (record.type === 'unit') {
        const allKids = childrenByParent.get(record.primaryNode.id)
        if (allKids) record.childNodes = allKids
      }
    }
  }

  return records
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a sort rank for a Vectorize match:
 * 0 = subfaction-matched, 1 = faction-matched, 2 = generic
 */
function matchRank(match: VectorizeMatch, detectedFactions: string[], subfaction?: string): number {
  const mFaction = match.metadata?.factionId
  const mSub = match.metadata?.subfaction

  // Subfaction-matched (most specific)
  if (subfaction && mSub === subfaction) return 0
  // Faction-matched
  if (mFaction && detectedFactions.includes(mFaction)) return 1
  // Generic (no faction)
  return 2
}

// ── Faction root browse ─────────────────────────────────────────────────────

/**
 * When the user searches a faction name, find the faction root node and return
 * it as the single result with its direct connections (army rules, detachments).
 * Returns null if no faction root node exists for this faction.
 */
async function factionRootBrowse(
  detected: { factions: string[]; subfaction?: string },
  env: RetrieveEnv,
): Promise<RetrieveResult | null> {
  const factionId = detected.factions[0]!
  const subfaction = detected.subfaction

  // Determine the faction root node ID
  // Subfactions use their slug directly: faction-root:blood-angels
  // Regular factions: faction-root:orks
  const rootId = subfaction
    ? `faction-root:${subfaction.replace(/\s+/g, '-')}`
    : `faction-root:${factionId}`

  // Load all nodes to find the root and its connections
  const manifestObj = await env.bucket.get('manifest.json')
  if (!manifestObj) return null
  const manifest = (await manifestObj.json()) as { files: Record<string, string> }

  let rootNode: Node | null = null
  const allNodes = new Map<string, Node>()

  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const obj = await env.bucket.get(file)
    if (!obj) continue
    const nodes = (await obj.json()) as Node[]
    for (const n of nodes) {
      allNodes.set(n.id, n)
      if (n.id === rootId) rootNode = n
    }
  }

  if (!rootNode) return null

  // Load reverse index to find what points TO this faction node
  const revObj = await env.bucket.get('refs/reverse-index.json')
  if (!revObj) return null
  const revIndex = (await revObj.json()) as Record<string, Array<{ sourceId: string; rel: string }>>

  const connectedIds = new Set<string>()
  const revRefs = revIndex[rootId] || []
  for (const ref of revRefs) {
    connectedIds.add(ref.sourceId)
  }

  // Also check forward index for outgoing refs
  const fwdObj = await env.bucket.get('refs/forward-index.json')
  if (fwdObj) {
    const fwdIndex = (await fwdObj.json()) as Record<
      string,
      Array<{ targetId: string; rel: string }>
    >
    const fwdRefs = fwdIndex[rootId] || []
    for (const ref of fwdRefs) {
      connectedIds.add(ref.targetId)
    }
  }

  // Build connected nodes
  const connected: EnrichedNode[] = []
  const connectedNodesList: Node[] = []
  for (const id of connectedIds) {
    const n = allNodes.get(id)
    if (n) {
      connected.push(enrichNode(n, 0.9, new Map()))
      connectedNodesList.push(n)
    }
  }

  // Build records: root + connected as individual records for search display
  const allResultNodes = [rootNode, ...connectedNodesList]
  const nodeMap = new Map<string, Node>(allResultNodes.map((n) => [n.id, n]))
  const records = aggregateToRecords(allResultNodes, nodeMap)

  return {
    detected: {
      factions: detected.factions,
      subfaction,
      strippedQuery: '',
      keywords: [],
    },
    results: [enrichNode(rootNode, 1.0, new Map())],
    connected,
    parentMap: new Map(),
    records,
  }
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
  returnRecords?: boolean,
): Promise<RetrieveResult> {
  const factionId = detected.factions[0]!
  const subfaction = detected.subfaction

  // Load the faction's node file from R2 via the manifest
  // Faction nodes are stored as nodes/faction-{slug}.json
  const manifestObj = await env.bucket.get('manifest.json')
  if (!manifestObj) {
    return {
      detected: { factions: detected.factions, subfaction, strippedQuery, keywords },
      results: [],
      connected: [],
      parentMap: new Map(),
    }
  }
  const manifest = (await manifestObj.json()) as { files: Record<string, string> }

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
        const nodes = (await obj.json()) as Node[]
        allNodes.push(...nodes)
      }
    }
  }

  // Filter: keep nodes matching factionId or generic (no factionId)
  let filtered = allNodes.filter((n) => n.factionId === factionId || !n.factionId)

  // Subfaction filter: remove other chapters' content
  if (subfaction) {
    filtered = filtered.filter((n) => {
      if (!n.subfaction) return true // generic — keep
      return n.subfaction === subfaction // same subfaction — keep; other subfactions — drop
    })
  }

  // Sort: subfaction first, then faction, then generic. Within each: datasheets before abilities before weapons.
  const CATEGORY_ORDER: Record<string, number> = {
    'detachment-rule': 0,
    'faction-ability': 1,
    stratagem: 2,
    enhancement: 3,
    datasheet: 4,
    'unit-ability': 5,
    weapon: 6,
  }

  filtered.sort((a, b) => {
    // Subfaction first
    const aSubRank = subfaction && a.subfaction === subfaction ? 0 : !a.subfaction ? 1 : 2
    const bSubRank = subfaction && b.subfaction === subfaction ? 0 : !b.subfaction ? 1 : 2
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
  const results: EnrichedNode[] = filtered.map((n) => enrichNode(n, 1.0, new Map()))

  // Inject cross-faction datasheets whose title matches the original query
  // (e.g., "Genestealers" exists in both tyranids and genestealer-cults)
  if (originalQuery) {
    const titleLower = originalQuery.toLowerCase().trim()
    const resultIdSet = new Set(results.map((r) => r.id))

    for (const file of Object.keys(manifest.files)) {
      if (!file.startsWith('nodes/') || file === factionFile) continue
      const obj = await env.bucket.get(file)
      if (!obj) continue
      const fileNodes = (await obj.json()) as Node[]
      for (const n of fileNodes) {
        if (
          n.category === 'datasheet' &&
          n.title.toLowerCase() === titleLower &&
          !resultIdSet.has(n.id)
        ) {
          results.unshift(enrichNode(n, 1.0, new Map()))
          resultIdSet.add(n.id)
        }
      }
    }
  }

  // Build records if requested
  let records: AggregatedRecord[] | undefined
  if (returnRecords) {
    const nodeMap = new Map<string, Node>(filtered.map((n) => [n.id, n]))
    records = aggregateToRecords(filtered, nodeMap)
  }

  return {
    detected: { factions: detected.factions, subfaction, strippedQuery, keywords },
    results,
    connected: [],
    parentMap: new Map(),
    records,
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
    factionName: node.factionName,
    subfaction: node.subfaction,
    phase: node.phase,
    datasheetId: node.datasheetId,
    edition: node.edition,
    parentUnit: parentMap.get(node.id),
    sources: node.sources,
    keywords: node.keywords,
  }
}
