/**
 * Ingest 40kdc-data mission cards into prod.
 *
 * Source: https://github.com/wn-mitch/40kdc-data (CC BY 4.0)
 * Local clone: C:/R/sync-data/tools/40kdc-data/
 *
 * Reads:
 *   data/core/missions.json            (25 primary missions, slim metadata)
 *   data/core/secondary-cards.json     (25 primary + 17 secondary, full awards[])
 *   data/core/mission-matchups.json    (25 disposition × disposition → primary)
 *
 * Writes:
 *   content_entity      (type='mission', one per card, English slug ids)
 *   scoring_mission     (one per card, ui_pattern derived from awards[])
 *   game_state          (one per distinct trigger fingerprint, deduped via key)
 *   mission_game_state  (one per award, linking scoring_mission → game_state + vp)
 *   brain node bundle   (R2: nodes/11e-40kdc-missions.json — full text + awards)
 *
 * Mission matchups are stored as a side-bundle (R2: data/40kdc-mission-matchups.json)
 * — no DB table for the lookup yet; that needs a schema migration of its own.
 *
 * Idempotent: re-runs upsert / re-overwrite. Source provenance recorded via
 * content_entity.wahapedia_id field (repurposed as generic source-id tag) and
 * brain node sources[].
 *
 * Usage: node scripts/40kdc-ingest/ingest-missions.mjs [--dry] [--wipe-existing]
 *   --dry              don't write to DB, just print stats
 *   --wipe-existing    DELETE the prior French-derived rows before ingesting
 *
 * Reads TURSO creds from repo-root .env.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@libsql/client'

const DATA_DIR = 'C:/R/sync-data/tools/40kdc-data/data/core'
const REPO_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\//, '').replace(/^([A-Za-z]):/, '$1:')
const BRAIN_OUT = `${REPO_ROOT}apps/brain/server/.local/brain/nodes`

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const wipeExisting = args.includes('--wipe-existing')

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = dry ? null : createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })

const missions = JSON.parse(readFileSync(`${DATA_DIR}/missions.json`, 'utf8'))
const cards = JSON.parse(readFileSync(`${DATA_DIR}/secondary-cards.json`, 'utf8'))
const matchups = JSON.parse(readFileSync(`${DATA_DIR}/mission-matchups.json`, 'utf8'))

// Index slim mission metadata by id for vp_per_game_cap lookup
const missionMetaById = new Map(missions.map((m) => [m.id, m]))

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Generate a deterministic game_state.key from an award's trigger/condition.
 * Two awards with the same shape produce the same key so game_state dedupes.
 */
function gameStateKey(award) {
  const t = award.trigger ?? {}
  const w = award.when ?? null
  const per = award.per ?? null
  const parts = [
    t.timing ?? 'any',
    t.phase ?? '',
    t.player_turn ?? '',
    t.battle_round
      ? `r${t.battle_round.min ?? ''}-${t.battle_round.max ?? ''}`
      : '',
    w ? w.type : '',
    w?.parameters ? JSON.stringify(w.parameters) : '',
    per ? `per:${per}` : '',
  ]
  return parts
    .filter(Boolean)
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9|:-]+/g, '-')
    .slice(0, 120)
}

/** Human-readable description of an award (used as game_state.label). */
function awardLabel(award) {
  const t = award.trigger ?? {}
  const w = award.when ?? null
  const phase = t.phase ? ` ${t.phase} phase` : ''
  const round = t.battle_round
    ? ` (rounds ${t.battle_round.min ?? 1}–${t.battle_round.max ?? 5})`
    : ''
  const turn = t.player_turn ? ` on ${t.player_turn}` : ''
  const trigger = `${t.timing ?? 'any'}${phase}${turn}${round}`
  const condition = w
    ? ` when ${w.type}${w.parameters ? ' (' + JSON.stringify(w.parameters) + ')' : ''}`
    : ''
  const award_value = award.vp
    ? `+${award.vp}vp`
    : award.vp_per
      ? `+${award.vp_per}vp per ${award.per ?? 'unit'}`
      : ''
  return `${trigger}${condition} → ${award_value}`.trim()
}

/** Derive game_state.category from condition shape. */
function categoryOf(award) {
  const w = award.when?.type ?? ''
  const per = award.per ?? ''
  if (w.includes('objective') || per.includes('objective')) return 'objective_control'
  if (w.includes('controls')) return 'objective_control'
  if (per.includes('destroyed') || per.includes('unit')) return 'unit_destroyed'
  if (per.includes('zone') || per.includes('territory')) return 'position'
  return 'misc'
}

/** Derive count_mode from per field. */
function countModeOf(award) {
  if (!award.per) return 'flag'
  if (award.per.includes('objective')) return 'per_objective'
  if (award.per.includes('unit') || award.per.includes('model')) return 'per_unit'
  return 'flag'
}

/** Derive ui_pattern for a whole card from its awards[]. */
function uiPatternOf(card) {
  const awards = card.awards ?? []
  if (awards.some((a) => a.vp_per)) return 'count'
  if (awards.length > 2) return 'tier'
  if (card.card_type === 'secondary') return 'action'
  return 'checklist'
}

// ── Step 1: wipe existing French rows ───────────────────────────────────

