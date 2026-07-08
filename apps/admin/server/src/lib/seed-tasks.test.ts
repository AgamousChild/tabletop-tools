import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createClient } from '@libsql/client'
import { createDbFromClient, tasks } from '@tabletop-tools/db'
import { createTestTables } from '@tabletop-tools/db/src/test-ddl'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedTasks } from './seed-tasks'

// libsql client's db.transaction() spawns a new connection. With `:memory:` the
// new connection sees an empty DB (per-connection isolation), so use a temp
// file so all connections share state (matches crosswalk.test.ts pattern).
const dbPath = join(
  tmpdir(),
  `seed-tasks-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
)
const client = createClient({ url: `file:${dbPath}` })
const db = createDbFromClient(client)

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

describe('seedTasks', () => {
  it('inserts all 27 known tasks', async () => {
    await seedTasks(db)
    const rows = await db.select().from(tasks)
    expect(rows).toHaveLength(27)
  })

  it('is idempotent — re-running does not duplicate rows', async () => {
    await seedTasks(db)
    await seedTasks(db)
    const rows = await db.select().from(tasks)
    expect(rows).toHaveLength(27)
  })

  it('seeds task 25 with exact known fields', async () => {
    await seedTasks(db)
    const [row] = await db.select().from(tasks).where(eq(tasks.id, 25))
    expect(row?.subject).toBe('Fix brain retrieval for matchup queries')
    expect(row?.category).toBe('review')
    expect(row?.priority).toBe(1)
    expect(row?.status).toBe('pending')
  })

  it('seeds task 49 with exact known fields', async () => {
    await seedTasks(db)
    const [row] = await db.select().from(tasks).where(eq(tasks.id, 49))
    expect(row?.subject).toBe('Admin: add project task list page')
    expect(row?.category).toBe('auto')
    expect(row?.priority).toBe(1)
    expect(row?.status).toBe('completed')
  })
})
