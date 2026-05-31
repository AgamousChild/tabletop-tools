import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createClient } from '@libsql/client'
import {
  contentEntity,
  contentNodeLink,
  contentNodeLinkCandidate,
  contentNodeLinkHistory,
  createDbFromClient,
} from '@tabletop-tools/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

// libsql client's db.transaction() spawns a new connection. With `:memory:` the
// new connection sees an empty DB (per-connection isolation), so transactions
// fail with "no such table". Use a temp file so all connections share state.
const dbPath = join(
  tmpdir(),
  `crosswalk-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
)
const client = createClient({ url: `file:${dbPath}` })
const db = createDbFromClient(client)

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')

const adminCtx = {
  user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin' },
  req,
  db,
  adminEmails: ['admin@test.com'],
}
const nonAdminCtx = {
  user: { id: 'user-1', email: 'user@test.com', name: 'User' },
  req,
  db,
  adminEmails: ['admin@test.com'],
}
const unauthCtx = {
  user: null,
  req,
  db,
  adminEmails: ['admin@test.com'],
}

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
    brain_node_id TEXT PRIMARY KEY NOT NULL,
    canonical_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
    match_method TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1,
    validation_method TEXT NOT NULL,
    validated_by TEXT NOT NULL,
    validated_at INTEGER NOT NULL
  )`)
  await client.execute(`CREATE TABLE content_node_link_history (
    history_id TEXT PRIMARY KEY NOT NULL,
    brain_node_id TEXT NOT NULL,
    prior_canonical_id TEXT,
    new_canonical_id TEXT NOT NULL,
    changed_at INTEGER NOT NULL,
    changed_by TEXT NOT NULL,
    change_method TEXT NOT NULL,
    change_reason TEXT,
    candidate_id TEXT
  )`)
  await client.execute(`CREATE TABLE content_node_link_candidate (
    candidate_id TEXT PRIMARY KEY NOT NULL,
    brain_node_id TEXT NOT NULL,
    proposed_canonical_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
    match_method TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1,
    prior_canonical_id TEXT,
    source TEXT NOT NULL,
    run_id TEXT NOT NULL,
    proposed_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decision_method TEXT,
    decided_by TEXT,
    decided_at INTEGER,
    decision_reason TEXT,
    resulting_history_id TEXT,
    llm_attempt_count INTEGER NOT NULL DEFAULT 0,
    llm_last_attempted_at INTEGER
  )`)
  await client.execute(`CREATE UNIQUE INDEX uq_candidate_pending
    ON content_node_link_candidate (brain_node_id, proposed_canonical_id)
    WHERE status = 'pending'`)
})

afterAll(() => {
  client.close()
  try {
    unlinkSync(dbPath)
  } catch {
    /* file may already be gone */
  }
})

beforeEach(async () => {
  // Clean slate per test (file-based DB persists rows otherwise).
  await client.execute('DELETE FROM content_node_link_history')
  await client.execute('DELETE FROM content_node_link_candidate')
  await client.execute('DELETE FROM content_node_link')
  await client.execute('DELETE FROM content_entity')
})

async function seedEntities() {
  await db.insert(contentEntity).values([
    { id: 'ds-a', type: 'datasheet', name: 'A', updatedAt: new Date() },
    { id: 'ds-b', type: 'datasheet', name: 'B', updatedAt: new Date() },
  ])
}

describe('crosswalk router — access control', () => {
  it('rejects unauthenticated requests', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.crosswalk.listPending()).rejects.toThrow(/UNAUTHORIZED/)
  })

  it('rejects non-admin authenticated requests', async () => {
    const caller = createCaller(nonAdminCtx)
    await expect(caller.crosswalk.listPending()).rejects.toThrow(/Admin access required/)
  })

  it('allows admin requests', async () => {
    const caller = createCaller(adminCtx)
    const result = await caller.crosswalk.listPending()
    expect(result.total).toBe(0)
    expect(result.items).toEqual([])
  })
})

