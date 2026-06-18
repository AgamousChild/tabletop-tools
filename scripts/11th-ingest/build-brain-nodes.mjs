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
  let stats = { inserted: 0, skippedSame: 0, queued: 0, skippedMissingSchema: 0 }
  if (!dry) {
    const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
    const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })
    const now = Math.floor(Date.now() / 1000)

    // Deploy-order safety: if migration 0005 hasn't been applied yet, the
    // content_node_link_candidate table doesn't exist. Skip the queue path
    // with a clear message rather than crashing mid-loop.
    const candidateTable = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='content_node_link_candidate'`,
    )
    const haveCandidateTable = candidateTable.rows.length > 0

    const runId = new Date().toISOString()
    const source = '11th-ingest:cards-abilities'

    for (const l of links) {
      // content_node_link is one row per brain_node_id (PK). Look up current state.
      const existing = await db.execute({
        sql: `SELECT canonical_id FROM content_node_link WHERE brain_node_id = ? LIMIT 1`,
        args: [l.brain_node_id],
      })
      if (existing.rows.length > 0) {
        if (existing.rows[0].canonical_id === l.canonical_id) {
          stats.skippedSame++
          continue
        }
        // Divergent canonical — queue a pending candidate (re-key needs validation).
        if (!haveCandidateTable) {
          stats.skippedMissingSchema++
          console.warn(`[11th-ingest] divergent canonical for ${l.brain_node_id}: ${existing.rows[0].canonical_id} → ${l.canonical_id}; candidate table missing (migration 0005 not applied?); skipping`)
          continue
        }
        try {
          await db.execute({
            sql: `INSERT INTO content_node_link_candidate (candidate_id, brain_node_id, proposed_canonical_id, match_method, confidence, prior_canonical_id, source, run_id, proposed_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            args: [
              `cnd-11th:${l.brain_node_id}:${l.canonical_id}`,
              l.brain_node_id,
              l.canonical_id,
              'manual',
              1,
              existing.rows[0].canonical_id,
              source,
              runId,
              now,
            ],
          })
          stats.queued++
        } catch (err) {
          // Partial unique on (brain_node, proposed) WHERE pending — silent dedupe.
          if (String(err).includes('UNIQUE')) continue
          throw err
        }
        continue
      }

      // First-time link: INSERT content_node_link + INSERT history (audit row).
      // Both writes — best-effort sequential. Failure of the second leaves the
      // link without a history row, surfaced by audit queries; not corrupting.
      try {
        await db.execute({
          sql: `INSERT INTO content_node_link (brain_node_id, canonical_id, match_method, confidence, validation_method, validated_by, validated_at) VALUES (?, ?, ?, ?, 'auto-initial', '11th-ingest', ?) ON CONFLICT(brain_node_id) DO NOTHING`,
          args: [l.brain_node_id, l.canonical_id, 'manual', 1, now],
        })
        await db.execute({
          sql: `INSERT INTO content_node_link_history (history_id, brain_node_id, prior_canonical_id, new_canonical_id, changed_at, changed_by, change_method) VALUES (?, ?, NULL, ?, ?, '11th-ingest', 'auto-initial')`,
          args: [
            `hist-11th:${l.brain_node_id}:${now}`,
            l.brain_node_id,
            l.canonical_id,
            now,
          ],
        })
        stats.inserted++
      } catch (err) {
        console.warn(`[11th-ingest] insert failed for ${l.brain_node_id}: ${String(err)}`)
      }
    }
  }
  console.log(`nodes=${nodes.length} written to ${outDir}; content_node_link candidates=${links.length}${dry ? ' [dry]' : ` (inserted=${stats.inserted} skipped-same=${stats.skippedSame} queued=${stats.queued} skipped-missing-schema=${stats.skippedMissingSchema})`}`)
  console.log('HELD: R2 node upload + Vectorize re-index — awaiting go.')
}
