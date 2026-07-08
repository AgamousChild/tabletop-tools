import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDbFromClient } from './client'
import { battleSize, battleSizeAlias } from './schema'
import {
  BATTLE_SIZES,
  battleSizeForPoints,
  getAllBattleSizes,
  resolveBattleSize,
  seedBattleSizes,
} from './seed-battle-size'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute(`CREATE TABLE battle_size (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    points INTEGER NOT NULL,
    max_duplicates INTEGER NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`)
  await client.execute(`CREATE TABLE battle_size_alias (
    alias TEXT PRIMARY KEY NOT NULL,
    battle_size_id TEXT NOT NULL REFERENCES battle_size(id) ON DELETE CASCADE
  )`)
  await client.execute(
    'CREATE INDEX idx_battle_size_alias_battle_size ON battle_size_alias (battle_size_id)',
  )
})

describe('battleSize schema', () => {
  it('stores a row with all columns', async () => {
    await db.insert(battleSize).values({
      id: 'test-row',
      name: 'Test Bracket',
      points: 750,
      maxDuplicates: 1,
      description: 'A test bracket',
      sortOrder: 99,
    })
    const rows = await db.select().from(battleSize).where(eq(battleSize.id, 'test-row'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'test-row',
      name: 'Test Bracket',
      points: 750,
      maxDuplicates: 1,
      description: 'A test bracket',
      sortOrder: 99,
    })
    await db.delete(battleSize).where(eq(battleSize.id, 'test-row'))
  })

  it('rejects a battle_size_alias referencing a nonexistent battle_size', async () => {
    await expect(
      db.insert(battleSizeAlias).values({ alias: 'Nope', battleSizeId: 'does-not-exist' }),
    ).rejects.toThrow()
  })

  it('cascades battle_size_alias deletes when the parent battle_size is deleted', async () => {
    await db.insert(battleSize).values({
      id: 'cascade-test',
      name: 'Cascade Test',
      points: 100,
      maxDuplicates: 1,
      sortOrder: 0,
    })
    await db.insert(battleSizeAlias).values({ alias: 'CT Alias', battleSizeId: 'cascade-test' })
    await db.delete(battleSize).where(eq(battleSize.id, 'cascade-test'))
    const rows = await db
      .select()
      .from(battleSizeAlias)
      .where(eq(battleSizeAlias.alias, 'CT Alias'))
    expect(rows).toHaveLength(0)
  })
})

describe('seedBattleSizes / getAllBattleSizes round-trip', () => {
  it('seeds all four canonical brackets', async () => {
    await seedBattleSizes(db)
    const rows = await getAllBattleSizes(db)
    expect(rows).toHaveLength(4)
  })

  it('is idempotent — re-seeding does not duplicate or overwrite rows', async () => {
    await seedBattleSizes(db)
    await seedBattleSizes(db)
    const rows = await getAllBattleSizes(db)
    expect(rows).toHaveLength(4)
  })

  it('seeds the canonical bcp-scraper-convention mapping (Combat Patrol 500 / Incursion 1000 / Strike Force 2000 / Onslaught 3000)', async () => {
    const rows = await getAllBattleSizes(db)
    const byName = new Map(rows.map((r) => [r.name, r.points]))
    expect(byName.get('Combat Patrol')).toBe(500)
    expect(byName.get('Incursion')).toBe(1000)
    expect(byName.get('Strike Force')).toBe(2000)
    expect(byName.get('Onslaught')).toBe(3000)
  })

  it('returns rows ordered by sortOrder', async () => {
    const rows = await getAllBattleSizes(db)
    const sortOrders = rows.map((r) => r.sortOrder)
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b))
  })

  it('BATTLE_SIZES constant has exactly 4 rows with unique ids', async () => {
    expect(BATTLE_SIZES).toHaveLength(4)
    const ids = new Set(BATTLE_SIZES.map((r) => r.id))
    expect(ids.size).toBe(4)
  })
})

describe('resolveBattleSize', () => {
  it('resolves by canonical id', async () => {
    const row = await resolveBattleSize(db, 'strike-force')
    expect(row?.name).toBe('Strike Force')
    expect(row?.points).toBe(2000)
  })

  it('resolves by canonical name', async () => {
    const row = await resolveBattleSize(db, 'Onslaught')
    expect(row?.points).toBe(3000)
  })

  it('resolves via an alias row', async () => {
    await db.insert(battleSizeAlias).values({ alias: 'CP', battleSizeId: 'combat-patrol' })
    const row = await resolveBattleSize(db, 'CP')
    expect(row?.name).toBe('Combat Patrol')
    expect(row?.points).toBe(500)
  })

  it('returns null for an unknown reference', async () => {
    const row = await resolveBattleSize(db, 'not-a-real-battle-size')
    expect(row).toBeNull()
  })
})

describe('battleSizeForPoints', () => {
  it('maps a points total to the smallest bracket that fits', async () => {
    expect((await battleSizeForPoints(db, 500))?.name).toBe('Combat Patrol')
    expect((await battleSizeForPoints(db, 750))?.name).toBe('Incursion')
    expect((await battleSizeForPoints(db, 1000))?.name).toBe('Incursion')
    expect((await battleSizeForPoints(db, 1500))?.name).toBe('Strike Force')
    expect((await battleSizeForPoints(db, 2000))?.name).toBe('Strike Force')
  })

  it('falls back to the largest bracket for totals above every cap', async () => {
    const row = await battleSizeForPoints(db, 5000)
    expect(row?.name).toBe('Onslaught')
  })
})