describe('crosswalk router — listPending', () => {
  it('paginates and filters by source', async () => {
    await seedEntities()
    const proposedAt = new Date()
    await db.insert(contentNodeLinkCandidate).values([
      {
        candidateId: 'c1',
        brainNodeId: 'n1',
        proposedCanonicalId: 'ds-a',
        matchMethod: 'name_faction',
        source: 'sync:wahapedia',
        runId: 'r1',
        proposedAt,
      },
      {
        candidateId: 'c2',
        brainNodeId: 'n2',
        proposedCanonicalId: 'ds-b',
        matchMethod: 'manual',
        source: '11th-ingest',
        runId: 'r1',
        proposedAt,
      },
    ])

    const caller = createCaller(adminCtx)
    const all = await caller.crosswalk.listPending()
    expect(all.total).toBe(2)

    const sm = await caller.crosswalk.listPending({ source: 'sync:wahapedia' })
    expect(sm.total).toBe(1)
    expect(sm.items[0]?.candidateId).toBe('c1')
  })
})

describe('crosswalk router — candidate.byId', () => {
  it('returns full context including current link and proposed entity', async () => {
    await seedEntities()
    await db.insert(contentNodeLink).values({
      brainNodeId: 'n-detail',
      canonicalId: 'ds-a',
      matchMethod: 'datasheet_id',
      validationMethod: 'auto-initial',
      validatedBy: 'test',
      validatedAt: new Date(),
    })
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-detail',
      brainNodeId: 'n-detail',
      proposedCanonicalId: 'ds-b',
      matchMethod: 'name_faction',
      confidence: 0.85,
      priorCanonicalId: 'ds-a',
      source: 'sync:wahapedia',
      runId: 'r1',
      proposedAt: new Date(),
    })

    const caller = createCaller(adminCtx)
    const { candidate, currentLink, currentEntity, proposedEntity } =
      await caller.crosswalk.candidate.byId({ candidateId: 'c-detail' })

    expect(candidate.candidateId).toBe('c-detail')
    expect(currentLink?.canonicalId).toBe('ds-a')
    expect(currentEntity?.name).toBe('A')
    expect(proposedEntity?.name).toBe('B')
  })

  it('throws NOT_FOUND on unknown candidate', async () => {
    const caller = createCaller(adminCtx)
    await expect(caller.crosswalk.candidate.byId({ candidateId: 'missing' })).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('crosswalk router — candidate.approve', () => {
  it('UPDATE existing link + INSERT history + UPDATE candidate (all three writes)', async () => {
    await seedEntities()
    await db.insert(contentNodeLink).values({
      brainNodeId: 'n-app',
      canonicalId: 'ds-a',
      matchMethod: 'datasheet_id',
      validationMethod: 'auto-initial',
      validatedBy: '11th-ingest',
      validatedAt: new Date(),
    })
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-app',
      brainNodeId: 'n-app',
      proposedCanonicalId: 'ds-b',
      matchMethod: 'manual',
      confidence: 0.95,
      priorCanonicalId: 'ds-a',
      source: 'sync:wahapedia',
      runId: 'r1',
      proposedAt: new Date(),
    })

    const caller = createCaller(adminCtx)
    const { ok, historyId } = await caller.crosswalk.candidate.approve({
      candidateId: 'c-app',
      note: 'looks right',
    })
    expect(ok).toBe(true)
    expect(historyId).toBeTruthy()

    // link updated
    const link = (
      await db.select().from(contentNodeLink).where(eq(contentNodeLink.brainNodeId, 'n-app'))
    )[0]
    expect(link?.canonicalId).toBe('ds-b')
    expect(link?.validationMethod).toBe('admin')
    expect(link?.validatedBy).toBe('admin@test.com')

    // history row written
    const histories = await db
      .select()
      .from(contentNodeLinkHistory)
      .where(eq(contentNodeLinkHistory.brainNodeId, 'n-app'))
    expect(histories).toHaveLength(1)
    expect(histories[0]?.priorCanonicalId).toBe('ds-a')
    expect(histories[0]?.newCanonicalId).toBe('ds-b')
    expect(histories[0]?.changeMethod).toBe('admin')
    expect(histories[0]?.candidateId).toBe('c-app')

    // candidate marked approved
    const cand = (
      await db
        .select()
        .from(contentNodeLinkCandidate)
        .where(eq(contentNodeLinkCandidate.candidateId, 'c-app'))
    )[0]
    expect(cand?.status).toBe('approved')
    expect(cand?.decidedBy).toBe('admin@test.com')
    expect(cand?.resultingHistoryId).toBe(historyId)
  })

  it('first-time link path: INSERT (not UPDATE) when no current link exists', async () => {
    await seedEntities()
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-first',
      brainNodeId: 'n-first',
      proposedCanonicalId: 'ds-a',
      matchMethod: 'manual',
      source: 'manual',
      runId: 'r1',
      proposedAt: new Date(),
    })
    const caller = createCaller(adminCtx)
    await caller.crosswalk.candidate.approve({ candidateId: 'c-first' })

    const link = (
      await db.select().from(contentNodeLink).where(eq(contentNodeLink.brainNodeId, 'n-first'))
    )[0]
    expect(link?.canonicalId).toBe('ds-a')

    const histories = await db
      .select()
      .from(contentNodeLinkHistory)
      .where(eq(contentNodeLinkHistory.brainNodeId, 'n-first'))
    expect(histories).toHaveLength(1)
    expect(histories[0]?.priorCanonicalId).toBeNull()
  })

  it('CONFLICT on already-approved candidate', async () => {
    await seedEntities()
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-done',
      brainNodeId: 'n-done',
      proposedCanonicalId: 'ds-a',
      matchMethod: 'manual',
      source: 'manual',
      runId: 'r1',
      proposedAt: new Date(),
      status: 'approved',
      decisionMethod: 'admin',
      decidedBy: 'admin@test.com',
      decidedAt: new Date(),
    })
    const caller = createCaller(adminCtx)
    await expect(caller.crosswalk.candidate.approve({ candidateId: 'c-done' })).rejects.toThrow(
      /cannot approve/i,
    )
  })
})

