import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  comboId,
  type DetachmentWithDp,
  DP_BUDGET,
  enumerateLegalCombos,
  upsertCombos,
} from './meta-detachment-combos'

describe('comboId', () => {
  it('is order-independent — the same set always yields the same id', () => {
    const a = comboId('space-marines', [
      'space-marines:librarius-conclave',
      'space-marines:spearpoint-task-force',
    ])
    const b = comboId('space-marines', [
      'space-marines:spearpoint-task-force',
      'space-marines:librarius-conclave',
    ])
    expect(a).toBe(b)
    expect(a).toBe('space-marines:librarius-conclave+spearpoint-task-force')
  })

  it('dedupes a repeated member', () => {
    expect(comboId('orks', ['orks:war-horde', 'orks:war-horde'])).toBe('orks:war-horde')
  })

  it('handles a single detachment', () => {
    expect(comboId('drukhari', ['drukhari:reaper-s-wager'])).toBe('drukhari:reaper-s-wager')
  })
})

describe('enumerateLegalCombos', () => {
  // One faction with a 3pt, a 2pt and two 1pt detachments.
  const POOL: DetachmentWithDp[] = [
    { id: 'f:three', factionId: 'f', dp: 3 },
    { id: 'f:two', factionId: 'f', dp: 2 },
    { id: 'f:one-a', factionId: 'f', dp: 1 },
    { id: 'f:one-b', factionId: 'f', dp: 1 },
  ]

  it('enumerates exactly the builds the DP budget allows at Strike Force', () => {
    const ids = enumerateLegalCombos(POOL, DP_BUDGET.strikeForce)
      .map((c) => c.id)
      .sort()
    expect(ids).toEqual(
      [
        // singles (all cost <= 3)
        'f:three',
        'f:two',
        'f:one-a',
        'f:one-b',
        // 2 + 1
        'f:one-a+two',
        'f:one-b+two',
        // 1 + 1
        'f:one-a+one-b',
      ].sort(),
    )
  })

  it('never exceeds the budget', () => {
    for (const c of enumerateLegalCombos(POOL, DP_BUDGET.strikeForce)) {
      expect(c.totalDp!).toBeLessThanOrEqual(3)
    }
    // 3 + anything, and 2 + 1 + 1, are absent
    const ids = enumerateLegalCombos(POOL, DP_BUDGET.strikeForce).map((c) => c.id)
    expect(ids).not.toContain('f:three+two')
    expect(ids).not.toContain('f:one-a+one-b+two')
  })

  it('honours the tighter Incursion budget', () => {
    const ids = enumerateLegalCombos(POOL, DP_BUDGET.incursion).map((c) => c.id)
    expect(ids).toContain('f:two')
    expect(ids).toContain('f:one-a+one-b')
    // a 3pt detachment does not fit in a 2 DP budget at all
    expect(ids).not.toContain('f:three')
    expect(ids).not.toContain('f:one-a+two')
  })

  it('never mixes factions in one combo', () => {
    const combos = enumerateLegalCombos([
      { id: 'a:one', factionId: 'a', dp: 1 },
      { id: 'b:one', factionId: 'b', dp: 1 },
    ])
    expect(combos.map((c) => c.id).sort()).toEqual(['a:one', 'b:one'])
  })

  it('skips detachments with no dp rather than guessing they are legal', () => {
    const combos = enumerateLegalCombos([
      { id: 'f:known', factionId: 'f', dp: 1 },
      { id: 'f:legacy', factionId: 'f', dp: null },
    ])
    expect(combos.map((c) => c.id)).toEqual(['f:known'])
  })
})

describe('upsertCombos', () => {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)

  beforeAll(async () => {
    await applyTestSchema(client)
    await seedReferenceDims(client)
    await client.executeMultiple(`
      INSERT INTO dim_faction VALUES ('f', 'Faction F', 'imperium');
      INSERT INTO dim_detachment (id, name, faction_id, subfaction_id, dp) VALUES
        ('f:one-a', 'One A', 'f', NULL, 1),
        ('f:one-b', 'One B', 'f', NULL, 1);
    `)
  })

  afterAll(() => client.close())

  it('writes combos and their membership, and is idempotent', async () => {
    const combos = enumerateLegalCombos([
      { id: 'f:one-a', factionId: 'f', dp: 1 },
      { id: 'f:one-b', factionId: 'f', dp: 1 },
    ])

    const first = await upsertCombos(db, combos, true)
    expect(first.combos).toBe(3) // one-a, one-b, one-a+one-b

    await upsertCombos(db, combos, true)

    const rows = (await db.all(
      sql`SELECT id, member_count, total_dp, is_legal FROM dim_detachment_combo ORDER BY id`,
    )) as unknown as Array<{
      id: string
      member_count: number
      total_dp: number
      is_legal: number
    }>
    expect(rows).toHaveLength(3)
    const pair = rows.find((r) => r.id === 'f:one-a+one-b')!
    expect(pair.member_count).toBe(2)
    expect(pair.total_dp).toBe(2)
    expect(pair.is_legal).toBe(1)

    const members = (await db.all(
      sql`SELECT detachment_id FROM dim_detachment_combo_member WHERE combo_id = 'f:one-a+one-b' ORDER BY detachment_id`,
    )) as unknown as Array<{ detachment_id: string }>
    expect(members.map((m) => m.detachment_id)).toEqual(['f:one-a', 'f:one-b'])
  })

  it('does not downgrade an enumerated legal combo when the same id is later seen as observed', async () => {
    await upsertCombos(
      db,
      [
        {
          id: 'f:one-a+one-b',
          factionId: 'f',
          memberIds: ['f:one-a', 'f:one-b'],
          memberCount: 2,
          totalDp: 2,
        },
      ],
      false,
    )
    const row = (await db.all(
      sql`SELECT is_legal FROM dim_detachment_combo WHERE id = 'f:one-a+one-b'`,
    )) as unknown as Array<{ is_legal: number }>
    expect(row[0]!.is_legal).toBe(1)
  })
})
