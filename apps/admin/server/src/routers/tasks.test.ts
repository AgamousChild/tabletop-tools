import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createClient } from '@libsql/client'
import { createDbFromClient, tasks } from '@tabletop-tools/db'
import { createTestTables } from '@tabletop-tools/db/src/test-ddl'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { seedTasks } from '../lib/seed-tasks'
import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

// libsql client's db.transaction() spawns a new connection. With `:memory:` the
// new connection sees an empty DB (per-connection isolation), so use a temp
// file so all connections share state (matches crosswalk.test.ts pattern).
const dbPath = join(
  tmpdir(),
  `tasks-router-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
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
  await createTestTables(client, { tasks })
})

afterAll(() => {
  client.close()
  try {
    unlinkSync(dbPath)
  } catch {
    /* file may already be gone */
  }
})

afterEach(async () => {
  await client.execute('DELETE FROM tasks')
})

describe('tasks router — access control', () => {
  it('rejects unauthenticated requests', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.tasks.list()).rejects.toThrow(/UNAUTHORIZED/)
  })

  it('rejects non-admin authenticated requests', async () => {
    const caller = createCaller(nonAdminCtx)
    await expect(caller.tasks.list()).rejects.toThrow(/Admin access required/)
  })

  it('allows admin requests', async () => {
    const caller = createCaller(adminCtx)
    const result = await caller.tasks.list()
    expect(result).toEqual([])
  })
})

describe('tasks router — list', () => {
  it('returns seeded rows', async () => {
    await seedTasks(db)
    const caller = createCaller(adminCtx)
    const result = await caller.tasks.list()
    expect(result).toHaveLength(27)
  })
})

describe('tasks router — create', () => {
  it('adds a new row', async () => {
    const caller = createCaller(adminCtx)
    const created = await caller.tasks.create({
      id: 100,
      subject: 'New task',
      category: 'auto',
      priority: 3,
      status: 'pending',
    })
    expect(created.id).toBe(100)

    const rows = await db.select().from(tasks).where(eq(tasks.id, 100))
    expect(rows[0]?.subject).toBe('New task')
  })

  it('rejects non-admin create', async () => {
    const caller = createCaller(nonAdminCtx)
    await expect(
      caller.tasks.create({
        id: 101,
        subject: 'Nope',
        category: 'auto',
        priority: 1,
        status: 'pending',
      }),
    ).rejects.toThrow(/Admin access required/)
  })
})

describe('tasks router — update', () => {
  it('mutates a row', async () => {
    await seedTasks(db)
    const caller = createCaller(adminCtx)
    const updated = await caller.tasks.update({ id: 25, status: 'in_progress' })
    expect(updated.status).toBe('in_progress')

    const rows = await db.select().from(tasks).where(eq(tasks.id, 25))
    expect(rows[0]?.status).toBe('in_progress')
  })

  it('throws NOT_FOUND for unknown id', async () => {
    const caller = createCaller(adminCtx)
    await expect(caller.tasks.update({ id: 9999, status: 'completed' })).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('tasks router — delete', () => {
  it('removes a row', async () => {
    await seedTasks(db)
    const caller = createCaller(adminCtx)
    const res = await caller.tasks.delete({ id: 25 })
    expect(res.deleted).toBe(true)

    const rows = await db.select().from(tasks).where(eq(tasks.id, 25))
    expect(rows).toHaveLength(0)
  })
})
