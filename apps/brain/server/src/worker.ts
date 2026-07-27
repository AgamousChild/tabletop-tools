// Side-effect import: registers all question shapes on module load.
import './lib/question-shapes/shapes/index'

import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { filterBrowseNodes } from './lib/browse'
import { buildDatasheetLayout } from './lib/card-layout'
import {
  countCached,
  type CountQuery,
  getCubeVersion,
  inferFactionsFromUnitNames,
  reloadCube,
} from './lib/count'
import { parseCountQueryFromQuestion, renderCubeContext } from './lib/count-parser'
import { buildCrossRefs, loadIndexes } from './lib/cross-refs'
import {
  brainNodesToSnippets,
  curateSnippets,
  geminiToSnippet,
  snippetsToPromptText,
} from './lib/curator'
import {
  editionsAvailableForId,
  filterByEdition,
  nodeMatchesEdition,
  resolveEdition,
} from './lib/edition'
import { type EntityMap, getEntityIndex, linkEntitiesInContent } from './lib/entity-linker'
import { findErrataForNode } from './lib/errata-linker'
import { expandFactionForRetrieval, expandFactionsForRetrieval } from './lib/factions'
import { formatConversationalAnswer } from './lib/format'
import type { Node } from './lib/model'
import { classify, route } from './lib/question-shapes/registry'
import { retrieve } from './lib/retrieve'
import { buildCorpusForNode } from './lib/vectorize-corpus'
import type { Env } from './types'

// ── Module-scope caches (persist across requests in the same Worker isolate) ──
let cachedErrataNodes: Node[] | null = null
let cachedEntityIndex: EntityMap | null = null
let cachedAllNodes: Node[] | null = null
let cacheManifestHash: string | null = null

/** Reset module-scope caches. Used in tests to ensure isolation between runs. */
export function resetWorkerCaches(): void {
  cachedErrataNodes = null
  cachedEntityIndex = null
  cachedAllNodes = null
  cacheManifestHash = null
}

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
  // ── 11e Chapter Approved (current) ──────────────────────────────────────
  // Source-title filters (not just category) so 10e and 11e content stay in
  // their own sidebar entries. Both currently emit under the same category
  // (primary-mission, terrain-layout, etc.) because the edition tag isn't
  // universally set on the older 10e nodes; splitting by source.title is the
  // durable fix.
  {
    id: 'ca11-primary-missions',
    label: 'Primary Missions (11e)',
    filter: (n) =>
      n.category === 'primary-mission' &&
      n.sources.some(
        (s) =>
          s.title === 'CA11 Force Dispositions' || (s.title ?? '').startsWith('gdmissions.app'),
      ),
  },
  {
    id: 'ca11-secondary-missions',
    label: 'Secondary Missions (11e)',
    filter: (n) =>
      n.category === 'secondary-mission' &&
      n.sources.some((s) => (s.title ?? '').startsWith('gdmissions.app')),
  },
  {
    id: 'ca11-terrain-layouts',
    label: 'Terrain Layouts (11e)',
    filter: (n) => n.sources.some((s) => s.title === 'CA11 Terrain Layouts'),
  },
  {
    id: 'ca11-deployment-zones',
    label: 'Deployment Zones (11e)',
    filter: (n) => n.sources.some((s) => s.title === 'CA11 Deployment Zones'),
  },
  {
    id: 'ca11-force-dispositions',
    label: 'Force Dispositions (11e)',
    filter: (n) => n.category === 'force-disposition',
  },
  {
    id: 'universal-rules-updates',
    label: 'Universal Rules Updates (July 2026)',
    filter: (n) => n.sources.some((s) => s.title === 'Universal Rules Updates'),
  },
  {
    id: 'balance-dataslate',
    label: 'Balance Dataslate (June 2025)',
    filter: (n) => n.sources.some((s) => s.title === 'Balance Dataslate'),
  },
  {
    id: 'tournament-companion',
    label: 'Tournament Companion',
    filter: (n) => n.sources.some((s) => (s.title ?? '').includes('Tournament Companion')),
  },

  // ── 10e Chapter Approved (legacy — kept for historical reference) ───────
  {
    id: 'ca-deployments',
    label: 'Deployment Zones (10e legacy)',
    filter: (n) =>
      n.category === 'deployment-zone' &&
      n.sources.some((s) => s.title === 'Chapter Approved Deployment Zones'),
  },
  {
    id: 'ca-terrain',
    label: 'Terrain Layouts (10e legacy)',
    filter: (n) =>
      n.category === 'terrain-layout' &&
      n.sources.some((s) => (s.title ?? '').startsWith('Chapter Approved')),
  },
  {
    id: 'ca-primary-missions',
    label: 'Primary Missions (10e legacy)',
    filter: (n) =>
      n.category === 'primary-mission' &&
      n.sources.some((s) => (s.title ?? '').startsWith('Chapter Approved')),
  },
  {
    id: 'ca-secondary-missions',
    label: 'Secondary Missions (10e legacy)',
    filter: (n) =>
      n.category === 'secondary-mission' &&
      !n.id.startsWith('tc:') &&
      n.sources.some((s) => (s.title ?? '').startsWith('Chapter Approved')),
  },
  {
    id: 'ca-twists',
    label: 'Twists (10e legacy)',
    filter: (n) => n.category === 'twist',
  },
  {
    id: 'ca-challengers',
    label: 'Challenger Cards (10e only — not in 11e)',
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
    id: 'detachments-11e',
    label: 'Detachments (11e)',
    filter: (n) => n.category === 'detachment',
  },
  {
    id: 'detachments-10e',
    label: 'Detachments (10e legacy)',
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

  // Apply the SAME edition filter to sidebar counts as /browse/nodes does to
  // the layer view. Otherwise sidebar shows "Units (2605)" while the layer
  // view paginates as "1352 results" — a 2× drift where the sidebar sums 10e
  // + 11e and the layer view respects `?edition=`. See PR E of
  // docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md (Bug 2).
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)
  const editionScoped = filterByEdition(allNodes, edition)

  const layers = BROWSE_CATEGORIES.map((cat) => {
    const count = editionScoped.filter(cat.filter).length
    return { id: cat.id, label: cat.label, count }
  }).filter((l) => l.count > 0)

  return c.json({ layers, edition })
})

