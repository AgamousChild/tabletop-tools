/**
 * Ingest the translated missions into the game-tracker data source.
 *
 * For each primary/secondary in reference.json, upsert (idempotent):
 *   - content_entity (type='mission')        — the canonical entity
 *   - scoring_mission (id = content id)       — the game-tracker projection
 *   - game_state                              — canonical facts (one per distinct scoring condition, shared/deduped)
 *   - mission_game_state                      — links a mission to its game states + declared points
 *
 * Usage: node scripts/11th-ingest/ingest-game-tracker.mjs <reference.json> [--dry]
 * Reads TURSO creds from the repo-root .env.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

function categoryOf(cond) {
  const c = cond.toLowerCase()
  if (/more .*than your opponent|than (friendly|enemy)|comparative/.test(c)) return 'comparative'
  if (/destroyed|destroy/.test(c)) return 'unit_destroyed'
  if (/control|objective/.test(c)) return 'objective_control'
  if (/within|centre|center|quarter|zone|deployment|territory/.test(c)) return 'position'
  if (/purif|sabotage|secure|action|operation marker|surveil/.test(c)) return 'action_completed'
  return 'misc'
}
function countModeOf(cond) {
  const c = cond.toLowerCase()
  if (/for each .*(objective|marker)/.test(c)) return 'per_objective'
  if (/for each .*(unit|model)/.test(c)) return 'per_unit'
  return 'flag'
}
function uiPatternOf(card) {
  if (card.action) return 'action'
  const conds = (card.scoring || []).map((s) => s.condition.toLowerCase())
  if (conds.some((c) => /for each/.test(c))) return 'count'
  if ((card.scoring || []).length > 1) return 'tier'
  return 'checklist'
}

export async function ingestGameTracker({ refPath, db, dry = false }) {
  const data = JSON.parse(readFileSync(refPath, 'utf8'))
  const missions = data.cards.filter((c) => c.kind === 'primary' || c.kind === 'secondary')
  const stats = { content: 0, scoring: 0, states: 0, links: 0, distinctStates: new Set() }
  const now = Math.floor(Date.now() / 1000)

  for (const m of missions) {
    if (!dry) {
      await db.execute({
        sql: `INSERT INTO content_entity (id,type,name,updated_at) VALUES (?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
        args: [m.id, 'mission', m.title_en, now],
      })
      await db.execute({
        sql: `INSERT INTO scoring_mission (id,name,kind,side,cap,ui_pattern) VALUES (?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, ui_pattern=excluded.ui_pattern`,
        args: [m.id, m.title_en, m.kind, m.subtype === 'attacker' || m.subtype === 'defender' ? m.subtype : 'symmetric', null, uiPatternOf(m)],
      })
    }
    stats.content++
    stats.scoring++

    const lines = m.scoring || []
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i]
      const key = slug(s.condition)
      stats.distinctStates.add(key)
      const stateId = `gs-${key}`
      const linkId = `${m.id}#${i}`
      if (!dry) {
        await db.execute({
          sql: `INSERT INTO game_state (id,key,label,category) VALUES (?,?,?,?)
                ON CONFLICT(key) DO NOTHING`,
          args: [stateId, key, s.condition, categoryOf(s.condition)],
        })
        await db.execute({
          sql: `INSERT INTO mission_game_state (id,scoring_mission_id,game_state_id,points,count_mode,sort_order) VALUES (?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET points=excluded.points, count_mode=excluded.count_mode, sort_order=excluded.sort_order`,
          args: [linkId, m.id, stateId, s.vp ?? null, countModeOf(s.condition), i],
        })
      }
      stats.states++
      stats.links++
    }
  }
  return { missions: missions.length, ...stats, distinctStates: stats.distinctStates.size }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/ingest-game-tracker.mjs')) {
  const refPath = process.argv[2]
  const dry = process.argv.includes('--dry')
  const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
  const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })
  const res = await ingestGameTracker({ refPath, db, dry })
  console.log(`${dry ? '[dry] ' : ''}missions=${res.missions} content_entity=${res.content} scoring_mission=${res.scoring} game_state(distinct)=${res.distinctStates} mission_game_state=${res.links}`)
}
