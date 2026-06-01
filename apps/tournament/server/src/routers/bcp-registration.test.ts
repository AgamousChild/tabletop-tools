import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      username TEXT UNIQUE,
      display_username TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bcp_registration (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      bcp_event_id TEXT NOT NULL,
      list_id TEXT,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      consent_at INTEGER NOT NULL,
      submitted_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-2', 'Bob', 'bob@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)

function user1Caller() {
  return createCaller({
    db,
    user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
    req: new Request('http://test'),
  })
}

function user2Caller() {
  return createCaller({
    db,
    user: { id: 'user-2', email: 'bob@example.com', name: 'Bob' },
    req: new Request('http://test'),
  })
}

describe('bcpRegistration.record', () => {
  it('records a registration with explicit consent timestamp', async () => {
    const caller = user1Caller()
    const now = Date.now()
    const reg = await caller.bcpRegistration.record({
      bcpEventId: 'bcp-evt-1',
      listId: 'list-abc',
      method: 'server',
      status: 'submitted',
      consentAt: now,
    })
    expect(reg).toBeDefined()
    expect(reg!.userId).toBe('user-1')
    expect(reg!.bcpEventId).toBe('bcp-evt-1')
    expect(reg!.method).toBe('server')
    expect(reg!.status).toBe('submitted')
    expect(reg!.consentAt).toBe(now)
    expect(reg!.listId).toBe('list-abc')
  })

  it('rejects registration if consentAt is in the future (beyond 5s tolerance)', async () => {
    const caller = user1Caller()
    const futureConsent = Date.now() + 60_000 // 60s in future
    await expect(
      caller.bcpRegistration.record({
        bcpEventId: 'bcp-evt-2',
        method: 'agent',
        status: 'submitted',
        consentAt: futureConsent,
      }),
    ).rejects.toThrow('consentAt cannot be in the future')
  })

  it('records failed registration without listId', async () => {
    const caller = user1Caller()
    const reg = await caller.bcpRegistration.record({
      bcpEventId: 'bcp-evt-3',
      method: 'agent',
      status: 'failed',
      consentAt: Date.now(),
    })
    expect(reg!.status).toBe('failed')
    expect(reg!.listId).toBeNull()
  })
})

describe('bcpRegistration.updateStatus', () => {
  let regId: string

  it('user can update their own registration status', async () => {
    const caller = user1Caller()
    const reg = await caller.bcpRegistration.record({
      bcpEventId: 'bcp-evt-4',
      method: 'server',
      status: 'submitted',
      consentAt: Date.now(),
    })
    regId = reg!.id

    const updated = await caller.bcpRegistration.updateStatus({ id: regId, status: 'failed' })
    expect(updated!.status).toBe('failed')
  })

  it("another user cannot update someone else's registration", async () => {
    const caller = user2Caller()
    await expect(
      caller.bcpRegistration.updateStatus({ id: regId, status: 'submitted' }),
    ).rejects.toThrow('Not authorized')
  })

  it('returns NOT_FOUND for missing registration id', async () => {
    const caller = user1Caller()
    await expect(
      caller.bcpRegistration.updateStatus({ id: 'no-such-reg', status: 'failed' }),
    ).rejects.toThrow('Registration not found')
  })
})

describe('bcpRegistration.listMine', () => {
  it("returns only the current user's registrations", async () => {
    const caller = user1Caller()
    const regs = await caller.bcpRegistration.listMine()
    expect(regs.length).toBeGreaterThanOrEqual(3) // from earlier tests
    expect(regs.every((r) => r.userId === 'user-1')).toBe(true)
  })
})

describe('bcpRegistration.getForEvent', () => {
  it('returns registrations for a specific bcp event', async () => {
    const caller = user1Caller()
    const regs = await caller.bcpRegistration.getForEvent({ bcpEventId: 'bcp-evt-1' })
    expect(regs.length).toBeGreaterThanOrEqual(1)
    expect(regs.every((r) => r.bcpEventId === 'bcp-evt-1')).toBe(true)
  })

  it('returns empty for event with no registrations for this user', async () => {
    const caller = user2Caller()
    const regs = await caller.bcpRegistration.getForEvent({ bcpEventId: 'bcp-evt-1' })
    expect(regs).toHaveLength(0)
  })
})
