import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  contentEntity,
  contentNodeLink,
  contentNodeLinkCandidate,
  contentNodeLinkHistory,
  dimDataslate,
} from './schema'
import { createTestTables } from './test-ddl'

const client = createClient({ url: ':memory:' })
const db = drizzle(client)

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  await client.execute('PRAGMA foreign_keys = ON')
  await createTestTables(client, {
    dimDataslate,
    contentEntity,
    contentNodeLink,
    contentNodeLinkHistory,
    contentNodeLinkCandidate,
  })
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

describe('contentNodeLink (single-row per brain_node_id)', () => {
  it('inserts one row per brain_node_id with the validation metadata', async () => {
    await db.insert(contentNodeLink).values({
      brainNodeId: 'node-1',
      canonicalId: 'ds-1',
      matchMethod: 'datasheet_id',
      validationMethod: 'auto-initial',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    const rows = await db
      .select()
      .from(contentNodeLink)
      .where(eq(contentNodeLink.brainNodeId, 'node-1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.canonicalId).toBe('ds-1')
    expect(rows[0]?.confidence).toBe(1)
  })

  it('PK on brain_node_id rejects a second row for the same brain_node', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-uq', type: 'datasheet', name: 'UQ', updatedAt: new Date() })
    await db.insert(contentNodeLink).values({
      brainNodeId: 'node-uq',
      canonicalId: 'ds-uq',
      matchMethod: 'datasheet_id',
      validationMethod: 'auto-initial',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    await expect(
      db.insert(contentNodeLink).values({
        brainNodeId: 'node-uq',
        canonicalId: 'ds-uq',
        matchMethod: 'datasheet_id',
        validationMethod: 'auto-initial',
        validatedBy: 'test',
        validatedAt: new Date(),
      }),
    ).rejects.toThrow()
  })

  it('rejects a canonical_id that does not exist', async () => {
    await expect(
      db.insert(contentNodeLink).values({
        brainNodeId: 'node-bad',
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
      brainNodeId: 'node-2',
      canonicalId: 'ds-2',
      matchMethod: 'name_faction',
      confidence: 0.8,
      validationMethod: 'admin',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    await db.delete(contentEntity).where(eq(contentEntity.id, 'ds-2'))
    const rows = await db
      .select()
      .from(contentNodeLink)
      .where(eq(contentNodeLink.brainNodeId, 'node-2'))
    expect(rows).toHaveLength(0)
  })

  it('re-key via UPDATE-in-place: existing row updated, audit history captures change', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-3a', type: 'datasheet', name: 'Bladeguard', updatedAt: new Date() })
    await db.insert(contentEntity).values({
      id: 'ds-3b',
      type: 'datasheet',
      name: 'Bladeguard (better)',
      updatedAt: new Date(),
    })
    // first-time link (also writes an auto-initial history row in real flow)
    await db.insert(contentNodeLink).values({
      brainNodeId: 'node-3',
      canonicalId: 'ds-3a',
      matchMethod: 'name_faction',
      validationMethod: 'auto-initial',
      validatedBy: 'test',
      validatedAt: new Date(),
    })

    // approve mutation: UPDATE in place + INSERT history. Order is irrelevant —
    // both can be in one transaction; the PK on brain_node_id and the absence
    // of any "active" partial index means there's no transient bad state.
    const now = new Date()
    await db
      .update(contentNodeLink)
      .set({
        canonicalId: 'ds-3b',
        matchMethod: 'manual',
        validationMethod: 'admin',
        validatedBy: 'test-admin',
        validatedAt: now,
      })
      .where(eq(contentNodeLink.brainNodeId, 'node-3'))
    await db.insert(contentNodeLinkHistory).values({
      historyId: 'hist-3',
      brainNodeId: 'node-3',
      priorCanonicalId: 'ds-3a',
      newCanonicalId: 'ds-3b',
      changedAt: now,
      changedBy: 'test-admin',
      changeMethod: 'admin',
    })

    const current = await db
      .select()
      .from(contentNodeLink)
      .where(eq(contentNodeLink.brainNodeId, 'node-3'))
    expect(current).toHaveLength(1)
    expect(current[0]?.canonicalId).toBe('ds-3b')
    expect(current[0]?.validationMethod).toBe('admin')

    const history = await db
      .select()
      .from(contentNodeLinkHistory)
      .where(eq(contentNodeLinkHistory.brainNodeId, 'node-3'))
    expect(history).toHaveLength(1)
    expect(history[0]?.priorCanonicalId).toBe('ds-3a')
    expect(history[0]?.newCanonicalId).toBe('ds-3b')
    expect(history[0]?.changeMethod).toBe('admin')
  })
})

describe('contentNodeLinkHistory (audit log)', () => {
  it('preserves text references even after the referenced entity is deleted (audit retention)', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-h-1', type: 'datasheet', name: 'H1', updatedAt: new Date() })
    await db.insert(contentNodeLinkHistory).values({
      historyId: 'hist-retention',
      brainNodeId: 'node-retention',
      priorCanonicalId: null,
      newCanonicalId: 'ds-h-1',
      changedAt: new Date(),
      changedBy: 'test',
      changeMethod: 'auto-initial',
    })
    // delete the entity the history row references — no FK, audit retained
    await db.delete(contentEntity).where(eq(contentEntity.id, 'ds-h-1'))
    const rows = await db
      .select()
      .from(contentNodeLinkHistory)
      .where(eq(contentNodeLinkHistory.historyId, 'hist-retention'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.newCanonicalId).toBe('ds-h-1')
  })
})

describe('contentNodeLinkCandidate', () => {
  it('queues a pending candidate with source/run_id split + prior_canonical_id snapshot', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-cand-1', type: 'datasheet', name: 'C1', updatedAt: new Date() })
    await db
      .insert(contentEntity)
      .values({ id: 'ds-cand-2', type: 'datasheet', name: 'C2', updatedAt: new Date() })
    await db.insert(contentNodeLink).values({
      brainNodeId: 'node-cand',
      canonicalId: 'ds-cand-1',
      matchMethod: 'datasheet_id',
      validationMethod: 'auto-initial',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'cnd-1',
      brainNodeId: 'node-cand',
      proposedCanonicalId: 'ds-cand-2',
      matchMethod: 'name_faction',
      confidence: 0.85,
      priorCanonicalId: 'ds-cand-1',
      source: 'sync:wahapedia',
      runId: '2026-05-30T03:00:00Z',
      proposedAt: new Date(),
    })
    const row = (
      await db
        .select()
        .from(contentNodeLinkCandidate)
        .where(eq(contentNodeLinkCandidate.candidateId, 'cnd-1'))
    )[0]
    expect(row?.status).toBe('pending')
    expect(row?.priorCanonicalId).toBe('ds-cand-1')
    expect(row?.source).toBe('sync:wahapedia')
    expect(row?.runId).toBe('2026-05-30T03:00:00Z')
    expect(row?.llmAttemptCount).toBe(0)
  })

  it('partial unique uq_candidate_pending blocks a second pending row for the same (brain_node, proposed) pair', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-cand-3', type: 'datasheet', name: 'C3', updatedAt: new Date() })
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'cnd-dup-a',
      brainNodeId: 'node-cand-dup',
      proposedCanonicalId: 'ds-cand-3',
      matchMethod: 'name_faction',
      source: 'sync:wahapedia',
      runId: 'run-a',
      proposedAt: new Date(),
    })
    await expect(
      db.insert(contentNodeLinkCandidate).values({
        candidateId: 'cnd-dup-b',
        brainNodeId: 'node-cand-dup',
        proposedCanonicalId: 'ds-cand-3',
        matchMethod: 'name_faction',
        source: 'sync:wahapedia',
        runId: 'run-b',
        proposedAt: new Date(),
      }),
    ).rejects.toThrow()
  })

  it('partial unique does NOT block a rejected + new pending for the same pair (history grows)', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-cand-4', type: 'datasheet', name: 'C4', updatedAt: new Date() })
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'cnd-rej-1',
      brainNodeId: 'node-cand-rej',
      proposedCanonicalId: 'ds-cand-4',
      matchMethod: 'name_faction',
      source: 'sync:wahapedia',
      runId: 'run-1',
      proposedAt: new Date(),
      status: 'rejected',
      decisionMethod: 'admin',
      decidedBy: 'test',
      decidedAt: new Date(),
    })
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'cnd-rej-2',
      brainNodeId: 'node-cand-rej',
      proposedCanonicalId: 'ds-cand-4',
      matchMethod: 'name_faction',
      source: 'sync:wahapedia',
      runId: 'run-2',
      proposedAt: new Date(),
    })
    const rows = await db
      .select()
      .from(contentNodeLinkCandidate)
      .where(eq(contentNodeLinkCandidate.brainNodeId, 'node-cand-rej'))
    expect(rows).toHaveLength(2)
  })

  it('cascades when the proposed_canonical_id entity is deleted', async () => {
    await db
      .insert(contentEntity)
      .values({ id: 'ds-cand-5', type: 'datasheet', name: 'C5', updatedAt: new Date() })
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'cnd-cascade',
      brainNodeId: 'node-cascade',
      proposedCanonicalId: 'ds-cand-5',
      matchMethod: 'manual',
      source: 'manual:test',
      runId: 'r1',
      proposedAt: new Date(),
    })
    await db.delete(contentEntity).where(eq(contentEntity.id, 'ds-cand-5'))
    const rows = await db
      .select()
      .from(contentNodeLinkCandidate)
      .where(eq(contentNodeLinkCandidate.candidateId, 'cnd-cascade'))
    expect(rows).toHaveLength(0)
  })
})
