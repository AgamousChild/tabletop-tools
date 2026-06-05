/**
 * Populate content_entity + content_can_lead from parsed 11th-edition datasheets.
 *
 * Reads brain node JSON files (one per datasheet, with .attach metadata) and:
 *   1. Upserts each datasheet as a content_entity (type='datasheet')
 *   2. For Ancient-style SUPPORT characters → can_deploy_solo=false
 *      (LEADER characters keep can_deploy_solo=true; bodyguards keep default)
 *   3. Resolves each `attach.canLead[]` ALL-CAPS readable name to an existing
 *      content_entity row by (lowercased exact name, then prefix match,
 *      faction-filtered).
 *   4. Inserts content_can_lead rows with (leader, bodyguard, role).
 *
 * Usage: node scripts/11th-ingest/populate-can-lead.mjs <faction-id> <ds-dir> [--dry]
 *   faction-id   canonical content_entity faction id (e.g. 'space-marines')
 *   ds-dir       directory containing 11e-ds-*.json files
 *   --dry        print resolution map + counts, don't write
 *
 * Idempotent: ON CONFLICT DO NOTHING.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createClient } from '@libsql/client'

const args = process.argv.slice(2)
const factionId = args[0]
const dsDir = args[1]
const dry = args.includes('--dry')
if (!factionId || !dsDir) {
  console.error('Usage: populate-can-lead.mjs <faction-id> <ds-dir> [--dry]')
  process.exit(2)
}

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })

// ── Load datasheets ─────────────────────────────────────────────────────

const datasheets = readdirSync(dsDir)
  .filter((f) => f.startsWith('11e-ds-') && f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`${dsDir}/${f}`, 'utf8')))

console.log(`Loaded ${datasheets.length} datasheets from ${dsDir}`)

// ── Step 1: upsert content_entity for each datasheet ────────────────────

const now = Math.floor(Date.now() / 1000)
const dsRoleById = new Map()
for (const ds of datasheets) {
  const role = ds.attach?.role ?? null // 'LEADER' | 'SUPPORT' | null
  dsRoleById.set(ds.id, role)
  // can_deploy_solo: false for SUPPORT-only; true otherwise.
  // LEADER characters CAN deploy solo (rule allows). SUPPORT characters MUST attach.
  const canDeploySolo = role === 'SUPPORT' ? 0 : 1
  if (!dry) {
    await db.execute({
      sql: `INSERT INTO content_entity (id, type, name, faction_id, r2_key, can_deploy_solo, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              faction_id=COALESCE(content_entity.faction_id, excluded.faction_id),
              r2_key=excluded.r2_key,
              can_deploy_solo=excluded.can_deploy_solo,
              updated_at=excluded.updated_at`,
      args: [ds.id, 'datasheet', ds.title, factionId, `nodes/${dsDir.split('/').pop()}.json`, canDeploySolo, now],
    })
  }
}
console.log(`[content_entity] ${dry ? 'would upsert' : 'upserted'} ${datasheets.length} datasheets`)

// ── Step 2: resolve canLead bodyguard names → content_entity ids ────────

const allDatasheets = await db.execute(
  "SELECT id, name, faction_id FROM content_entity WHERE type='datasheet'",
)
// Index by normalized name → list of {id, faction_id}
const byName = new Map()
for (const row of allDatasheets.rows) {
  const key = String(row.name).toLowerCase().trim()
  const arr = byName.get(key) ?? []
  arr.push({ id: row.id, factionId: row.faction_id })
  byName.set(key, arr)
}

/**
 * Resolve an ALL-CAPS readable name to a content_entity id.
 * 1) exact lowercase match preferred to same-faction rows
 * 2) "X SQUAD" → "X Squad" exact
 * 3) prefix match (longest first), faction-filtered
 * Returns array of matched ids (may be multiple — e.g. "VANGUARD" matches
 * both base + JP variant, both are legitimate attachment targets).
 */
function resolve(name) {
  const lc = name.toLowerCase().trim()
  // Exact match
  if (byName.has(lc)) {
    const candidates = byName.get(lc)
    const sameFaction = candidates.filter((c) => c.factionId === factionId)
    return sameFaction.length > 0 ? sameFaction.map((c) => c.id) : candidates.map((c) => c.id)
  }
  // Try "X" → "X Squad"
  const withSquad = lc + ' squad'
  if (byName.has(withSquad)) {
    const candidates = byName.get(withSquad)
    const sameFaction = candidates.filter((c) => c.factionId === factionId)
    return sameFaction.length > 0 ? sameFaction.map((c) => c.id) : candidates.map((c) => c.id)
  }
  // Prefix match in same faction
  const matches = []
  for (const [k, candidates] of byName) {
    if (k.startsWith(lc) || k.includes(lc)) {
      for (const c of candidates) {
        if (c.factionId === factionId) matches.push(c.id)
      }
    }
  }
  return matches
}

// ── Step 3: build + insert content_can_lead rows ────────────────────────

const resolution = []
let totalPairs = 0
let unresolved = 0
const canLeadRows = []

for (const ds of datasheets) {
  if (!ds.attach?.role || !ds.attach?.canLead) continue
  const role = ds.attach.role.toLowerCase() // 'leader' | 'support'
  for (const targetName of ds.attach.canLead) {
    const ids = resolve(targetName)
    if (ids.length === 0) {
      resolution.push({ leader: ds.title, target: targetName, role, matched: 'UNRESOLVED' })
      unresolved++
      continue
    }
    for (const bgId of ids) {
      resolution.push({ leader: ds.title, target: targetName, role, matched: bgId })
      canLeadRows.push({
        leaderDatasheetId: ds.id,
        bodyguardDatasheetId: bgId,
        role,
      })
      totalPairs++
    }
  }
}

console.log('\n=== Resolution map ===')
for (const r of resolution) {
  console.log(`  ${r.leader.padEnd(45)} ${r.role.padEnd(8)} ${r.target.padEnd(40)} → ${r.matched}`)
}

console.log(`\n[resolved] ${totalPairs} pair(s) · [unresolved] ${unresolved}`)

if (!dry && canLeadRows.length > 0) {
  // Chunk insert
  const CHUNK = 100
  let inserted = 0
  for (let i = 0; i < canLeadRows.length; i += CHUNK) {
    const chunk = canLeadRows.slice(i, i + CHUNK)
    for (const row of chunk) {
      await db.execute({
        sql: `INSERT INTO content_can_lead (leader_datasheet_id, bodyguard_datasheet_id, role)
              VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
        args: [row.leaderDatasheetId, row.bodyguardDatasheetId, row.role],
      })
      inserted++
    }
  }
  console.log(`[content_can_lead] inserted ${inserted} rows (ON CONFLICT DO NOTHING)`)
}

console.log('\nDone.')
