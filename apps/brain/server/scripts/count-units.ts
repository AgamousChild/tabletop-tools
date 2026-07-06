/**
 * count-units.ts — unit (datasheet) count reconciliation oracle.
 *
 * Companion to count-detachments.mjs / count-strat-enh.mjs, for the
 * 2026-07-06 unit count reconciliation working set.
 *
 * Counts 11e/10e units per faction across every source:
 *   1. Brain graph        .local/brain/nodes/*.json (category=datasheet)
 *   2. Faction packs v2   .local/faction-pack-extracts/*.json (datasheets + legendsDatasheets)
 *   3. Wahapedia 10e      apps/data-import/client/public/wahapedia/datasheets.json
 *   4. BSData 11e staged  .local/brain-input/bsdata-units.json (Mithraw fork rows)
 *   5. BSData repos       C:/R/wh40k-10e and C:/R/wh40k-11e local .cat files,
 *                         parsed with the platform parser (parseBSDataXml)
 *   6. SQL                content_entity WHERE type='datasheet' (Turso; falls
 *                         back to file:.local/dev.db when TURSO_DB_URL unset)
 *
 * Chapter-home convention (mirrors bsdata-subfactions.ts::chapterSpecificHome):
 * a unit appearing in <=2 SM chapter catalogs is chapter-specific (home = that
 * chapter); >=3 catalogs means shared -> home = space-marines.
 *
 * Usage (from apps/brain/server/):
 *   npx tsx scripts/count-units.ts
 * Writes .local/unit-counts.json for the report.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

// Post-outage network is slow to reach Turso (aws-us-west-2) — TLS connect can
// exceed undici's 10s default. Raise it and retry at the call sites.
import { Agent, setGlobalDispatcher } from 'undici'

setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }))

/** Retry helper — the post-outage route to Turso drops connections randomly. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      console.error(
        `  ${label}: attempt ${i}/${attempts} failed (${(err as Error).message ?? err})`,
      )
      await new Promise((r) => setTimeout(r, i * 2000))
    }
  }
  throw lastErr
}

import { createDb } from '@tabletop-tools/db'
import {
  type CatalogRegistry,
  parseBSDataXml,
} from '@tabletop-tools/game-content/src/adapters/bsdata/parser'
import { sql } from 'drizzle-orm'

import { DROPPED_FACTION_IDS, loadFactionCodes, normalizeFactionId } from '../src/lib/faction-codes'

const SERVER_ROOT = join(import.meta.dirname, '..')
const REPO_ROOT = join(SERVER_ROOT, '..', '..', '..')
const NODES_DIR = join(SERVER_ROOT, '.local', 'brain', 'nodes')
const PACKS_DIR = join(SERVER_ROOT, '.local', 'faction-pack-extracts')
const WAHA_DATASHEETS = join(
  REPO_ROOT,
  'apps',
  'data-import',
  'client',
  'public',
  'wahapedia',
  'datasheets.json',
)
const BSDATA_STAGED = join(SERVER_ROOT, '.local', 'brain-input', 'bsdata-units.json')
const BSDATA_10E_DIR = 'C:/R/wh40k-10e'
const BSDATA_11E_DIR = 'C:/R/wh40k-11e'
const OUT_FILE = join(SERVER_ROOT, '.local', 'unit-counts.json')

const SM_CHAPTER_SLUGS = new Set([
  'black-templars',
  'blood-angels',
  'dark-angels',
  'deathwatch',
  'imperial-fists',
  'iron-hands',
  'raven-guard',
  'salamanders',
  'space-wolves',
  'ultramarines',
  'white-scars',
])

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * BSData catalog-name → canonical slug aliases the DB alias table doesn't
 * carry (catalog naming is a BSData convention, not a faction name).
 * `null` = excluded from the 36-faction reconciliation (tracked separately).
 */
const CATALOG_ALIASES: Record<string, string | null> = {
  'aeldari-craftworlds': 'aeldari',
  'aeldari-drukhari': 'drukhari',
  'aeldari-ynnari': null, // Ynnari roster = Craftworld+Drukhari duplicates; not one of the 36
  'agents-of-the-imperium': 'imperial-agents',
  'titanicus-traitoris': 'chaos-titan-legions',
  'unaligned-forces': null,
  unaligned: null,
}