app.get('/browse/nodes', async (c) => {
  const layer = c.req.query('layer')
  if (!layer) return c.json({ error: 'layer query param required' }, 400)

  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const pageSize = Math.min(Math.max(1, parseInt(c.req.query('pageSize') || '20')), 100)
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)
  const factionParam = c.req.query('faction')

  const allCached = await getAllNodes(c.env.BRAIN_BUCKET)
  if (!allCached.length)
    return c.json({ nodes: [], total: 0, page, pageSize, totalPages: 0, edition })

  // Match a defined category by id (e.g. `factions`) OR by singular category
  // alias (e.g. `faction` → the same "Factions" bucket). The old fallback
  // `n.layer === layer` treated `layer=faction` as the NodeLayer filter,
  // pulling in every stratagem/enhancement/detachment-rule that lives on the
  // faction layer — surfacing the "Factions returns tactics/rulings" bug
  // from PR E's QA sweep. Category-filter browse now keys off NodeCategory
  // alone. See docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md.
  const catDef =
    BROWSE_CATEGORIES.find((cat) => cat.id === layer) ??
    BROWSE_CATEGORIES.find((cat) => cat.id === `${layer}s`)
  if (!catDef) return c.json({ error: `Unknown layer: ${layer}` }, 400)
  const allNodes = allCached.filter(catDef.filter)

  // Filter to top-level records only, then apply edition filter (post-filter
  // because edition isn't yet in any upstream index — see retrieve.ts).
  let filtered = filterByEdition(filterBrowseNodes(allNodes), edition)

  // Optional faction filter: chapter queries expand to include the parent
  // faction's shared pool (e.g. blood-angels → +space-marines). Nodes with
  // no factionId (generic/core content) are NOT included here — this endpoint
  // is scoped to the caller's faction. See lib/factions.ts.
  if (factionParam) {
    const factionSet = await expandFactionForRetrieval(factionParam, c.env.BRAIN_BUCKET)
    filtered = filtered.filter((n) => !!n.factionId && factionSet.has(n.factionId))
  }

  // Sort by category then title
  filtered.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.title.localeCompare(b.title)
  })

  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  return c.json({ nodes: paged, total, page, pageSize, totalPages, edition })
})

app.get('/browse/node/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)
  const matches = allNodes.filter((n) => n.id === id)
  if (matches.length === 0) return c.json({ error: 'Node not found' }, 404)

  const editionMatch = matches.find((n) => nodeMatchesEdition(n, edition))
  if (!editionMatch) {
    const available = editionsAvailableForId(allNodes, id)
    if (available.length > 0) c.header('X-Available-Editions', available.join(','))
    return c.json({ error: 'Node not found for requested edition', edition, available }, 404)
  }
  const errataNodes = await getErrataNodes(c.env.BRAIN_BUCKET)
  const errata = findErrataForNode(editionMatch, errataNodes)
  return c.json({ node: editionMatch, errata, edition })
})

app.get('/browse/unit/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)

  const datasheetCandidates: Node[] = []
  const weapons: Node[] = []
  const abilities: Node[] = []

  for (const n of allNodes) {
    if (n.id === id && n.category === 'datasheet') {
      datasheetCandidates.push(n)
    } else if (n.datasheetId === id && n.category === 'weapon') {
      weapons.push(n)
    } else if (n.datasheetId === id && n.category === 'unit-ability') {
      abilities.push(n)
    }
  }

  if (datasheetCandidates.length === 0) return c.json({ error: 'Unit not found' }, 404)

  const datasheet = datasheetCandidates.find((n) => nodeMatchesEdition(n, edition))
  if (!datasheet) {
    const available = editionsAvailableForId(allNodes, id)
    if (available.length > 0) c.header('X-Available-Editions', available.join(','))
    return c.json({ error: 'Unit not found for requested edition', edition, available }, 404)
  }

  // Filter children to matching edition (weapons/abilities inherit datasheet edition normally,
  // but the build may produce per-edition variants — keep the filter for safety).
  const filteredWeapons = filterByEdition(weapons, edition)
  const filteredAbilities = filterByEdition(abilities, edition)

  // Build a server-driven layout descriptor for datasheet cards.
  // The client uses this to render via LayoutRenderer without category-specific code.
  const layout = buildDatasheetLayout({
    datasheet,
    weapons: filteredWeapons,
    abilities: filteredAbilities,
  })

  // Attach linked errata so the client can render an Errata section without
  // its own retrieval pass. errata-linker matches by title/content/refs.
  const errataNodes = await getErrataNodes(c.env.BRAIN_BUCKET)
  const errata = findErrataForNode(datasheet, errataNodes)

  // Walk can_lead / can_support refs in the appropriate direction.
  //   Character → forward refs (this character can lead/support X).
  //   Non-character → reverse refs (X can lead/support this unit).
  // Both arrays carry resolved { id, title, factionId } chips so the client
  // can render Can Lead / Can Support (character) or Leaders / Support Models
  // (non-character) panels without a second round-trip.
  const { leaders, support } = await buildAttachmentLinks(datasheet, allNodes, c.env.BRAIN_BUCKET)

  return c.json({
    datasheet,
    weapons: filteredWeapons,
    abilities: filteredAbilities,
    layout,
    errata,
    leaders,
    support,
    edition,
  })
})

interface AttachmentChip {
  id: string
  title: string
  factionId?: string
}

/**
 * Resolve can_lead / can_support refs to titled chips.
 *
 * For a character datasheet (any keyword === 'character', case-insensitive)
 * we walk the FORWARD index: this character → unit it can lead/support.
 *
 * For a non-character datasheet we walk the REVERSE index: character → this
 * unit. Either way both arrays are resolved against the loaded node set so
 * dangling refs (target id missing from the graph) are dropped silently.
 *
 * Duplicates are deduplicated by target id.
 */
