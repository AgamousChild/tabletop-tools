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
    wahapedia_id TEXT,
    bsdata_id TEXT,
    updated_at INTEGER NOT NULL
  )`)
  await client.execute(`CREATE TABLE content_node_link (
    link_id TEXT PRIMARY KEY NOT NULL,
    brain_node_id TEXT NOT NULL,
    canonical_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
    match_method TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1,
    prior_link_id TEXT REFERENCES content_node_link(link_id),
    validation_method TEXT NOT NULL,
    validated_by TEXT NOT NULL,
    validated_at INTEGER NOT NULL,
    superseded_at INTEGER
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

  it('stores wahapedia_id / bsdata_id provenance alongside the canonical id', async () => {
    await db.insert(contentEntity).values({
      id: 'bsdata-guid-abc',
      type: 'datasheet',
      name: 'Captain',
      wahapediaId: 'wahap-123',
      bsdataId: 'bsdata-guid-abc',
      updatedAt: new Date(),
    })
    const rows = await db
      .select()
      .from(contentEntity)
      .where(eq(contentEntity.id, 'bsdata-guid-abc'))
    expect(rows[0]?.wahapediaId).toBe('wahap-123')
    expect(rows[0]?.bsdataId).toBe('bsdata-guid-abc')
  })
})

describe('contentNodeLink', () => {
  it('crosswalks a brain node to a canonical entity as a chain head (no prior, active)', async () => {
    await db.insert(contentNodeLink).values({
      linkId: 'link-1',
      brainNodeId: 'node-1',
      canonicalId: 'ds-1',
      matchMethod: 'datasheet_id',
      validationMethod: 'auto-initial',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    const rows = await db.select().from(contentNodeLink).where(eq(contentNodeLink.linkId, 'link-1'))
    expect(rows[0]?.canonicalId).toBe('ds-1')
    expect(rows[0]?.confidence).toBe(1)
    expect(rows[0]?.priorLinkId).toBeNull()
    expect(rows[0]?.supersededAt).toBeNull()
  })

  it('rejects a canonical_id that does not exist', async () => {
    await expect(
      db.insert(contentNodeLink).values({
        linkId: 'link-bad',
        brainNodeId: 'node-x',
        canonicalId: 'missing',
        matchMethod: 'manual',
        validationMethod: 'admin',
        validatedBy: 'test',
        validatedAt: new Date(),
      }),
    ).rejects.toThrow()
  })

  it('cascades when the canonical entity is deleted', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-2', type: 'datasheet', name: 'Hellblasters', updatedAt: new Date() })
    await db.insert(contentNodeLink).values({
      linkId: 'link-2',
      brainNodeId: 'node-2',
      canonicalId: 'ds-2',
      matchMethod: 'name_faction',
      confidence: 0.8,
      validationMethod: 'admin',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    await db.delete(contentEntity).where(eq(contentEntity.id, 'ds-2'))
    const rows = await db.select().from(contentNodeLink).where(eq(contentNodeLink.linkId, 'link-2'))
    expect(rows).toHaveLength(0)
  })

  it('append-only re-key: new row references the prior link; original row preserved', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-3a', type: 'datasheet', name: 'Bladeguard', updatedAt: new Date() })
    await db.insert(contentEntity).values({
      id: 'ds-3b',
      type: 'datasheet',
      name: 'Bladeguard (better)',
      updatedAt: new Date(),
    })
    // original link
    await db.insert(contentNodeLink).values({
      linkId: 'link-3a',
      brainNodeId: 'node-3',
      canonicalId: 'ds-3a',
      matchMethod: 'name_faction',
      validationMethod: 'auto-initial',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    // a better match shows up; the new row references the prior and supersedes it
    const now = new Date()
    await db.insert(contentNodeLink).values({
      linkId: 'link-3b',
      brainNodeId: 'node-3',
      canonicalId: 'ds-3b',
      matchMethod: 'manual',
      priorLinkId: 'link-3a',
      validationMethod: 'admin',
      validatedBy: 'test',
      validatedAt: now,
    })
    // mark the prior as superseded
    await db
      .update(contentNodeLink)
      .set({ supersededAt: now })
      .where(eq(contentNodeLink.linkId, 'link-3a'))

    // both rows still exist
    const all = await db
      .select()
      .from(contentNodeLink)
      .where(eq(contentNodeLink.brainNodeId, 'node-3'))
    expect(all).toHaveLength(2)

    // new row points at prior
    const successor = all.find((r) => r.linkId === 'link-3b')
    expect(successor?.priorLinkId).toBe('link-3a')
    expect(successor?.supersededAt).toBeNull()

    // prior preserved but marked superseded
    const prior = all.find((r) => r.linkId === 'link-3a')
    expect(prior?.canonicalId).toBe('ds-3a')
    expect(prior?.supersededAt).not.toBeNull()
  })
})