/** Resolve a BSData catalog/faction label to a canonical slug, or null when excluded. */
function resolveCatalogSlug(label: string): string | null {
  if (/librar/i.test(label)) return null // structural library catalogs
  const slug = normalizeFactionId(label)
  if (slug in CATALOG_ALIASES) return CATALOG_ALIASES[slug]
  if (DROPPED_FACTION_IDS.has(slug)) return null
  return slug
}

interface PerFaction {
  [slug: string]: number
}
const bump = (m: PerFaction, slug: string, n = 1) => {
  m[slug] = (m[slug] ?? 0) + n
}

// ── 1. Brain graph ───────────────────────────────────────────────────────────
function countBrain() {
  const files = readdirSync(NODES_DIR).filter((f) => f.endsWith('.json'))
  const ds11: PerFaction = {}
  const ds10: PerFaction = {}
  const uniq11 = new Map<string, Set<string>>() // slug -> normalized titles
  const names11 = new Map<string, Map<string, string>>() // slug -> key -> display title
  const dup11: Array<{ factionId: string; title: string; id: string }> = []
  for (const f of files) {
    const nodes = JSON.parse(readFileSync(join(NODES_DIR, f), 'utf-8'))
    for (const n of Array.isArray(nodes) ? nodes : [nodes]) {
      if (n.category !== 'datasheet') continue
      const slug = n.factionId ?? '?'
      if (n.edition === '11th') {
        bump(ds11, slug)
        let set = uniq11.get(slug)
        if (!set) uniq11.set(slug, (set = new Set()))
        const key = normTitle(n.title)
        if (set.has(key)) dup11.push({ factionId: slug, title: n.title, id: n.id })
        set.add(key)
        let m = names11.get(slug)
        if (!m) names11.set(slug, (m = new Map()))
        m.set(key, n.title)
      } else if (n.edition === '10th') {
        bump(ds10, slug)
      }
    }
  }
  const uniq: PerFaction = {}
  for (const [slug, set] of uniq11) uniq[slug] = set.size
  return { ds11, ds10, uniq11: uniq, dup11, names11 }
}

// ── 2. Faction pack extracts ─────────────────────────────────────────────────
function countPacks() {
  const datasheets: PerFaction = {}
  const legends: PerFaction = {}
  const names = new Map<string, string[]>()
  const legendsNames = new Map<string, string[]>()
  for (const f of readdirSync(PACKS_DIR).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const slug = normalizeFactionId(basename(f, '.json'))
    const pack = JSON.parse(readFileSync(join(PACKS_DIR, f), 'utf-8'))
    const ds: Array<{ name: string; isLegends?: boolean }> = pack.datasheets ?? []
    const lg: Array<{ name: string }> = pack.legendsDatasheets ?? []
    bump(datasheets, slug, ds.filter((d) => !d.isLegends).length)
    bump(legends, slug, lg.length + ds.filter((d) => d.isLegends).length)
    names.set(
      slug,
      ds.filter((d) => !d.isLegends).map((d) => d.name),
    )
    legendsNames.set(slug, [
      ...lg.map((d) => d.name),
      ...ds.filter((d) => d.isLegends).map((d) => d.name),
    ])
  }
  return { datasheets, legends, names, legendsNames }
}

// ── 3. Wahapedia ─────────────────────────────────────────────────────────────
function countWahapedia() {
  const rows = JSON.parse(readFileSync(WAHA_DATASHEETS, 'utf-8')) as Array<{
    name: string
    factionId: string
    isLegends?: boolean | string
  }>
  const total: PerFaction = {}
  const legends: PerFaction = {}
  const nonLegends: PerFaction = {}
  const names = new Map<string, Map<string, { name: string; isLegends: boolean }>>()
  for (const r of rows) {
    const slug = normalizeFactionId(r.factionId)
    const isLegends = r.isLegends === true || r.isLegends === 'true'
    bump(total, slug)
    if (isLegends) bump(legends, slug)
    else bump(nonLegends, slug)
    let m = names.get(slug)
    if (!m) names.set(slug, (m = new Map()))
    m.set(normTitle(r.name), { name: r.name, isLegends })
  }
  return { total, legends, nonLegends, rowCount: rows.length, names }
}