async function buildAttachmentLinks(
  datasheet: Node,
  allNodes: Node[],
  bucket: unknown,
): Promise<{ leaders: AttachmentChip[]; support: AttachmentChip[] }> {
  const isCharacter = (datasheet.keywords ?? []).some(
    (k) => k.toLowerCase() === 'character' || k.toLowerCase() === 'characters',
  )

  const { fwd, rev } = await loadIndexes(bucket)

  const nodeById = new Map<string, Node>()
  for (const n of allNodes) nodeById.set(n.id, n)

  const leaderIds = new Set<string>()
  const supportIds = new Set<string>()

  if (isCharacter) {
    for (const ref of fwd[datasheet.id] ?? []) {
      if (ref.rel === 'can_lead') leaderIds.add(ref.targetId)
      else if (ref.rel === 'can_support') supportIds.add(ref.targetId)
    }
  } else {
    for (const ref of rev[datasheet.id] ?? []) {
      if (ref.rel === 'can_lead') leaderIds.add(ref.sourceId)
      else if (ref.rel === 'can_support') supportIds.add(ref.sourceId)
    }
  }

  function resolve(ids: Set<string>): AttachmentChip[] {
    const chips: AttachmentChip[] = []
    for (const id of ids) {
      const node = nodeById.get(id)
      if (!node) continue // dangling ref — drop silently
      chips.push({
        id: node.id,
        title: node.title,
        ...(node.factionId ? { factionId: node.factionId } : {}),
      })
    }
    return chips
  }

  return {
    leaders: resolve(leaderIds),
    support: resolve(supportIds),
  }
}

app.get('/browse/detachment/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)
  const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)

  const detachmentCandidates: Node[] = []
  const stratagems: Node[] = []
  const enhancements: Node[] = []
  const abilities: Node[] = []

  for (const n of allNodes) {
    // Accept both 'detachment-rule' (faction-pack) and 'detachment' (MFM-merged)
    // so callers can request the canonical id whichever side emitted it.
    if (n.id === id && (n.category === 'detachment-rule' || n.category === 'detachment')) {
      detachmentCandidates.push(n)
    } else if (n.detachmentId === id || n.detachmentId === id.split(':').pop()) {
      if (n.category === 'stratagem') stratagems.push(n)
      else if (n.category === 'enhancement') enhancements.push(n)
      else if (n.category === 'faction-ability') abilities.push(n)
    }
  }

  if (detachmentCandidates.length === 0) return c.json({ error: 'Detachment not found' }, 404)

  const detachment = detachmentCandidates.find((n) => nodeMatchesEdition(n, edition))
  if (!detachment) {
    const available = editionsAvailableForId(allNodes, id)
    if (available.length > 0) c.header('X-Available-Editions', available.join(','))
    return c.json({ error: 'Detachment not found for requested edition', edition, available }, 404)
  }

  const errataNodes = await getErrataNodes(c.env.BRAIN_BUCKET)
  const errata = findErrataForNode(detachment, errataNodes)

  return c.json({
    detachment,
    stratagems: filterByEdition(stratagems, edition),
    enhancements: filterByEdition(enhancements, edition),
    abilities: filterByEdition(abilities, edition),
    errata,
    edition,
  })
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