describe('crosswalk router — candidate.reject', () => {
  it('happy path: sets status=rejected with audit fields', async () => {
    await seedEntities()
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-rej',
      brainNodeId: 'n-rej',
      proposedCanonicalId: 'ds-a',
      matchMethod: 'manual',
      source: 'manual',
      runId: 'r1',
      proposedAt: new Date(),
    })
    const caller = createCaller(adminCtx)
    const res = await caller.crosswalk.candidate.reject({
      candidateId: 'c-rej',
      note: 'wrong match',
    })
    expect(res.ok).toBe(true)
    const cand = (
      await db
        .select()
        .from(contentNodeLinkCandidate)
        .where(eq(contentNodeLinkCandidate.candidateId, 'c-rej'))
    )[0]
    expect(cand?.status).toBe('rejected')
    expect(cand?.decidedBy).toBe('admin@test.com')
    expect(cand?.decisionReason).toBe('wrong match')
  })

  it('idempotent: rejecting an already-rejected candidate is a no-op', async () => {
    await seedEntities()
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-rej-dup',
      brainNodeId: 'n-rej-dup',
      proposedCanonicalId: 'ds-a',
      matchMethod: 'manual',
      source: 'manual',
      runId: 'r1',
      proposedAt: new Date(),
      status: 'rejected',
      decisionMethod: 'admin',
      decidedBy: 'admin@test.com',
      decidedAt: new Date(),
    })
    const caller = createCaller(adminCtx)
    const res = await caller.crosswalk.candidate.reject({ candidateId: 'c-rej-dup' })
    expect(res.alreadyDecided).toBe('rejected')
  })
})

describe('crosswalk router — candidate.override', () => {
  it('flips rejected → overridden and inserts a fresh pending row for the same pair', async () => {
    await seedEntities()
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-ovr',
      brainNodeId: 'n-ovr',
      proposedCanonicalId: 'ds-a',
      matchMethod: 'manual',
      source: 'manual',
      runId: 'r1',
      proposedAt: new Date(),
      status: 'rejected',
      decisionMethod: 'admin',
      decidedBy: 'admin@test.com',
      decidedAt: new Date(),
    })
    const caller = createCaller(adminCtx)
    const { newCandidateId } = await caller.crosswalk.candidate.override({
      candidateId: 'c-ovr',
    })
    const oldCand = (
      await db
        .select()
        .from(contentNodeLinkCandidate)
        .where(eq(contentNodeLinkCandidate.candidateId, 'c-ovr'))
    )[0]
    expect(oldCand?.status).toBe('overridden')
    const newCand = (
      await db
        .select()
        .from(contentNodeLinkCandidate)
        .where(eq(contentNodeLinkCandidate.candidateId, newCandidateId))
    )[0]
    expect(newCand?.status).toBe('pending')
    expect(newCand?.brainNodeId).toBe('n-ovr')
    expect(newCand?.proposedCanonicalId).toBe('ds-a')
  })

  it('CONFLICT when overriding a non-rejected candidate', async () => {
    await seedEntities()
    await db.insert(contentNodeLinkCandidate).values({
      candidateId: 'c-ovr-bad',
      brainNodeId: 'n-ovr-bad',
      proposedCanonicalId: 'ds-a',
      matchMethod: 'manual',
      source: 'manual',
      runId: 'r1',
      proposedAt: new Date(),
      status: 'pending',
    })
    const caller = createCaller(adminCtx)
    await expect(caller.crosswalk.candidate.override({ candidateId: 'c-ovr-bad' })).rejects.toThrow(
      /can only override/i,
    )
  })
})