// ── 4. BSData 11e staged rows ────────────────────────────────────────────────
function countBsdataStaged() {
  const rows = JSON.parse(readFileSync(BSDATA_STAGED, 'utf-8')) as Array<{
    name: string
    faction: string
    subfaction?: string
  }>
  // SM-family rows: name -> set of chapter slugs (mirrors parseBsdataSubfactions)
  const smCatalogSets = new Map<string, Set<string>>()
  // non-SM: slug -> set of normalized names (dedupe within catalog)
  const bySlug = new Map<string, Set<string>>()
  let excluded = 0
  for (const r of rows) {
    const slug = resolveCatalogSlug(r.faction)
    if (slug === null) {
      excluded++
      continue
    }
    const key = normTitle(r.name)
    if (slug === 'space-marines' && r.subfaction) {
      let set = smCatalogSets.get(key)
      if (!set) smCatalogSets.set(key, (set = new Set()))
      set.add(r.subfaction)
    } else {
      let set = bySlug.get(slug)
      if (!set) bySlug.set(slug, (set = new Set()))
      set.add(key)
    }
  }
  const resolved: PerFaction = {}
  for (const [slug, set] of bySlug) resolved[slug] = set.size
  for (const [, catalogs] of smCatalogSets) {
    // chapterSpecificHome convention: <=2 catalogs -> chapter home, else shared
    const home = catalogs.size <= 2 ? [...catalogs].sort()[0] : 'space-marines'
    bump(resolved, home)
  }
  return { resolved, rowCount: rows.length, smNameCount: smCatalogSets.size, excluded }
}

// ── 5. BSData local repos (10e + 11e) ────────────────────────────────────────
function countBsdataRepo(dir: string) {
  const catFiles = readdirSync(dir).filter((f) => f.endsWith('.cat'))
  const registry: CatalogRegistry = new Map()
  const fetched: Array<{ name: string; xml: string }> = []
  for (const f of catFiles) {
    const xml = readFileSync(join(dir, f), 'utf-8')
    const name = basename(f, '.cat').replace(/^(Imperium|Chaos)\s*-\s*/, '')
    fetched.push({ name, xml })
    const idMatch = /<catalogue\b[^>]*?\bid="([^"]+)"/i.exec(xml)
    if (idMatch?.[1]) registry.set(idMatch[1], { name: f, xml })
  }
  // catalog name -> unique unit names
  const perCatalog = new Map<string, Set<string>>()
  const errors: string[] = []
  for (const f of fetched) {
    if (/library/i.test(f.name)) continue // structural catalogs parse under their consumers
    try {
      const { units } = parseBSDataXml(f.xml, f.name, registry)
      const set = new Set<string>()
      for (const u of units) set.add(normTitle(u.name))
      perCatalog.set(f.name, set)
    } catch (err) {
      errors.push(`${f.name}: ${String(err)}`)
    }
  }
  // Resolve to 36-faction slugs with the chapter-home convention.
  const chapterNames = new Map<string, Set<string>>() // unit key -> chapter slugs
  const resolved: PerFaction = {}
  const unmapped: PerFaction = {}
  for (const [catName, units] of perCatalog) {
    const slug = resolveCatalogSlug(catName)
    if (slug === null) {
      bump(unmapped, normalizeFactionId(catName), units.size)
      continue
    }
    if (SM_CHAPTER_SLUGS.has(slug) || slug === 'space-marines') {
      for (const key of units) {
        let set = chapterNames.get(key)
        if (!chapterNames.has(key)) chapterNames.set(key, (set = new Set()))
        set!.add(slug)
      }
    } else {
      bump(resolved, slug, units.size)
    }
  }
  for (const [, slugs] of chapterNames) {
    const chapters = [...slugs].filter((s) => s !== 'space-marines')
    // in the SM base catalog OR >=3 chapter catalogs -> shared pool
    const home =
      slugs.has('space-marines') || chapters.length >= 3
        ? 'space-marines'
        : (chapters.sort()[0] ?? 'space-marines')
    bump(resolved, home)
  }
  return { resolved, unmapped, errors, catalogCount: perCatalog.size }
}

