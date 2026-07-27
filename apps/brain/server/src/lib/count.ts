/**
 * /count — deterministic query engine over the cube built by lib/cube.ts.
 *
 * The cube (fact + dim + rollup tables) is written to R2 by build-graph and
 * loaded lazily by this module. All results are computed by scanning or
 * looking up the small in-memory cube tables — no LLM, no arithmetic on the
 * hot path. The Worker's /count route hands query params in, gets counts
 * out, and optionally wraps the response in an R2 cache so repeat queries
 * skip even the scan.
 */
import type { DimFactionRow, FactNode, RollupFactionCategoryEdition, RollupFactionDp } from './cube'

// R2 binding subset — kept narrow so tests can pass a plain fake.
interface R2Bucket {
  get(key: string): Promise<{
    text(): Promise<string>
    json<T>(): Promise<T>
  } | null>
  put(key: string, value: string | ArrayBuffer, options?: unknown): Promise<unknown>
  delete?(keys: string | string[]): Promise<unknown>
  list?(opts?: { prefix?: string }): Promise<{ objects?: Array<{ key: string }> }>
}

// ── Module-scope cube cache ────────────────────────────────────────────────

interface CubeCache {
  facts: FactNode[]
  factsById: Map<string, FactNode>
  factsByFaction: Map<string, FactNode[]>
  dimFaction: DimFactionRow[]
  dimFactionById: Map<string, DimFactionRow>
  dimKeyword: string[]
  /**
   * Fast lookup: lowercase datasheet title → all datasheet facts with that
   * title (may be multiple across factions or editions). Enables faction
   * inference from unit names in a natural-language query — a critical hop
   * for strategic questions like "would Eradicators be a good addition" that
   * don't name a faction directly but do name units.
   */
  datasheetsByTitle: Map<string, FactNode[]>
  rollupFactionDp: RollupFactionDp[]
  rollupFactionCategoryEdition: RollupFactionCategoryEdition[]
  manifestVersion: string
}

let cached: CubeCache | null = null

/** For tests: drop the cache so the next call re-reads from the fake bucket. */
export function resetCubeCache(): void {
  cached = null
}

/**
 * Cheap wrapper — just returns the cube version key (manifest.updatedAt-derived
 * token, or 'unknown' when the manifest is missing). Used by /ask response
 * caching so its cache key rolls over on rebuild in lockstep with /count's.
 */
export async function getCubeVersion(bucket: R2Bucket): Promise<string> {
  const cube = await loadCube(bucket)
  return cube.manifestVersion
}

/** Force a reload — public counterpart used by /reload-cube. */
export async function reloadCube(bucket: R2Bucket): Promise<CubeCache> {
  cached = null
  return loadCube(bucket)
}