describe('crosswalk router — bulk operations', () => {
  it('requires confirm=true (Zod schema enforces it)', async () => {
    const caller = createCaller(adminCtx)
    // @ts-expect-error — testing missing confirm flag
    await expect(caller.crosswalk.candidate.approveBulk({ candidateIds: ['x'] })).rejects.toThrow()
  })

  it('approveBulk approves multiple candidates and reports failures', async () => {
    await seedEntities()
    await db.insert(contentNodeLinkCandidate).values([
      {
        candidateId: 'b1',
        brainNodeId: 'nb1',
        proposedCanonicalId: 'ds-a',
        matchMethod: 'manual',
        source: 'manual',
        runId: 'r1',
        proposedAt: new Date(),
      },
      {
        candidateId: 'b2',
        brainNodeId: 'nb2',
        proposedCanonicalId: 'ds-b',
        matchMethod: 'manual',
        source: 'manual',
        runId: 'r1',
        proposedAt: new Date(),
      },
      {
        candidateId: 'b3-missing',
        brainNodeId: 'nb3',
        proposedCanonicalId: 'ds-a',
        matchMethod: 'manual',
        source: 'manual',
        runId: 'r1',
        proposedAt: new Date(),
        status: 'approved', // already approved
        decisionMethod: 'admin',
        decidedBy: 'admin@test.com',
        decidedAt: new Date(),
      },
    ])

    const caller = createCaller(adminCtx)
    const res = await caller.crosswalk.candidate.approveBulk({
      candidateIds: ['b1', 'b2', 'b3-missing', 'nonexistent'],
      confirm: true,
    })
    expect(res.approved).toBe(2)
    expect(res.errors).toHaveLength(2)
  })
})

describe('crosswalk router — stats', () => {
  it('returns zero counts on empty DB', async () => {
    const caller = createCaller(adminCtx)
    const stats = await caller.crosswalk.stats()
    expect(stats.pending).toBe(0)
    expect(stats.llmUnsure).toBe(0)
    expect(stats.approvedRecent).toBe(0)
    expect(stats.rejectedRecent).toBe(0)
    expect(stats.bySource).toEqual([])
    expect(stats.recentLlmDecisions).toEqual([])
  })

  it('aggregates by source and status', async () => {
    await seedEntities()
    const now = new Date()
    await db.insert(contentNodeLinkCandidate).values([
      {
        candidateId: 's1',
        brainNodeId: 'ns1',
        proposedCanonicalId: 'ds-a',
        matchMethod: 'manual',
        source: 'sync:wahapedia',
        runId: 'r1',
        proposedAt: now,
      },
      {
        candidateId: 's2',
        brainNodeId: 'ns2',
        proposedCanonicalId: 'ds-b',
        matchMethod: 'manual',
        source: 'sync:wahapedia',
        runId: 'r1',
        proposedAt: now,
        status: 'llm_unsure',
        decisionMethod: 'llm',
        decidedBy: 'llm:test',
        decidedAt: now,
      },
    ])
    const caller = createCaller(adminCtx)
    const stats = await caller.crosswalk.stats()
    expect(stats.pending).toBe(1)
    expect(stats.llmUnsure).toBe(1)
    expect(stats.bySource).toHaveLength(1)
    expect(stats.bySource[0]?.source).toBe('sync:wahapedia')
  })
})