// ── 6. SQL content_entity ────────────────────────────────────────────────────
function loadRootEnv() {
  if (process.env.TURSO_DB_URL) return
  const envPath = join(REPO_ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*(TURSO_DB_URL|TURSO_AUTH_TOKEN)\s*=\s*(.+)\s*$/.exec(line)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

async function countSql() {
  const db = createDb({
    url: process.env.TURSO_DB_URL ?? 'file:.local/dev.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  const rows = (await db.all(
    sql`SELECT faction_id AS factionId, COUNT(*) AS n FROM content_entity WHERE type = 'datasheet' GROUP BY faction_id`,
  )) as Array<{ factionId: string | null; n: number }>
  const resolved: PerFaction = {}
  for (const r of rows) bump(resolved, r.factionId ?? '(null)', r.n)
  const [{ total }] = (await db.all(
    sql`SELECT COUNT(*) AS total FROM content_entity WHERE type = 'datasheet'`,
  )) as Array<{ total: number }>
  return {
    resolved,
    total,
    sqlUrl: (process.env.TURSO_DB_URL ?? 'file:.local/dev.db').split('@').pop(),
  }
}

/**
 * Classification diff — per goal doc §3.
 *
 * Expected 11e set per faction = Wahapedia 10e non-Legends (retained-legal,
 * replicated to 11e) ∪ pack non-Legends datasheets (official 11e), minus
 * anything the packs explicitly mark Legends. The SM family (space-marines +
 * 11 chapter slugs) is diffed as one pool because Wahapedia files chapters
 * under "Space Marines" while the brain routes them to chapter shards.
 */
function classify(
  brain: ReturnType<typeof countBrain>,
  packs: ReturnType<typeof countPacks>,
  waha: ReturnType<typeof countWahapedia>,
) {
  const family = (slug: string) =>
    SM_CHAPTER_SLUGS.has(slug) || slug === 'space-marines' ? 'space-marines-family' : slug

  // group -> key -> display name
  const expected = new Map<string, Map<string, string>>()
  const legendsKeys = new Map<string, Set<string>>() // pack-declared Legends
  const add = (group: string, key: string, name: string) => {
    let m = expected.get(group)
    if (!m) expected.set(group, (m = new Map()))
    if (!m.has(key)) m.set(key, name)
  }
  for (const [slug, m] of waha.names) {
    for (const [key, v] of m) {
      if (!v.isLegends) add(family(slug), key, v.name)
    }
  }
  for (const [slug, list] of packs.names) {
    for (const name of list) add(family(slug), normTitle(name), name)
  }
  for (const [slug, list] of packs.legendsNames) {
    const g = family(slug)
    let set = legendsKeys.get(g)
    if (!set) legendsKeys.set(g, (set = new Set()))
    for (const name of list) set.add(normTitle(name))
  }
  // Pack-declared Legends override retained-legal (GW moved the unit to
  // Legends) — EXCEPT when the same name also appears in the pack's regular
  // datasheet section (MUTILATORS returns from Legends in the 11e CSM pack;
  // the regular sheet wins).
  const regularByGroup = new Map<string, Set<string>>()
  for (const [slug, list] of packs.names) {
    const g = family(slug)
    let set = regularByGroup.get(g)
    if (!set) regularByGroup.set(g, (set = new Set()))
    for (const name of list) set.add(normTitle(name))
  }
  for (const [g, keys] of legendsKeys) {
    const m = expected.get(g)
    const regular = regularByGroup.get(g)
    if (m) for (const k of keys) if (!regular?.has(k)) m.delete(k)
  }

  const brainByGroup = new Map<string, Map<string, string>>()
  for (const [slug, m] of brain.names11) {
    const g = family(slug)
    let gm = brainByGroup.get(g)
    if (!gm) brainByGroup.set(g, (gm = new Map()))
    for (const [k, title] of m) if (!gm.has(k)) gm.set(k, title)
  }

  const perGroup: Record<
    string,
    { expected: number; brain: number; missing: string[]; extra: string[] }
  > = {}
  for (const g of new Set([...expected.keys(), ...brainByGroup.keys()])) {
    const exp = expected.get(g) ?? new Map<string, string>()
    const got = brainByGroup.get(g) ?? new Map<string, string>()
    const missing = [...exp.entries()].filter(([k]) => !got.has(k)).map(([, n]) => n)
    const extra = [...got.entries()].filter(([k]) => !exp.has(k)).map(([, n]) => n)
    perGroup[g] = { expected: exp.size, brain: got.size, missing, extra }
  }
  return perGroup
}

async function main() {
  loadRootEnv()
  await withRetry('loadFactionCodes', async () => {
    const db = createDb({
      url: process.env.TURSO_DB_URL ?? 'file:.local/dev.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    await loadFactionCodes(db)
  })

  const brain = countBrain()
  const packs = countPacks()
  const waha = countWahapedia()
  const staged = countBsdataStaged()
  const bs10 = countBsdataRepo(BSDATA_10E_DIR)
  const bs11 = countBsdataRepo(BSDATA_11E_DIR)
  const sqlCounts = await withRetry('countSql', countSql)

  const allSlugs = new Set<string>([
    ...Object.keys(brain.ds11),
    ...Object.keys(brain.ds10),
    ...Object.keys(packs.datasheets),
    ...Object.keys(waha.total),
    ...Object.keys(staged.resolved),
    ...Object.keys(bs10.resolved),
    ...Object.keys(bs11.resolved),
    ...Object.keys(sqlCounts.resolved),
  ])

  const sum = (m: PerFaction) => Object.values(m).reduce((a, b) => a + b, 0)

  console.log('=== Unit count reconciliation — per faction ===')
  console.log(
    'faction'.padEnd(24),
    [
      'brain11',
      'brain10',
      'pack',
      'packLgd',
      'waha',
      'wahaLgd',
      'bs11stg',
      'bs11cat',
      'bs10cat',
      'sql',
    ]
      .map((h) => h.padStart(8))
      .join(''),
  )
  for (const slug of [...allSlugs].sort()) {
    const row = [
      brain.ds11[slug] ?? 0,
      brain.ds10[slug] ?? 0,
      packs.datasheets[slug] ?? 0,
      packs.legends[slug] ?? 0,
      waha.total[slug] ?? 0,
      waha.legends[slug] ?? 0,
      staged.resolved[slug] ?? 0,
      bs11.resolved[slug] ?? 0,
      bs10.resolved[slug] ?? 0,
      sqlCounts.resolved[slug] ?? 0,
    ]
    console.log(slug.padEnd(24), row.map((n) => String(n).padStart(8)).join(''))
  }
  console.log(
    'TOTAL'.padEnd(24),
    [
      sum(brain.ds11),
      sum(brain.ds10),
      sum(packs.datasheets),
      sum(packs.legends),
      sum(waha.total),
      sum(waha.legends),
      sum(staged.resolved),
      sum(bs11.resolved),
      sum(bs10.resolved),
      sqlCounts.total,
    ]
      .map((n) => String(n).padStart(8))
      .join(''),
  )
  console.log()
  const classification = classify(brain, packs, waha)
  console.log(
    '=== Classification diff (expected = waha non-Legends ∪ pack, minus pack Legends) ===',
  )
  for (const [g, c] of Object.entries(classification).sort()) {
    if (c.missing.length === 0 && c.extra.length === 0) continue
    console.log(
      `${g}: expected=${c.expected} brain=${c.brain} missing=${c.missing.length} extra=${c.extra.length}`,
    )
    for (const n of c.missing.slice(0, 10)) console.log(`   MISSING: ${n}`)
    for (const n of c.extra.slice(0, 10)) console.log(`   EXTRA:   ${n}`)
  }
  console.log()
  console.log(`Brain 11e per-faction duplicate titles: ${brain.dup11.length}`)
  for (const d of brain.dup11.slice(0, 30)) console.log(`  ${d.factionId} / ${d.title} — ${d.id}`)
  if (bs10.errors.length) console.log(`BSData 10e parse errors: ${bs10.errors.length}`)
  if (bs11.errors.length) console.log(`BSData 11e parse errors: ${bs11.errors.length}`)
  console.log(`BSData 10e unmapped (dropped factions):`, bs10.unmapped)
  console.log(`BSData 11e unmapped (dropped factions):`, bs11.unmapped)
  console.log(`SQL source: ${sqlCounts.sqlUrl}`)

  // Per-faction 11e unit title lists for the acceptance-test harness.
  const unitNames: Record<string, string[]> = {}
  for (const [slug, m] of brain.names11) unitNames[slug] = [...m.values()].sort()
  writeFileSync(
    join(SERVER_ROOT, '.local', 'unit-names-11e.json'),
    JSON.stringify(unitNames, null, 2),
  )
  writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        brain,
        packs: { datasheets: packs.datasheets, legends: packs.legends },
        waha,
        staged,
        bs10,
        bs11,
        sql: sqlCounts,
        classification,
      },
      (k, v) => (v instanceof Map ? undefined : v),
      2,
    ),
  )
  console.log(`\nWrote ${OUT_FILE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