async function loadCube(bucket: R2Bucket): Promise<CubeCache> {
  if (cached) return cached

  const [factsObj, dimFactionObj, dimKeywordObj, rollupDpObj, rollupCatObj, manifestObj] =
    await Promise.all([
      bucket.get('cube/fact_node.jsonl'),
      bucket.get('cube/dim_faction.json'),
      bucket.get('cube/dim_keyword.json'),
      bucket.get('cube/rollup_faction_dp.json'),
      bucket.get('cube/rollup_faction_category_edition.json'),
      bucket.get('manifest.json'),
    ])

  if (!factsObj || !dimFactionObj || !rollupDpObj || !rollupCatObj) {
    throw new Error(
      'Cube not deployed — /count requires cube/ files in R2 (run build-graph + upload).',
    )
  }

  const factsText = await factsObj.text()
  const facts: FactNode[] = []
  for (const line of factsText.split('\n')) {
    if (!line) continue
    facts.push(JSON.parse(line) as FactNode)
  }

  const dimFaction = await dimFactionObj.json<DimFactionRow[]>()
  const dimKeyword = dimKeywordObj ? await dimKeywordObj.json<string[]>() : []
  const rollupFactionDp = await rollupDpObj.json<RollupFactionDp[]>()
  const rollupFactionCategoryEdition = await rollupCatObj.json<RollupFactionCategoryEdition[]>()

  // Cube-version key for /count response cache. Prefer manifest.updatedAt
  // (rewritten on every build) over manifest.version (constant `1`) so the
  // cache actually rolls over on rebuild. `hash` is preferred if present but
  // the current manifest doesn't emit one. Missing manifest → "unknown" so
  // cache still works, just doesn't roll over automatically.
  let manifestVersion = 'unknown'
  if (manifestObj) {
    try {
      const m = await manifestObj.json<{
        hash?: string
        updatedAt?: string
        version?: string
      }>()
      // Sanitize timestamp into a filename-safe token (drop colons + dots).
      const stamp = m.updatedAt?.replace(/[^0-9]/g, '') ?? ''
      manifestVersion = m.hash ?? (stamp || m.version || 'unknown')
    } catch {
      /* keep 'unknown' */
    }
  }

  // Build indexes for O(1) faction lookups.
  const factsById = new Map<string, FactNode>()
  const factsByFaction = new Map<string, FactNode[]>()
  const dimFactionById = new Map<string, DimFactionRow>()
  const datasheetsByTitle = new Map<string, FactNode[]>()
  for (const f of facts) {
    factsById.set(f.id, f)
    for (const fid of f.factionIds) {
      if (!factsByFaction.has(fid)) factsByFaction.set(fid, [])
      factsByFaction.get(fid)!.push(f)
    }
    if (f.category === 'datasheet') {
      const key = f.title.toLowerCase()
      if (!datasheetsByTitle.has(key)) datasheetsByTitle.set(key, [])
      datasheetsByTitle.get(key)!.push(f)
    }
  }
  for (const d of dimFaction) dimFactionById.set(d.id, d)

  cached = {
    facts,
    factsById,
    factsByFaction,
    dimFaction,
    dimFactionById,
    dimKeyword,
    datasheetsByTitle,
    rollupFactionDp,
    rollupFactionCategoryEdition,
    manifestVersion,
  }
  return cached
}

// ── Faction inference from unit names ──────────────────────────────────────

/**
 * Scan a query for unit names that appear as datasheet titles in the cube.
 * Returns the list of matched datasheets + the inferred faction set.
 *
 * Chapter-vs-parent rule (Micah's directive): "if its space marines units
 * its just space marines unless another sub-faction (chapter) is also
 * included". Implemented as:
 *  - Datasheet whose factionId is 'space-marines' → contributes 'space-marines'
 *  - Datasheet whose factionId is a chapter (has parentId in dim) →
 *    contributes the CHAPTER (dropping any 'space-marines' parent contribution
 *    since the chapter can already see the shared pool via factionIds[]).
 *  - Non-SM factions → contribute their own factionId.
 *
 * Matching strategy: n-gram scan (1..4 tokens) against the lowercased
 * datasheet title index. Prefers the longest match at each position so
 * "Ballistus Dreadnought" doesn't also fire on the bare "Dreadnought".
 *
 * Returns empty result if nothing matched — caller falls back to the
 * pattern-based faction detection they already have.
 */
// Stopwords + generic 40K nouns that don't uniquely identify a datasheet.
// A query token that only matches noise words gives no signal about faction.
const UNIT_MATCH_STOPWORDS = new Set([
  // English stopwords
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'with',
  'and',
  'or',
  'my',
  'your',
  'i',
  'we',
  'they',
  'it',
  'is',
  'are',
  'be',
  'as',
  'to',
  'for',
  'from',
  'have',
  'has',
  'do',
  'does',
  'can',
  'should',
  'would',
  'could',
  'good',
  'bad',
  'better',
  'best',
  'run',
  'take',
  'add',
  'addition',
  'currently',
  'also',
  // 40K generic nouns that appear across many datasheets and would fire on
  // almost every unit-name-shaped query.
  'squad',
  'unit',
  'units',
  'warriors',
  'warrior',
  'guard',
  'guardsman',
  'soldiers',
  'brotherhood',
  'cadre',
  'gang',
  'team',
  'company',
  'pack',
  'boyz',
  'boy',
  'models',
  'model',
  'list',
  'lists',
  'army',
  'faction',
])

