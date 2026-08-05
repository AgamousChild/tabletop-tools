import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { beforeEach, describe, expect, it } from 'vitest'

import { formatVerification, verifyCube } from './meta-cube-verify'

let client: ReturnType<typeof createClient>
let db: ReturnType<typeof createDbFromClient>

const EVENT = 'ev1'

async function seedEvent() {
  await client.execute({
    sql: `INSERT INTO dim_faction VALUES (?, ?, ?)`,
    args: ['sm', 'Space Marines', 'imperium'],
  })
  await client.execute({
    sql: `INSERT INTO meta_events
            (id, name, date, location, region_id, format, rounds, player_count,
             source, source_id, imported_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      EVENT,
      'Test GT',
      1760000000000,
      'London',
      null,
      'GT',
      5,
      2,
      'bcp',
      'src1',
      1760000000000,
    ],
  })
  for (const p of ['p1', 'p2']) {
    await client.execute({
      sql: `INSERT INTO meta_event_players
              (id, event_id, player_name, faction_id, placement, wins, losses, draws)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [p, EVENT, p, 'sm', 1, 1, 0, 0],
    })
  }
  await client.execute({
    sql: `INSERT INTO meta_pairings (id, event_id, round, player1_id, player2_id, result)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['pair1', EVENT, 1, 'p1', 'p2', 'p1'],
  })
}

async function insertFact(opts: {
  id: string
  pairingId: string | null
  playerId: string
  opponentId: string
  round?: number
  comboId?: string | null
}) {
  await client.execute({
    sql: `INSERT INTO fact_game_results
            (id, pairing_id, event_id, player_id, opponent_id, round,
             faction_id, opponent_faction_id, result, combo_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      opts.id,
      opts.pairingId,
      EVENT,
      opts.playerId,
      opts.opponentId,
      opts.round ?? 1,
      'sm',
      'sm',
      1.0,
      opts.comboId ?? null,
    ],
  })
}

/** The state a correct build leaves: two fact rows for the one pairing. */
async function seedHealthyFacts() {
  await insertFact({ id: 'f1', pairingId: 'pair1', playerId: 'p1', opponentId: 'p2' })
  await insertFact({ id: 'f2', pairingId: 'pair1', playerId: 'p2', opponentId: 'p1' })
}

function check(v: Awaited<ReturnType<typeof verifyCube>>, name: string) {
  const c = v.checks.find((x) => x.name === name)
  if (!c) throw new Error(`no check named ${name}`)
  return c
}

beforeEach(async () => {
  client = createClient({ url: ':memory:' })
  db = createDbFromClient(client)
  await applyTestSchema(client)
  await seedReferenceDims(client)
  await seedEvent()
})

describe('verifyCube', () => {
  it('passes on a correctly built cube', async () => {
    await seedHealthyFacts()
    const v = await verifyCube(db)
    expect(v.ok).toBe(true)
    expect(v.checks.every((c) => c.ok)).toBe(true)
  })

  it('catches a NULL pairing_id, which the unique index lets through', async () => {
    // SQLite treats NULLs as distinct, so uq_fact_game_results_pairing_player
    // does NOT reject these. This is how stale pre-pairing_id rows hid inside
    // an otherwise clean rebuild.
    await insertFact({ id: 'f1', pairingId: null, playerId: 'p1', opponentId: 'p2' })
    await insertFact({ id: 'f2', pairingId: null, playerId: 'p2', opponentId: 'p1' })

    const v = await verifyCube(db)
    expect(v.ok).toBe(false)
    expect(check(v, 'every fact row has a pairing').ok).toBe(false)
    expect(check(v, 'every fact row has a pairing').detail).toContain('2')
  })

  it('catches duplicated games', async () => {
    await seedHealthyFacts()
    // Same game recorded under a second pairing: same players, same round. That
    // sneaks past the unique index because the pairing differs, but it is the
    // same game and would be counted twice.
    await client.execute({
      sql: `INSERT INTO meta_pairings (id, event_id, round, player1_id, player2_id, result)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['pair-dup', EVENT, 1, 'p1', 'p2', 'p1'],
    })
    await insertFact({ id: 'f3', pairingId: 'pair-dup', playerId: 'p1', opponentId: 'p2' })
    await insertFact({ id: 'f4', pairingId: 'pair-dup', playerId: 'p2', opponentId: 'p1' })

    const v = await verifyCube(db)
    expect(v.ok).toBe(false)
    expect(check(v, 'no duplicate games').ok).toBe(false)
  })

  it('catches an event whose facts do not cover its pairings', async () => {
    // Only one of the two rows for the pairing — a build interrupted mid-event.
    await insertFact({ id: 'f1', pairingId: 'pair1', playerId: 'p1', opponentId: 'p2' })

    const v = await verifyCube(db)
    expect(v.ok).toBe(false)
    expect(check(v, 'fact rows are twice the pairings, per event').ok).toBe(false)
  })

  it('catches a rollup pointing at a frame that no longer exists', async () => {
    await seedHealthyFacts()
    // As with the dangling combo: Turso does not enforce foreign keys, so a
    // rollup can outlive the frame it points at. That is the case being caught.
    await client.execute(`PRAGMA foreign_keys = OFF`)
    await client.execute({
      sql: `INSERT INTO meta_top
              (id, granularity_id, faction_id, meta_for_id, win_rate, draw_rate, over_rep,
               four_oh_start, player_pop_pct, wins, losses, draws, games, players)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['t1', 1, 'sm', 'frame-that-vanished', 0.6, 0, 1, 0, 100, 3, 2, 0, 5, 1],
    })

    const v = await verifyCube(db)
    expect(v.ok).toBe(false)
    expect(check(v, 'no rollups point at missing frames').ok).toBe(false)
  })

  it('catches a fact pointing at a combo that no longer exists', async () => {
    // Turso does not enforce foreign keys by default, which is exactly how a
    // dangling reference survives in production. Reproduce that here.
    await client.execute(`PRAGMA foreign_keys = OFF`)
    await insertFact({
      id: 'f1',
      pairingId: 'pair1',
      playerId: 'p1',
      opponentId: 'p2',
      comboId: 'combo-gone',
    })
    await insertFact({ id: 'f2', pairingId: 'pair1', playerId: 'p2', opponentId: 'p1' })

    const v = await verifyCube(db)
    expect(v.ok).toBe(false)
    expect(check(v, 'no facts point at missing combos').ok).toBe(false)
  })
})

describe('formatVerification', () => {
  it('leads with the overall verdict and marks each check', async () => {
    await seedHealthyFacts()
    const out = formatVerification(await verifyCube(db))
    expect(out.split('\n')[0]).toBe('cube verification: PASS')
    expect(out).toContain('PASS  no duplicate games')
  })

  it('reports FAIL when any check fails', async () => {
    await insertFact({ id: 'f1', pairingId: null, playerId: 'p1', opponentId: 'p2' })
    const out = formatVerification(await verifyCube(db))
    expect(out.split('\n')[0]).toBe('cube verification: FAIL')
    expect(out).toContain('FAIL  every fact row has a pairing')
  })
})