// ── /count — deterministic cube query ──────────────────────────────────────
// Reads the cube tables (fact/dim/rollup) written to R2 by build-graph.
// Query params: faction=, category=, edition=, keyword=, dp=, group=,
// includePool=, poolLimit=. Response is R2-cached under
// cache/count/{cubeVersion}/{hash}.json; cache auto-orphans when the cube
// version changes on rebuild.
app.get('/count', async (c) => {
  const q = c.req.query()
  const query: CountQuery = {
    faction: q.faction || undefined,
    category: q.category || undefined,
    edition: q.edition || undefined,
    keyword: q.keyword || undefined,
    dp: q.dp ? Number(q.dp) : undefined,
    group: (q.group as CountQuery['group']) || undefined,
    includePool: q.includePool === 'true' || q.includePool === '1',
    poolLimit: q.poolLimit ? Number(q.poolLimit) : undefined,
  }
  try {
    const result = await countCached(c.env.BRAIN_BUCKET, query)
    c.header('Cache-Control', 'public, max-age=300')
    return c.json(result)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── /reload-cube — drop the isolate's cube cache + purge response cache ────
// Bearer auth (SYNC_SECRET). Use after uploading a fresh cube/ to R2
// without a full worker redeploy.
app.post('/reload-cube', async (c) => {
  const secret = c.env.SYNC_SECRET
  const auth = c.req.header('Authorization')
  if (!secret || auth !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)

  const cube = await reloadCube(c.env.BRAIN_BUCKET)
  // Also delete the response cache so stale entries don't linger.
  let purged = 0
  if (c.env.BRAIN_BUCKET.list && c.env.BRAIN_BUCKET.delete) {
    let cursor: string | undefined
    do {
      const listed: {
        objects: Array<{ key: string }>
        truncated?: boolean
        cursor?: string
      } = await c.env.BRAIN_BUCKET.list({ prefix: 'cache/count/', cursor })
      const keys = (listed.objects ?? []).map((o) => o.key)
      if (keys.length) {
        await c.env.BRAIN_BUCKET.delete(keys)
        purged += keys.length
      }
      cursor = listed.truncated ? listed.cursor : undefined
    } while (cursor)
  }
  return c.json({
    ok: true,
    cubeVersion: cube.manifestVersion,
    facts: cube.facts.length,
    factions: cube.dimFaction.length,
    responseCachePurged: purged,
  })
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
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)

  const env = {
    ai: c.env.AI,
    vectorize: c.env.BRAIN_INDEX,
    bucket: c.env.BRAIN_BUCKET,
  }

  const {
    detected,
    results,
    records: rawRecords,
    edition: appliedEdition,
    fallback,
    fallbackFrom,
  } = await retrieve(
    {
      query: body.query,
      limit: body.limit,
      filter: body.filter,
      includeConnected: false,
      dualEmbedding: false,
      returnRecords: true,
      edition,
    },
    env,
  )

  if (!rawRecords) {
    return c.json({
      detected,
      records: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      results,
      edition: appliedEdition,
      ...(fallback ? { fallback, fallbackFrom } : {}),
    })
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

  // Build nodeId → factionId map from all cached nodes
  const nodeFactionMap = new Map<string, string>()
  const allCachedNodes = await getAllNodes(c.env.BRAIN_BUCKET)
  for (const n of allCachedNodes) {
    if (n.factionId) nodeFactionMap.set(n.id, n.factionId)
  }

  // Infer faction from top result if not detected from query
  let searchFactionScope = detected.factions
  if (
    searchFactionScope.length === 0 &&
    rawRecords.length > 0 &&
    rawRecords[0].primaryNode.factionId
  ) {
    searchFactionScope = [rawRecords[0].primaryNode.factionId]
  }

  // Build cross-refs using cached indexes (loaded once per Worker isolate)
  const { fwd, rev } = await loadIndexes(c.env.BRAIN_BUCKET)
  const records = buildCrossRefs(linkedRecords, fwd, rev, searchFactionScope, nodeFactionMap)

  // Paginate
  const total = records.length
  const totalPages = Math.ceil(total / pageSize)
  const paginatedRecords = records.slice((page - 1) * pageSize, page * pageSize)

  return c.json({
    detected,
    records: paginatedRecords,
    total,
    page,
    pageSize,
    totalPages,
    results,
    edition: appliedEdition,
    ...(fallback ? { fallback, fallbackFrom } : {}),
  })
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

/**
 * Cache-key for a full /ask response. Keyed by cube version + question +
 * edition + model so:
 *   - a brain rebuild orphans the whole cache (via cubeVersion prefix)
 *   - different editions/models get their own cached entries
 *   - the same question with insignificant whitespace/case differences
 *     resolves to the same key (hashQuestion normalizes both)
 *
 * Returns null when the cube version can't be resolved — signal to the
 * caller that caching is unavailable this request (don't crash /ask on it).
 */
async function computeAskCacheKey(
  bucket: R2Bucket,
  question: string,
  edition: string,
  modelParam: string,
): Promise<string | null> {
  try {
    const cubeVersion = await getCubeVersion(bucket)
    const qHash = hashQuestion(question)
    const modelSlug = modelParam ? modelParam.replace(/[^a-z0-9-]/gi, '_').slice(0, 40) : 'default'
    return `cache/ask/${cubeVersion}/${edition}/${modelSlug}/${qHash}.json`
  } catch {
    return null
  }
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Warhammer 40,000: ${question}` }] }],
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
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)

  // ── /ask response cache (R2) ──────────────────────────────────────────
  // Same question + edition + model → same answer, at least until the
  // brain rebuilds. Keyed by cubeVersion (manifest.updatedAt) so a rebuild
  // orphans stale entries automatically. Skip with ?nocache=1 for dev.
  const nocache = c.req.query('nocache') === '1'
  const modelParamForCache = c.req.query('model') ?? ''
  const askCacheKey = await computeAskCacheKey(
    c.env.BRAIN_BUCKET,
    body.question,
    edition,
    modelParamForCache,
  )
  if (!nocache && askCacheKey) {
    try {
      const hit = await c.env.BRAIN_BUCKET.get(askCacheKey)
      if (hit) {
        const payload = (await hit.json()) as Record<string, unknown>
        return c.json({ ...payload, cached: true, cacheKey: askCacheKey })
      }
    } catch {
      /* cache read failure is non-fatal — fall through and compute */
    }
  }

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
        edition,
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

  // ── Faction inference from unit names ───────────────────────────────────
  // The pattern-based faction detector only fires on faction/chapter names
  // ("space marines", "dark angels", "orks"). For strategic questions that
  // name UNITS instead of factions ("would Eradicators be a good addition"),
  // it returns empty and retrieval blows out — the answer then comes only
  // from Gemini web-search. Fill the gap by scanning the query for datasheet
  // titles; every matched datasheet contributes its factionId, with the
  // chapter-preference rule applied (SM units + DA units → DA, not SM).
  //
  // The matched datasheets are also added to `results` so the LLM sees the
  // actual unit stats — which is exactly what a "should I take X" question
  // needs to answer well.
  if (detected.factions.length === 0) {
    try {
      const inferred = await inferFactionsFromUnitNames(c.env.BRAIN_BUCKET, body.question)
      if (inferred.factions.length > 0) {
        detected.factions = inferred.factions
      }
      if (inferred.matches.length > 0) {
        // Fetch the full node objects for the matched datasheets so
        // formatting has access to their content / summary. The cube fact
        // rows carry only title + factionId; the node in R2 has stats +
        // abilities + refs.
        const matchedIds = inferred.matches.map((m) => m.id)
        const allNodes = await getAllNodes(c.env.BRAIN_BUCKET)
        const byId = new Map(allNodes.map((n) => [n.id, n]))
        for (const id of matchedIds) {
          const n = byId.get(id)
          if (!n) continue
          // Prepend as high-relevance results so the LLM sees them first.
          results.unshift({
            id: n.id,
            score: 1.0,
            title: n.title,
            summary: n.summary,
            content: n.content,
            layer: n.layer,
            category: n.category,
            factionId: n.factionId,
            factionName: n.factionName,
            phase: n.phase,
            datasheetId: n.datasheetId,
            edition: n.edition,
            dp: n.dp,
            sources: n.sources,
            keywords: n.keywords,
          })
        }
      }
    } catch (e) {
      console.warn('[ask] unit-name inference failed:', e instanceof Error ? e.message : e)
    }
  }

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

  // Assemble Brain context — new curator path:
  // Instead of concatenating a `BRAIN` block and a `WEB SEARCH` block side by
  // side (which historically let Gemini's phrasing override brain facts),
  // pool brain + web snippets into one list, rank by score, dedupe overlap,
  // and format as a single self-labelled context. Brain snippets start with
  // higher scores; web is only kept when it adds signal.
  // (Legacy fallback: `assembleContext` still exports the older shape — kept
  // in imports for `formatConversationalAnswer` and future callers.)
  const primaryScoreMap = new Map<string, number>()
  for (const rec of results) {
    if ((rec as { id?: string }).id && typeof (rec as { score?: number }).score === 'number') {
      primaryScoreMap.set((rec as { id: string }).id, (rec as { score: number }).score)
    }
  }
  const brainSnippets = retrieveResult
    ? brainNodesToSnippets(primaryNodes, connectedNodes, primaryScoreMap)
    : []
  const hasStrongBrainHits = brainSnippets.some((s) => s.score >= 0.5)
  const webSnippet = geminiResult?.answer
    ? geminiToSnippet(geminiResult.answer, geminiResult.sources, hasStrongBrainHits)
    : null
  const pool = webSnippet ? [...brainSnippets, webSnippet] : brainSnippets
  const curated = curateSnippets(pool, { maxSnippets: 20, maxChars: 120_000 })
  let brainContext = snippetsToPromptText(curated.kept)

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

  // ── Cube dispatch: deterministic answer for count-shape questions ────────
  // When the question matches a count/enumeration/table shape ("how many X",
  // "count of Y", "table of Z per W", "list all N"), parse dims from the
  // question + detected factions and hit /count internally. Inject the
  // structured result (numbers + optional per-group breakdown + pool) as
  // top-priority context so the LLM's job is language framing, not
  // arithmetic. Vectorize retrieval alone returns nothing useful for these
  // meta questions — the cube supplies the ground truth.
  let cubeContext = ''
  // Capture the cube-surfaced brain content so the response object can expose
  // it as first-class refs (see cubeRefs at the response-assembly site below).
  // Without this the UI + eval treat cube-dispatched answers as source-less
  // even though they're brain-authoritative.
  let cubeRefs: Array<{
    id: string
    title: string
    category: string
    factionId?: string
    dp?: number
    parentTitle?: string
  }> = []
  const cubeQ = parseCountQueryFromQuestion(body.question, detected.factions, edition)
  if (cubeQ) {
    try {
      const result = await countCached(c.env.BRAIN_BUCKET, {
        ...cubeQ,
        includePool: true,
        poolLimit: 200,
      })
      cubeContext = renderCubeContext(cubeQ, result)
      cubeRefs = (result.pool ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category ?? 'unknown',
        factionId: p.factionId,
        dp: p.dp,
        parentTitle: p.parentTitle,
      }))
    } catch (e) {
      console.warn('[cube] dispatch failed:', e instanceof Error ? e.message : e)
    }
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
          // Chapter queries expand to include the parent faction's shared pool.
          const factionSet = await expandFactionsForRetrieval(detected.factions, c.env.BRAIN_BUCKET)
          const factionUnits: string[] = []
          for (const file of Object.keys(manifestData.files)) {
            if (!file.startsWith('nodes/faction-')) continue
            const obj = await c.env.BRAIN_BUCKET.get(file)
            if (!obj) continue
            const nodes = (await obj.json()) as Node[]
            for (const n of nodes) {
              if (n.category === 'datasheet' && n.factionId && factionSet.has(n.factionId)) {
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

  // ── Question-shape registry dispatch ─────────────────────────────────────
  // Classify the question and run matching shapes before the LLM path.
  // A shape returning delegated:true short-circuits the LLM entirely.
  // All other shapes contribute augmentContext strings appended below.
  const shapeCtx = {
    question: body.question,
    detectedFactions: detected.factions,
    edition,
    bucket: c.env.BRAIN_BUCKET,
  }
  let matchedShapes: Awaited<ReturnType<typeof classify>> = []
  try {
    matchedShapes = classify(shapeCtx)
  } catch (e) {
    console.warn('[shape.classify] failed:', e instanceof Error ? e.message : e)
  }
  const matchedShapeIds = matchedShapes.map((s) => s.id)

  const shapeAugments: string[] = []
  for (const shape of matchedShapes) {
    let shapeResult
    try {
      shapeResult = await route(shape, shapeCtx)
    } catch (e) {
      console.warn(`[shape.route:${shape.id}] failed:`, e instanceof Error ? e.message : e)
      continue
    }
    if (shapeResult.delegated && shapeResult.answer) {
      // Short-circuit: return the shape's answer directly.
      return c.json({
        detected,
        answer: shapeResult.answer,
        answerPath: `shape:${shapeResult.shapeId}`,
        contextLength: 0,
        connectedIds: [],
        reference: shapeResult.refs ?? [],
        sources: shapeResult.refs ?? [],
        connectedCount: 0,
        webSources: [],
        geminiCached: false,
        webSource: 'none',
        errors: {},
        edition: retrieveResult?.edition ?? edition,
        debug: {
          retrieveHasResult: !!retrieveResult,
          retrieveResultCount: results.length,
          connectedCount2: connected.length,
          geminiHasResult: false,
          geminiAnswerLen: 0,
          brainContextLen: 0,
          matchedShapes: matchedShapeIds,
        },
      })
    }
    if (shapeResult.augmentContext) {
      shapeAugments.push(shapeResult.augmentContext)
    }
  }

  // Build the combined LLM prompt
  const factionScope =
    detected.factions.length > 0
      ? `\n\nIMPORTANT FACTION SCOPE: The user is asking about ${detected.factions.join(' / ')}. ONLY discuss abilities, stratagems, enhancements, and rules that are available to this specific faction. Do NOT mention abilities from other factions or chapters unless the user explicitly asks for a comparison. If a unit or ability belongs to a different faction or chapter, do NOT include it in your answer.`
      : ''

  // Tell the model which edition it's answering for. Without this, Llama
  // falls back to its training (which thinks 10e is current) and dismisses
  // 11e questions as "no rules exist yet."
  const editionLabel =
    edition === '10th' ? '10th Edition' : edition === '9th' ? '9th Edition' : '11th Edition'
  const editionGuidance =
    edition === 'any'
      ? `Warhammer 40,000 is now in its 11th Edition (launched 2026). Treat 11e as the current edition. The provided context may include both 10e and 11e content — prefer 11e sources unless the user explicitly asks about historical 10e rules.`
      : `Warhammer 40,000 is now in its 11th Edition. The user is querying the ${editionLabel} rules. Answer from the provided context — do NOT defer to your training, which may pre-date 11e.`

  const systemPrompt = `You are a Warhammer 40,000 ${editionLabel} rules expert. ${editionGuidance} Answer the user's SPECIFIC question using the provided context. Do NOT summarize the entire faction — only address what was asked.${factionScope}

CRITICAL: Focus on the question. If they ask "how does Oath of Moment work?" — explain Oath of Moment. Do NOT list every stratagem, enhancement, and ability the faction has.

USE ONLY THE PROVIDED CONTEXT. The CURATED POOL below is the source of truth. If a fact is not in the context, do not state it. Do not fall back on your training data.

WHEN THE CONTEXT DOESN'T ANSWER THE QUESTION: say so plainly. Write "This isn't covered in my knowledge base." or "The context doesn't specify this — [what specifically is missing]." Do NOT invent an answer, do NOT extrapolate from general 40K knowledge, do NOT summarise vague web-search phrasing as if it were an authoritative rule.

WEB-ONLY MODE. When the CURATED CONTEXT block has NO brain snippets (only web-search snippets like [web/...]), open your answer with a single italicized line: "*Brain has no matching content on this — the following is drawn from web-search results and may not reflect the current official rules.*" Then answer as best you can from the web snippets, but do NOT claim brain-sourced authority. The reader needs to know the provenance is weak.

USE EXACT TERMS. When you name a datasheet, character, unit, ability, stratagem, enhancement, or detachment, use its FULL name exactly as it appears in the context. Never abbreviate or paraphrase (e.g. write "Captain in Terminator Armour" — NOT "Captain"; write "Terminator Assault Squad" — NOT "Terminator Squad"; write "Lord of Contagion" — NOT "Chaos Lord").

DO NOT USE TACTICAL VOCABULARY THAT ISN'T IN THE CONTEXT. Generic phrases like "alpha strike", "combined arms", "target priority", "trading blows" are common 40K lingo but if the context doesn't use them for this specific question, don't insert them — they'll link to unrelated brain entries and confuse the reader.

DETERMINISTIC CUBE ANSWERS. When you see a block labelled "DETERMINISTIC CUBE ANSWER" in the context, those numbers were computed by a query engine over the raw brain data — they are ground truth. DO NOT re-derive them, DO NOT sanity-check them against other snippets, DO NOT hedge with "approximately". Report the numbers verbatim. The block ends with an "INSTRUCTION FOR THE ANSWERING MODEL" line that reinforces this.

11TH EDITION DETACHMENT MATH. 11e armies have a Detachment Point budget: Incursion (1000 pts) = 2 DP, Strike Force (2000 pts) = 3 DP. Strike Force combos = (#3pt) + (#2pt × #1pt) + C(#1pt, 3). When the cube block gives you a combo count, use it as-is; never recompute.

FORMATTING — MARKDOWN ONLY, NO LATEX. The client renders plain GitHub-flavored markdown. LaTeX is NOT rendered — output like \\[ ... \\], \\begin{aligned}, \\binom{n}{k}, \\times, \\frac{a}{b} shows up as literal backslash garbage on the user's screen. Rules:
- Never use \\[ ... \\], \\( ... \\), $$ ... $$, or any LaTeX environment/macro. If you need math, write it inline in plain text: use "×" for multiply, "C(n, k)" for binomial coefficient, "n^2" for exponent, "6 + 108 + 20 = 134" for arithmetic.
- Keep answers short. When the question is a straight number ("how many X"), lead with the answer in one sentence, then a compact breakdown (bulleted or a small table). No walls of prose.
- Use "## Heading" sparingly (only for multi-section answers). Bullets and bold are usually enough. Skip a summary at the end — the reader already sees the numbers.

The CONTEXT below is a curated pool of evidence. Each snippet is labelled
with its origin ([brain/...] = official rules from our knowledge graph;
[web/...] = general web-search snippet). Prefer brain snippets over web.
NEVER cite the "WEB SEARCH RESULTS" block by that phrase — no such block
exists; the curator merged everything into one list.

Rules:
- Name the specific unit/datasheet that has each ability
- Leader abilities are conferred by ATTACHING the character (not an aura)
- For faction/detachment abilities, state which detachment grants it
- Be precise about game mechanics. Cite errata if present.
- Use markdown: ## headings, **bold** for names, - bullets for lists
- Keep your answer focused and concise — under 500 words unless the question demands more`

  let userMessage = ''
  if (brainContext) {
    userMessage += `=== CURATED CONTEXT ===\n\n${brainContext}\n\n`
  }
  if (cubeContext) {
    userMessage += `=== ${cubeContext}\n\n`
  }
  if (unitListContext) {
    userMessage += `=== ${unitListContext}\n\n`
  }
  // NOTE: geminiResult is NOT concatenated separately anymore — the curator
  // (see `snippetsToPromptText`) has already inlined it into the CURATED
  // CONTEXT block above, with a low-priority score, dedupe against brain,
  // and self-labelling. Concatenating it again would double-count and
  // resurrect the "WEB SEARCH RESULTS = authority" failure mode.
  // Append shape augment context collected above (non-delegating shapes only).
  if (shapeAugments.length > 0) {
    userMessage += `=== QUESTION CONTEXT (shape analysis) ===\n\n${shapeAugments.join('\n\n')}\n\n`
  }
  userMessage += `---\n\nQuestion: ${body.question}`

  let answer: string
  let answerPath = 'unknown'

  // ── B. Confidence gate ─────────────────────────────────────────────────────
  // If the curator kept nothing (or nothing scored), skip the LLM and return
  // a plain "not in my knowledge base" response instead of forcing a
  // hallucination. Threshold: at least one snippet with score >= 0.30.
  //
  // We don't gate on retrieval-hit count alone (a bad question can pull
  // dozens of tangentially-related nodes); we gate on whether any snippet
  // scored above the "clearly relevant" floor.
  const topScore = curated.kept.reduce((max, s) => Math.max(max, s.score), 0)
  if (curated.kept.length === 0 || topScore < 0.3) {
    const closestList = curated.kept
      .slice(0, 5)
      .map((s) => `- ${s.title} (${s.bucket ?? s.origin}, score ${s.score.toFixed(2)})`)
      .join('\n')
    // Even the confidence-gate bypass path needs to surface cube + connected
    // refs — otherwise a cube-dispatched question that fails the curator
    // score returns a "no data" answer to the user with the cube content
    // invisibly attached.
    const connectedRefsGate = connectedNodes.map((n) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      factionId: n.factionId,
      edition: n.edition,
    }))
    return c.json({
      detected,
      answer:
        "I don't have solid data on this in my knowledge base." +
        (closestList
          ? `\n\nClosest matches by keyword:\n${closestList}\n\nThose weren't relevant enough for me to answer confidently.`
          : ''),
      answerPath: 'confidence-gate-bypass',
      contextLength: userMessage.length,
      connectedIds: connectedNodes.map((n) => n.id),
      connectedRefs: connectedRefsGate,
      reference: results,
      cubeRefs,
      sources: results,
      connectedCount: connectedNodes.length,
      webSources: geminiResult?.sources ?? [],
      geminiCached: !!cachedGemini,
      webSource: cachedGemini ? 'cache' : geminiResult ? 'gemini' : null,
      errors: { retrieveError, geminiError },
      edition,
      debug: {
        confidenceGate: { triggered: true, topScore, keptCount: curated.kept.length },
        cubeDispatched: cubeContext.length > 0,
        cubeRefsCount: cubeRefs.length,
      },
    })
  }

  // Model selection order:
  //   1. ?model=<provider/name> query param (per-request override, needs gateway id)
  //   2. env.ASK_MODEL (default gateway model, needs gateway id)
  //   3. ?model=claude + ANTHROPIC_API_KEY → direct Anthropic (legacy)
  //   4. Fall back to Workers AI Llama (default)
  //
  // The gateway path uses env.AI.run() with { gateway: { id } } — a binding
  // call, no auth token needed. Model name is `provider/model-id`, e.g.
  // `anthropic/claude-sonnet-4-5-20250929` or `google-ai-studio/gemini-2.5-pro`.
  // Provider API keys stay in the Gateway (BYOK); CF looks them up from the
  // model prefix and forwards downstream.
  const modelParam = c.req.query('model') ?? ''
  const gatewayReady = Boolean(c.env.CF_GATEWAY_ID)
  const gatewayModel =
    gatewayReady && modelParam.includes('/')
      ? modelParam
      : gatewayReady && c.env.ASK_MODEL && modelParam !== 'claude'
        ? c.env.ASK_MODEL
        : null
  const useClaude = !gatewayModel && modelParam === 'claude' && anthropicKey

  if (gatewayModel) {
    answerPath = `gateway:${gatewayModel}`
    // Route via CF AI Gateway's OpenAI-compat endpoint. One URL, one auth
    // token, uniform request/response shape for all providers. We tried the
    // env.AI.run(model, input, { gateway }) binding — it worked for Anthropic
    // but 502'd for every google/* and google-ai-studio/* prefix regardless of
    // request shape (contents/parts, messages, systemInstruction variants).
    // Falling back to the fetch pattern which is provider-shape-neutral.
    if (!c.env.CF_ACCOUNT_ID || !c.env.CF_GATEWAY_ID || !c.env.CF_AI_GATEWAY_TOKEN) {
      return c.json(
        {
          error:
            'AI Gateway not configured (need CF_ACCOUNT_ID, CF_GATEWAY_ID, CF_AI_GATEWAY_TOKEN)',
        },
        500,
      )
    }
    const gwUrl = `https://gateway.ai.cloudflare.com/v1/${c.env.CF_ACCOUNT_ID}/${c.env.CF_GATEWAY_ID}/compat/chat/completions`
    const response = await fetch(gwUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${c.env.CF_AI_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        model: gatewayModel,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return c.json(
        { error: `AI Gateway ${response.status}`, model: gatewayModel, details: err },
        502,
      )
    }

    const gwResponse = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    answer = gwResponse.choices?.[0]?.message?.content ?? 'No response from gateway'
  } else if (useClaude) {
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
    // Llama 3.3 70B on Workers AI has a 128k token context window (~400k chars).
    // The 40k cap was set for an earlier, smaller model and was triggering the
    // deterministic fallback for normal "who can lead X" queries (which load
    // the unit + every connected character + their stratagems + abilities).
    // 150k chars (~38k tokens) leaves comfortable headroom for the model's
    // response while letting big queries actually reach the LLM.
    const MAX_LLM_CONTEXT = 150000

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
        answer = formatConversationalAnswer(body.question, connectedNodes, parentMap, combos)
      }
    } else {
      answerPath = 'deterministic'
      answer = formatConversationalAnswer(body.question, connectedNodes, parentMap, combos)
    }
  }

  // Server-side entity linking — context-scoped.
  //
  // Was: seed with getEntityIndex(bucket) (every entity in the whole brain),
  // then layer retrieved nodes on top. Failure mode: LLM writes "Alpha
  // Strike" as generic tactical language, the linker string-matches to the
  // Space Marines `Alpha Strike` stratagem and adds a wrong link.
  //
  // Now: seed ONLY with the retrieved node set (primary + connected). The
  // LLM was instructed to only use provided context, so the only entities
  // it should be naming are ones from that context — a link to anything
  // outside it is a false positive by construction.
  //
  // Global index is kept as a fallback for HIGH-CONFIDENCE matches only:
  // an entity name that appears verbatim in the answer AND was also in the
  // retrieved node's `keywords` array (i.e., mentioned by name in the
  // context body, just not in the retrieved node's own title).
  const contextScopedEntities = new Map<string, { nodeId: string; title: string }>()
  const contextKeywords = new Set<string>()
  for (const node of [...results, ...connected]) {
    const key = node.title.toLowerCase()
    if (key.length > 2) {
      contextScopedEntities.set(key, { nodeId: node.id, title: node.title })
    }
    for (const kw of node.keywords ?? []) contextKeywords.add(kw.toLowerCase())
  }
  // High-confidence global fallback: only add global entities whose lowercase
  // title also shows up in the retrieved context's keyword set. This lets
  // us link to nodes mentioned by name in a stratagem's body text (e.g.
  // an enhancement referenced by a stratagem card) without linking any
  // word the LLM happens to write.
  const globalEntities = await getEntityIndex(c.env.BRAIN_BUCKET)
  for (const [key, entity] of globalEntities) {
    if (contextScopedEntities.has(key)) continue
    if (contextKeywords.has(key)) contextScopedEntities.set(key, entity)
  }
  answer = linkEntitiesInContent(answer, contextScopedEntities)

  // ── C. Post-gen grounding check ────────────────────────────────────────────
  // After entity linking, count how many `brain:<id>` links in the answer
  // point to nodes actually in the retrieved primary/connected set vs the
  // keyword-fallback layer. All links are grounded-somewhere (D restricted
  // the linker to context-scoped + keyword-fallback), but a high fallback
  // ratio hints the LLM is leaning on peripheral mentions.
  const retrievedIds = new Set<string>()
  for (const node of [...results, ...connected]) retrievedIds.add(node.id)
  const brainLinkPattern = /\(brain:([^)]+)\)/g
  let groundedInPrimary = 0
  let groundedViaKeyword = 0
  const ungroundedLinks: string[] = []
  for (const m of answer.matchAll(brainLinkPattern)) {
    const id = m[1]!
    if (retrievedIds.has(id)) groundedInPrimary++
    else if (contextScopedEntities.has(id.toLowerCase())) groundedViaKeyword++
    else ungroundedLinks.push(id) // shouldn't happen given D, but track for regression
  }
  const groundingStats = {
    totalLinks: groundedInPrimary + groundedViaKeyword + ungroundedLinks.length,
    inRetrievedSet: groundedInPrimary,
    viaKeywordFallback: groundedViaKeyword,
    ungrounded: ungroundedLinks.length,
    ungroundedIds: ungroundedLinks.slice(0, 5),
  }

  // connectedRefs: enrich the connectedIds with title/category/faction so
  // the UI + eval can show WHAT was connected, not just that N things were
  // fetched. Prior response only exposed the raw id list.
  const connectedRefs = connected.map((n) => ({
    id: n.id,
    title: n.title,
    category: n.category,
    factionId: n.factionId,
    edition: n.edition,
  }))

  const responsePayload = {
    detected,
    answer,
    answerPath,
    contextLength: userMessage.length,
    connectedIds: connected.map((c) => c.id),
    connectedRefs,
    reference: results,
    // cubeRefs: brain nodes surfaced by the deterministic cube dispatch
    // (count-shape / ability-source questions). These fed the LLM via the
    // DETERMINISTIC CUBE ANSWER context block but never appeared in
    // reference[] before — the UI "no References" section was lying about
    // brain contribution. Also lets the eval grader see cube-driven
    // brain contribution as first-class instead of inferring from
    // context length.
    cubeRefs,
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
    edition: retrieveResult?.edition ?? edition,
    ...(retrieveResult?.fallback
      ? { fallback: retrieveResult.fallback, fallbackFrom: retrieveResult.fallbackFrom }
      : {}),
    debug: {
      retrieveHasResult: !!retrieveResult,
      retrieveResultCount: results.length,
      connectedCount2: connected.length,
      cubeDispatched: cubeContext.length > 0,
      cubeRefsCount: cubeRefs.length,
      geminiHasResult: !!geminiResult,
      geminiAnswerLen: geminiResult?.answer?.length ?? 0,
      brainContextLen: brainContext.length,
      curator: {
        pooled: pool.length,
        kept: curated.kept.length,
        dropped: curated.droppedIds.length,
        webKept: curated.webKept,
        topScore,
      },
      grounding: groundingStats,
      matchedShapes: matchedShapeIds,
    },
  }

  // Write to /ask cache when the answer is real (not the confidence-gate
  // bypass and not an LLM error path). Fire-and-forget: cache-write failures
  // must not affect the response.
  const isCacheableAnswer =
    askCacheKey &&
    !nocache &&
    typeof answer === 'string' &&
    answer.length > 0 &&
    !answerPath.startsWith('deterministic-fallback')
  if (isCacheableAnswer) {
    try {
      await c.env.BRAIN_BUCKET.put(askCacheKey, JSON.stringify(responsePayload))
    } catch {
      /* cache-write failure is non-fatal */
    }
  }

  return c.json(responsePayload)
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
  const edition = resolveEdition(c.req.query('edition'), c.env.BRAIN_DEFAULT_EDITION)

  const env = {
    ai: c.env.AI,
    vectorize: c.env.BRAIN_INDEX,
    bucket,
  }

  const {
    detected,
    results,
    connected,
    edition: appliedEdition,
    fallback,
    fallbackFrom,
  } = await retrieve(
    {
      query: body.query,
      limit: body.limit || 20,
      filter: body.filter,
      includeConnected: true,
      dualEmbedding: true,
      edition,
    },
    env,
  )

  // Combine primary results + connected nodes for the graph
  // Filter by faction — infer from top result if not in query
  let factionScope = detected.factions
  if (factionScope.length === 0 && results.length > 0 && results[0].factionId) {
    factionScope = [results[0].factionId]
  }
  // Expand each factionId to include its parent-faction shared pool via
  // dim_subfaction (e.g. blood-angels → +space-marines).
  let factionSet: Set<string> | null = null
  if (factionScope.length > 0) {
    factionSet = await expandFactionsForRetrieval(factionScope, c.env.BRAIN_BUCKET)
  }
  const allNodes = [...results, ...connected].filter((n) => {
    if (!factionSet) return true
    if (!n.factionId) return true // generic/core — always include
    if (!factionSet.has(n.factionId)) return false
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

  return c.json({
    detected,
    nodes: nodesWithErrata,
    edges,
    edition: appliedEdition,
    ...(fallback ? { fallback, fallbackFrom } : {}),
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

  // Accept optional ?file= param to index one file at a time, plus
  // ?offset= and ?limit= to chunk huge files (faction-space-marines.json
  // has 1835 nodes — too many for one Worker invocation's CPU budget).
  const targetFile = c.req.query('file')
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0
  const limit = parseInt(c.req.query('limit') ?? '0', 10) || 0

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
    const allNodes = (await obj.json()) as Node[]
    // Apply offset/limit ONLY when a single file is targeted — chunking
    // across files would skip whole files unintentionally.
    const nodes =
      targetFile && (offset > 0 || limit > 0)
        ? allNodes.slice(offset, limit > 0 ? offset + limit : undefined)
        : allNodes

    // Compose the text-to-embed per node. For `datasheet`-category nodes we
    // include the child ability + weapon bodies so ability-text queries
    // ("sustained hits", "twice per battle") still resolve to the parent
    // datasheet. The storage layer keeps those bodies on their own nodes to
    // avoid the datasheet-content duplication that existed pre-fix.
    //
    // Children (`unit-ability`, `weapon` with `datasheetId === parent.id`) are
    // colocated in the same faction file as their parent datasheet (see
    // partitionNodes in sync.ts), so a within-file lookup is sufficient.
    // See lib/vectorize-corpus.ts for the composer implementation + tests.
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE)
      const texts = batch.map((n) => buildCorpusForNode(n, allNodes))

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
            phase: node.phase ?? '',
            // Edition is a Vectorize metadata filter target (see retrieve.ts).
            // Vectorize $eq is exact-match — a missing field never matches, so
            // emit 'unknown' sentinel for untagged nodes. The retrieve.ts
            // post-filter still applies as defence in depth.
            edition: node.edition ?? 'unknown',
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
    offset: targetFile ? offset : undefined,
    limit: targetFile ? limit : undefined,
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

// Exported for tests — direct access to the Hono app for in-process request.
export { app }

export default {
  fetch: app.fetch,
}