if (wipeExisting && !dry && db) {
  console.log('[wipe] removing French-derived missions')
  const before = await db.execute("SELECT COUNT(*) as c FROM scoring_mission")
  console.log(`  scoring_mission before: ${before.rows[0].c}`)
  await db.execute("DELETE FROM mission_game_state")
  await db.execute("DELETE FROM scoring_mission")
  await db.execute("DELETE FROM content_entity WHERE type='mission'")
  await db.execute("DELETE FROM game_state")
  console.log('  done: mission_game_state, scoring_mission, content_entity[mission], game_state cleared')
}

// ── Step 2: ingest 40kdc cards ──────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)
const stats = {
  content_entity: 0,
  scoring_mission: 0,
  game_state: new Set(),
  mission_game_state: 0,
  brain_nodes: 0,
}

// Dedupe game_state keys across cards
const seenStates = new Map() // key → stateId

const brainNodes = []

for (const card of cards) {
  const cardId = card.id
  const cap = missionMetaById.get(cardId)?.vp_per_game_cap ?? null

  if (!dry && db) {
    await db.execute({
      sql: `INSERT INTO content_entity (id, type, name, r2_key, wahapedia_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, r2_key=excluded.r2_key, updated_at=excluded.updated_at`,
      args: [cardId, 'mission', card.name, `nodes/11e-40kdc-missions.json`, `40kdc:${cardId}`, now],
    })
    await db.execute({
      sql: `INSERT INTO scoring_mission (id, name, kind, side, cap, ui_pattern)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, cap=excluded.cap, ui_pattern=excluded.ui_pattern`,
      args: [cardId, card.name, card.card_type, 'symmetric', cap, uiPatternOf(card)],
    })
  }
  stats.content_entity++
  stats.scoring_mission++

  const awards = card.awards ?? []
  for (let i = 0; i < awards.length; i++) {
    const award = awards[i]
    const key = gameStateKey(award)
    let stateId = seenStates.get(key)
    if (!stateId) {
      stateId = `gs-${key.replace(/\|/g, '_').replace(/[^a-z0-9_-]+/g, '-').slice(0, 100)}`
      seenStates.set(key, stateId)
      if (!dry && db) {
        await db.execute({
          sql: `INSERT INTO game_state (id, key, label, category)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO NOTHING`,
          args: [stateId, key, awardLabel(award), categoryOf(award)],
        })
      }
      stats.game_state.add(key)
    }
    const linkId = `${cardId}#${i}`
    const points = award.vp ?? award.vp_per ?? null
    if (!dry && db) {
      await db.execute({
        sql: `INSERT INTO mission_game_state (id, scoring_mission_id, game_state_id, points, count_mode, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET points=excluded.points, count_mode=excluded.count_mode, sort_order=excluded.sort_order`,
        args: [linkId, cardId, stateId, points, countModeOf(award), i],
      })
    }
    stats.mission_game_state++
  }

  // Brain node
  brainNodes.push({
    id: `11e-mission-${cardId}`,
    layer: 'rule',
    category: card.card_type === 'secondary' ? 'secondary-mission' : 'primary-mission',
    title: card.name,
    summary: card.text ? card.text.slice(0, 160) : `${card.card_type} mission card`,
    content: card.text ?? '',
    edition: '11th',
    keywords: [card.card_type, 'mission', card.name.toLowerCase()],
    sources: [
      {
        type: 'community-data',
        title: '40kdc-data',
        url: 'https://github.com/wn-mitch/40kdc-data',
        publishedAt: '2026',
        retrievedAt: new Date().toISOString().slice(0, 10),
      },
    ],
    awards,
    license: 'CC BY 4.0 · Alpaca Software + 40kdc community',
  })
  stats.brain_nodes++
}

// ── Step 3: write brain node bundle ─────────────────────────────────────

if (!dry) {
  mkdirSync(BRAIN_OUT, { recursive: true })
  writeFileSync(`${BRAIN_OUT}/11e-40kdc-missions.json`, JSON.stringify(brainNodes, null, 2))
  console.log(`[brain] wrote ${brainNodes.length} nodes → ${BRAIN_OUT}/11e-40kdc-missions.json`)

  // Mission matchups side-bundle (no DB table yet — store as R2 data file)
  const matchupBundle = {
    license: 'CC BY 4.0 · Alpaca Software + 40kdc community',
    source: 'https://github.com/wn-mitch/40kdc-data',
    edition: '11th',
    dataslate: 'launch',
    matchups: matchups.map((m) => ({
      id: m.id,
      yourDisposition: m.disposition,
      opponentDisposition: m.opponent_disposition,
      missionId: m.mission_id,
    })),
  }
  writeFileSync(`${BRAIN_OUT}/../11e-40kdc-mission-matchups.json`, JSON.stringify(matchupBundle, null, 2))
  console.log(`[matchups] wrote ${matchups.length} matchups → 11e-40kdc-mission-matchups.json`)
}

// ── Summary ─────────────────────────────────────────────────────────────

console.log(`\n${dry ? '[DRY] ' : ''}=== Ingest summary ===`)
console.log(`  content_entity:     ${stats.content_entity}`)
console.log(`  scoring_mission:    ${stats.scoring_mission}`)
console.log(`  game_state(distinct): ${stats.game_state.size}`)
console.log(`  mission_game_state: ${stats.mission_game_state}`)
console.log(`  brain nodes:        ${stats.brain_nodes}`)
console.log(`  matchups:           ${matchups.length}`)