/** Rough singular normalization — drop trailing 's' when the stem is ≥4 chars. */
function stemToken(t: string): string {
  if (t.length >= 5 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

/** Tokenize a title (or query) into significant words. */
function significantWords(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9'\s]+/g, ' ')
  const out: string[] = []
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw) continue
    const stemmed = stemToken(raw)
    if (stemmed.length < 4) continue
    if (UNIT_MATCH_STOPWORDS.has(stemmed)) continue
    out.push(stemmed)
  }
  return out
}

export async function inferFactionsFromUnitNames(
  bucket: R2Bucket,
  query: string,
): Promise<{
  factions: string[]
  matches: Array<{
    id: string
    title: string
    factionId?: string
    category: string
    edition?: string
  }>
}> {
  const cube = await loadCube(bucket)

  // Build (once per cache) a word-index over 11e datasheet titles:
  //   significant title word → list of datasheet facts.
  // Then match by score: how many of a datasheet's significant title words
  // appear in the query. This handles:
  //   - Plural in query ("Eradicators") vs singular in title ("Eradicator Squad")
  //   - Abbreviated query ("Ballistus dread") vs full title ("Ballistus Dreadnought")
  //   - Variant families ("Gladiator" → all Gladiator Lancer/Reaper/Valiant)
  const queryWords = new Set(significantWords(query))
  if (queryWords.size === 0) return { factions: [], matches: [] }

  interface Scored {
    fact: FactNode
    titleWords: string[]
    matched: string[]
    /** Query tokens that produced each match (may differ from titleWord
     *  when a prefix triggered — "dread" matches "dreadnought"). Used for
     *  the per-token best-match gate below. */
    matchedQueryTokens: string[]
  }
  // A title word matches a query token when they are equal OR when a query
  // token (≥4 chars) is a prefix of the title word. Prefix matching handles
  // abbreviations users type ("Ballistus dread" for "Ballistus Dreadnought")
  // so those queries produce a stronger match than the accidental token
  // hit on an unrelated unit ("dread" alone would otherwise fire on Deff
  // Dread as much as on Ballistus Dreadnought).
  const matchesToken = (titleWord: string): string | null => {
    if (queryWords.has(titleWord)) return titleWord
    for (const q of queryWords) {
      if (q.length >= 4 && titleWord.startsWith(q) && titleWord.length >= q.length + 2) return q
    }
    return null
  }
  const scored: Scored[] = []
  for (const bucketFacts of cube.factsByFaction.values()) {
    for (const f of bucketFacts) {
      if (f.category !== 'datasheet') continue
      if (f.edition && f.edition !== '11th') continue
      const titleWords = significantWords(f.title)
      if (titleWords.length === 0) continue
      const matched: string[] = []
      const matchedQueryTokens: string[] = []
      for (const w of titleWords) {
        const q = matchesToken(w)
        if (q) {
          matched.push(w)
          matchedQueryTokens.push(q)
        }
      }
      if (matched.length === 0) continue
      scored.push({ fact: f, titleWords, matched, matchedQueryTokens })
    }
  }

  // Per-query-token best-match: for each significant query token, find the
  // datasheet(s) with the highest score that include that token. Keep every
  // fact that is the best-match for at least one query token.
  //
  // Why: a global "best-match-wins" gate drops legitimate matches for OTHER
  // query tokens as soon as ANY token gets an exact hit. Example: the query
  // "Would Eradicators + Ballistus dread + Gladiator" — Eradicator hits its
  // exact title (score 1.0) but Ballistus (partial, 0.5) and Gladiator
  // (partial, 0.5) both need to survive so the LLM can talk about all three.
  //
  // Rarity gate: skip query tokens that appear in more than
  // MAX_TOKEN_DATASHEETS distinct datasheet titles. A common word like
  // "dread" appears in Dreadnought variants across factions AND in "Deff
  // Dread" (Orks) — matching on that token is noise, not signal. Rare tokens
  // ("ballistus", "eradicator") stay strong.
  const MAX_TOKEN_DATASHEETS = 5
  // Rarity gate keyed by QUERY tokens (not title words) — the token frequency
  // is how many datasheets a given query token matched. Drops noisy tokens.
  const tokenFrequency = new Map<string, number>()
  for (const s of scored) {
    for (const qToken of s.matchedQueryTokens) {
      tokenFrequency.set(qToken, (tokenFrequency.get(qToken) ?? 0) + 1)
    }
  }
  const isRareEnough = (token: string): boolean =>
    (tokenFrequency.get(token) ?? 0) <= MAX_TOKEN_DATASHEETS

  const scoreOf = (s: Scored): number => s.matched.length / s.titleWords.length
  const PARTIAL_MIN_SCORE = 0.5
  const bestByToken = new Map<string, { score: number; facts: Set<FactNode> }>()
  for (const s of scored) {
    const score = scoreOf(s)
    if (score < PARTIAL_MIN_SCORE) continue
    for (const qToken of s.matchedQueryTokens) {
      if (!isRareEnough(qToken)) continue
      const entry = bestByToken.get(qToken)
      if (!entry || score > entry.score) {
        bestByToken.set(qToken, { score, facts: new Set([s.fact]) })
      } else if (score === entry.score) {
        entry.facts.add(s.fact)
      }
    }
  }
  const matchedFacts = new Map<string, FactNode>()
  for (const { facts } of bestByToken.values()) {
    for (const f of facts) {
      const key = `${f.factionId}::${f.title.toLowerCase()}`
      if (!matchedFacts.has(key)) matchedFacts.set(key, f)
    }
  }

  if (matchedFacts.size === 0) return { factions: [], matches: [] }

  // Apply chapter-preference rule.
  const factionSet = new Set<string>()
  const chapterSet = new Set<string>()
  for (const f of matchedFacts.values()) {
    if (!f.factionId) continue
    const dim = cube.dimFactionById.get(f.factionId)
    if (dim?.isChapter) chapterSet.add(f.factionId)
    else factionSet.add(f.factionId)
  }
  // If any chapters matched AND the parent (space-marines) also appears,
  // drop the parent — chapters already see the shared pool.
  if (chapterSet.size > 0) {
    for (const chapter of chapterSet) {
      const dim = cube.dimFactionById.get(chapter)
      if (dim?.parentId) factionSet.delete(dim.parentId)
      factionSet.add(chapter)
    }
  }

  // Prefer 11e edition matches for display; drop 10e duplicates when both exist.
  const byId = new Map<string, FactNode>()
  for (const f of matchedFacts.values()) {
    const key = `${f.factionId}::${f.title.toLowerCase()}`
    const existing = byId.get(key)
    if (!existing || (f.edition === '11th' && existing.edition !== '11th')) {
      byId.set(key, f)
    }
  }

  return {
    factions: [...factionSet],
    matches: [...byId.values()].map((f) => ({
      id: f.id,
      title: f.title,
      factionId: f.factionId,
      category: f.category,
      edition: f.edition,
    })),
  }
}

