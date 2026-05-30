/**
 * Build brain Nodes for every translated rule, mission card, and ability, and
 * write the content_node_link crosswalk (brain node id -> canonical content_entity id).
 *
 * Nodes are written LOCALLY (the brain R2 upload + Vectorize re-index is a separate,
 * deliberate publish step — NOT done here). content_node_link is a DB row (the crosswalk
 * infrastructure), written here. Node shape matches apps/brain/server/src/lib/model.ts.
 *
 * Usage: node scripts/11th-ingest/build-brain-nodes.mjs <reference.json> <abilities.json> <outDir> [--dry]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const RETRIEVED = new Date().toISOString()

const phaseOf = (section = '') => {
  const s = section.toLowerCase()
  if (s.includes('command')) return 'command'
  if (s.includes('movement')) return 'movement'
  if (s.includes('shooting')) return 'shooting'
  if (s.includes('charge')) return 'charge'
  if (s.includes('fight')) return 'fight'
  return undefined
}
const ruleCategory = (section = '') => {
  const s = section.toLowerCase()
  if (s.includes('stratagem')) return 'stratagem'
  if (s.includes('terrain')) return 'terrain'
  if (/phase|battle round/.test(s)) return 'phase-sequence'
  if (s.includes('abilities')) return 'keyword'
  if (s.includes('mission deck')) return 'mission'
  return 'core-mechanic'
}

export function buildNodes(ref, abil) {
  const nodes = []
  const links = []

  for (const r of ref.rules || []) {
    const id = `11th-rule-${slug(r.title_en)}`
    const doc = r.source?.doc || 'core'
    nodes.push({
      id, layer: 'core', category: doc === 'mission' ? 'mission' : ruleCategory(r.section),
      title: r.title_en, content: r.text_en || r.title_en, summary: `${r.section || 'Rule'}: ${r.title_en}`,
      ...(phaseOf(r.section) ? { phase: phaseOf(r.section) } : {}),
      sources: [{ type: 'pdf', title: doc === 'mission' ? 'Chapter Approved 2026-27 mission deck' : 'Warhammer 40,000 11th ed core rules', ...(r.source?.page ? { page: r.source.page } : {}), retrievedAt: RETRIEVED }],
    })
  }

  for (const c of ref.cards || []) {
    const cat = c.kind === 'deployment' ? 'deployment-zone' : c.kind === 'primary' ? 'primary-mission' : c.kind === 'secondary' ? 'secondary-mission' : 'mission'
    const id = `11th-${c.kind}-${slug(c.title_en)}`
    const body = [c.flavor_en, c.rules_en, ...(c.scoring || []).map((s) => `${s.vp} VP: ${s.condition}`)].filter(Boolean).join('\n')
    nodes.push({
      id, layer: 'core', category: cat, title: c.title_en, content: body || c.title_en, summary: `${c.kind} mission: ${c.title_en}`,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2026-27 mission deck', ...(c.source?.page ? { page: c.source.page } : {}), retrievedAt: RETRIEVED }],
    })
    if (c.kind === 'primary' || c.kind === 'secondary') links.push({ brain_node_id: id, canonical_id: c.id })
  }

  for (const a of abil.abilities || []) {
    const id = `11th-ability-${slug(a.name)}`
    nodes.push({
      id, layer: 'core', category: a.type === 'unit' ? 'unit-ability' : 'keyword',
      title: a.name, content: a.effect, summary: `${a.type} ability: ${a.name}`,
      sources: [{ type: 'pdf', title: 'Warhammer 40,000 11th ed core rules', retrievedAt: RETRIEVED }],
    })
    links.push({ brain_node_id: id, canonical_id: a.id })
  }

  return { nodes, links }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/build-brain-nodes.mjs')) {
  const [, , refPath, abilPath, outDir] = process.argv
  const dry = process.argv.includes('--dry')
  const { nodes, links } = buildNodes(JSON.parse(readFileSync(refPath, 'utf8')), JSON.parse(readFileSync(abilPath, 'utf8')))
  mkdirSync(outDir, { recursive: true })
  for (const n of nodes) writeFileSync(`${outDir}/${n.id}.json`, JSON.stringify(n, null, 2))
  let stats = { inserted: 0, skippedSame: 0, skippedDifferent: 0 }
  if (!dry) {
    const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
    const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })
    const now = Math.floor(Date.now() / 1000)
    for (const l of links) {
      // Append-only crosswalk: only insert a chain head if no active link exists for this brain_node.
      // A divergent canonical is a re-key — those go through the validation process (worklist step 10),
      // not this script. We surface the drift instead of silently overwriting.
      const existing = await db.execute({
        sql: `SELECT canonical_id FROM content_node_link WHERE brain_node_id = ? AND superseded_at IS NULL LIMIT 1`,
        args: [l.brain_node_id],
      })
      if (existing.rows.length > 0) {
        if (existing.rows[0].canonical_id === l.canonical_id) {
          stats.skippedSame++
        } else {
          stats.skippedDifferent++
          console.warn(`[11th-ingest] active link exists for ${l.brain_node_id} → ${existing.rows[0].canonical_id}; new candidate is ${l.canonical_id}; skipping (re-key needs validation — worklist step 10)`)
        }
        continue
      }
      const linkId = `11th:${l.brain_node_id}`
      await db.execute({
        sql: `INSERT INTO content_node_link (link_id, brain_node_id, canonical_id, match_method, confidence, prior_link_id, validation_method, validated_by, validated_at, superseded_at) VALUES (?, ?, ?, ?, ?, NULL, 'auto-initial', '11th-ingest', ?, NULL) ON CONFLICT(link_id) DO NOTHING`,
        args: [linkId, l.brain_node_id, l.canonical_id, 'manual', 1, now],
      })
      stats.inserted++
    }
  }
  console.log(`nodes=${nodes.length} written to ${outDir}; content_node_link candidates=${links.length}${dry ? ' [dry]' : ` (inserted=${stats.inserted} skipped-same=${stats.skippedSame} skipped-different=${stats.skippedDifferent})`}`)
  console.log('HELD: R2 node upload + Vectorize re-index — awaiting go.')
}
