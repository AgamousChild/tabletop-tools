import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { contentEntity, contentNodeLink } from './schema'

const client = createClient({ url: ':memory:' })
const db = drizzle(client)

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute(`CREATE TABLE dim_dataslate (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    effective_date INTEGER NOT NULL,
    end_date INTEGER
  )`)
  await client.execute(`CREATE TABLE content_entity (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    faction_id TEXT REFERENCES content_entity(id),
    parent_id TEXT REFERENCES content_entity(id),
    dataslate_id TEXT REFERENCES dim_dataslate(id),
    r2_key TEXT,
    updated_at INTEGER NOT NULL
  )`)
  await client.execute(`CREATE TABLE content_node_link (
    brain_node_id TEXT PRIMARY KEY NOT NULL,
    canonical_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
    match_method TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1
  )`)
})

describe('contentEntity', () => {
  it('stores a faction (no parent/faction self-ref)', async () => {
    await db.insert(contentEntity).values({
      id: 'space-marines',
      type: 'faction',
      name: 'Space Marines',
      updatedAt: new Date(),
    })
    const rows = await db.select().from(contentEntity).where(eq(contentEntity.id, 'space-marines'))
    expect(rows[0]?.type).toBe('faction')
  })

  it('links datasheet → faction and weapon → datasheet via self-ref FKs', async () => {
    await db.insert(contentEntity).values({
      id: 'ds-1',
      type: 'datasheet',
      name: 'Intercessors',
      factionId: 'space-marines',
      updatedAt: new Date(),
    })
    await db.insert(contentEntity).values({
      id: 'weapon:ds-1:bolt-rifle',
      type: 'weapon',
      name: 'Bolt Rifle',
      parentId: 'ds-1',
      updatedAt: new Date(),
    })
    const w = await db
      .select()
      .from(contentEntity)
      .where(eq(contentEntity.id, 'weapon:ds-1:bolt-rifle'))
    expect(w[0]?.parentId).toBe('ds-1')
  })

  it('rejects a parent_id that does not exist', async () => {
    await expect(
      db.insert(contentEntity).values({
        id: 'orphan',
        type: 'datasheet',
        name: 'X',
        parentId: 'nope',
        updatedAt: new Date(),
      }),
    ).rejects.toThrow()
  })
})

describe('contentNodeLink', () => {
  it('crosswalks a brain node to a canonical entity (default confidence 1)', async () => {
    await db
      .insert(contentNodeLink)
      .values({ brainNodeId: 'node-1', canonicalId: 'ds-1', matchMethod: 'datasheet_id' })
    const rows = await db
      .select()
      .from(contentNodeLink)
      .where(eq(contentNodeLink.brainNodeId, 'node-1'))
    expect(rows[0]?.canonicalId).toBe('ds-1')
    expect(rows[0]?.confidence).toBe(1)
  })

  it('rejects a canonical_id that does not exist', async () => {
    await expect(
      db
        .insert(contentNodeLink)
        .values({ brainNodeId: 'node-x', canonicalId: 'missing', matchMethod: 'manual' }),
    ).rejects.toThrow()
  })

  it('cascades when the canonical entity is deleted', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-2', type: 'datasheet', name: 'Hellblasters', updatedAt: new Date() })
    await db.insert(contentNodeLink).values({
      brainNodeId: 'node-2',
      canonicalId: 'ds-2',
      matchMethod: 'name_faction',
      confidence: 0.8,
    })
    await db.delete(contentEntity).where(eq(contentEntity.id, 'ds-2'))
    const rows = await db
      .select()
      .from(contentNodeLink)
      .where(eq(contentNodeLink.brainNodeId, 'node-2'))
    expect(rows).toHaveLength(0)
  })
})