// ── Query API ──────────────────────────────────────────────────────────────

export interface CountQuery {
  /** Faction slug filter. Chapter → parent expansion is already baked into
   *  fact rows' factionIds, so `faction=dark-angels` returns DA-accessible
   *  facts including parent SM ones. */
  faction?: string
  category?: string
  edition?: string
  /** Ability/tag keyword filter — matches case-insensitive substring against
   *  any of a fact row's lower-cased keywords. Prefer exact tokens over
   *  fragments (e.g. "sustained hits" not just "sustained"). */
  keyword?: string
  /** DP cost filter (11e detachments only). */
  dp?: number
  /** Group results by this dimension. When present, returns a per-group
   *  breakdown instead of a single scalar. */
  group?: 'faction' | 'category' | 'edition' | 'dp' | 'faction_dp'
  /** Include a compact pool (id + title, up to `poolLimit`) in the response. */
  includePool?: boolean
  poolLimit?: number
}

export interface CountResult {
  /** Total count of facts matching the query (across all groups). */
  count: number
  /** Per-group breakdown when `group` is set. */
  groups?: Array<Record<string, string | number>>
  /** Compact pool of matching fact rows when `includePool` is true. */
  pool?: Array<{
    id: string
    title: string
    factionId?: string
    category?: string
    dp?: number
    parentTitle?: string
    parentId?: string
  }>
  /** Special-case: DP rollup with pre-computed Strike Force combo count.
   *  Populated when category='detachment' + edition='11th' and either
   *  no faction filter (all factions) or a single faction (one row). */
  dpRollup?: RollupFactionDp[]
  /** Metadata for debugging + cache keying. */
  cubeVersion: string
}

const DEFAULT_POOL_LIMIT = 500

export async function count(bucket: R2Bucket, q: CountQuery): Promise<CountResult> {
  const cube = await loadCube(bucket)
  const poolLimit = q.poolLimit ?? DEFAULT_POOL_LIMIT

  // Special-case fast path: detachment DP question — serve from rollup
  // (with the combo formula pre-computed).
  const isDetachmentDpQuestion =
    q.category === 'detachment' &&
    (q.edition === '11th' || q.edition === undefined) &&
    q.keyword === undefined
  if (isDetachmentDpQuestion) {
    const rows = q.faction
      ? cube.rollupFactionDp.filter((r) => r.factionId === q.faction)
      : cube.rollupFactionDp
    const filteredRows = q.dp
      ? rows.map((r) => ({
          ...r,
          dp1: q.dp === 1 ? r.dp1 : 0,
          dp2: q.dp === 2 ? r.dp2 : 0,
          dp3: q.dp === 3 ? r.dp3 : 0,
          total: q.dp === 1 ? r.dp1 : q.dp === 2 ? r.dp2 : q.dp === 3 ? r.dp3 : r.total,
        }))
      : rows
    const total = filteredRows.reduce((sum, r) => sum + r.total, 0)
    const result: CountResult = {
      count: total,
      dpRollup: filteredRows,
      cubeVersion: cube.manifestVersion,
    }
    if (q.includePool) {
      result.pool = collectPool(cube, q, poolLimit)
    }
    if (q.group) {
      // Group is redundant here (rollup already grouped by faction), but
      // support it for uniform API. Return one row per faction.
      result.groups = filteredRows.map((r) => ({
        factionId: r.factionId,
        displayName: r.displayName,
        count: r.total,
        dp1: r.dp1,
        dp2: r.dp2,
        dp3: r.dp3,
        combosStrikeForce: r.combosStrikeForce,
      }))
    }
    return result
  }

  // General path: linear scan over facts (or per-faction subset).
  const candidates: FactNode[] = q.faction ? (cube.factsByFaction.get(q.faction) ?? []) : cube.facts

  const matches: FactNode[] = []
  const keywordLower = q.keyword?.toLowerCase()
  for (const f of candidates) {
    if (q.category && f.category !== q.category) continue
    if (q.edition && f.edition !== q.edition) continue
    if (q.dp != null && f.dp !== q.dp) continue
    if (keywordLower && !f.keywords.some((k) => k.includes(keywordLower))) continue
    matches.push(f)
  }

  const result: CountResult = {
    count: matches.length,
    cubeVersion: cube.manifestVersion,
  }

  if (q.group) {
    const groups = new Map<string, number>()
    for (const m of matches) {
      const key = groupKey(m, q.group, cube)
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    result.groups = [...groups.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => {
        // For faction group, also emit display name from dim.
        if (q.group === 'faction') {
          const dim = cube.dimFactionById.get(k)
          return { factionId: k, displayName: dim?.displayName ?? k, count: v }
        }
        return { [q.group!]: k, count: v }
      })
  }

  if (q.includePool) {
    result.pool = matches.slice(0, poolLimit).map((m) => ({
      id: m.id,
      title: m.title,
      factionId: m.factionId,
      category: m.category,
      dp: m.dp,
      parentTitle: m.parentTitle,
      parentId: m.parentId,
    }))
  }

  return result
}

function collectPool(
  cube: CubeCache,
  q: CountQuery,
  limit: number,
): Array<{ id: string; title: string; factionId?: string; category?: string; dp?: number }> {
  const candidates = q.faction ? (cube.factsByFaction.get(q.faction) ?? []) : cube.facts
  const out: Array<{
    id: string
    title: string
    factionId?: string
    category?: string
    dp?: number
    parentTitle?: string
    parentId?: string
  }> = []
  for (const f of candidates) {
    if (out.length >= limit) break
    if (q.category && f.category !== q.category) continue
    if (q.edition && f.edition !== q.edition) continue
    if (q.dp != null && f.dp !== q.dp) continue
    if (q.keyword && !f.keywords.some((k) => k.includes(q.keyword!.toLowerCase()))) continue
    out.push({
      id: f.id,
      title: f.title,
      factionId: f.factionId,
      category: f.category,
      dp: f.dp,
      parentTitle: f.parentTitle,
      parentId: f.parentId,
    })
  }
  return out
}

function groupKey(fact: FactNode, dim: NonNullable<CountQuery['group']>, _cube: CubeCache): string {
  switch (dim) {
    case 'faction':
      return fact.factionId ?? '_none'
    case 'category':
      return fact.category
    case 'edition':
      return fact.edition ?? '_none'
    case 'dp':
      return fact.dp != null ? String(fact.dp) : '_none'
    case 'faction_dp':
      return `${fact.factionId ?? '_none'}::${fact.dp ?? '_none'}`
    default:
      return '_other'
  }
}

// ── Response cache (R2) ────────────────────────────────────────────────────

/**
 * Stable JSON stringify + FNV-1a hash → hex. Order-insensitive enough for
 * our query shape (all keys optional strings/numbers/booleans). Not
 * cryptographic — cache-key only.
 */
export function countCacheKey(q: CountQuery, cubeVersion: string): string {
  const normalized = {
    category: q.category ?? null,
    dp: q.dp ?? null,
    edition: q.edition ?? null,
    faction: q.faction ?? null,
    group: q.group ?? null,
    includePool: q.includePool ?? false,
    keyword: q.keyword?.toLowerCase() ?? null,
    poolLimit: q.poolLimit ?? DEFAULT_POOL_LIMIT,
  }
  const str = JSON.stringify(normalized)
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `cache/count/${cubeVersion}/${hash.toString(16).padStart(8, '0')}.json`
}

/**
 * Read-through cache: check R2 first, compute + write on miss.
 * The cube-version prefix in the key means an updated cube auto-orphans
 * prior cache entries — no explicit invalidation needed.
 */
export async function countCached(bucket: R2Bucket, q: CountQuery): Promise<CountResult> {
  const cube = await loadCube(bucket)
  const key = countCacheKey(q, cube.manifestVersion)
  const cachedObj = await bucket.get(key)
  if (cachedObj) {
    return cachedObj.json<CountResult>()
  }
  const result = await count(bucket, q)
  // Fire-and-forget cache write; failures shouldn't block the response.
  try {
    await bucket.put(key, JSON.stringify(result))
  } catch {
    /* ignore cache-write errors */
  }
  return result
}
