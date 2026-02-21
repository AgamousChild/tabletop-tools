import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

// Mock R2 so tests don't require real cloud credentials
vi.mock('../lib/storage/r2', () => ({
  createR2Client: vi.fn(() => ({})),
  uploadToR2: vi.fn().mockResolvedValue('https://cdn.example.com/evidence/test.jpg'),
}))

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
      username TEXT UNIQUE, display_username TEXT UNIQUE,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dice_sets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id),
      dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
      opponent_name TEXT, z_score REAL, is_loaded INTEGER,
      photo_url TEXT, created_at INTEGER NOT NULL, closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
      pip_values TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-2', 'Bob', 'bob@example.com', 0, 0, 0);
    INSERT INTO dice_sets (id, user_id, name, created_at)
    VALUES ('set-1', 'user-1', 'Red Dragons', 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const alice = { user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' }, req, db }
const bob = { user: { id: 'user-2', email: 'bob@example.com', name: 'Bob' }, req, db }

// Minimal base64 JPEG header to pass validation
const fakeBase64 = Buffer.from('fake-jpeg-data').toString('base64')

// Helper: create and close a session, returning the session ID
async function createLoadedSession() {
  const caller = createCaller(alice)
  const session = await caller.session.start({ diceSetId: 'set-1' })
  // Add biased rolls so it closes as loaded
  const biasedPips: number[][] = [
    ...Array(30).fill([6]),
    ...Array(6).fill([1]),
    ...Array(6).fill([2]),
    ...Array(6).fill([3]),
    ...Array(6).fill([4]),
    ...Array(6).fill([5]),
  ]
  for (const pips of biasedPips) {
    await caller.session.addRoll({ sessionId: session.id, pipValues: pips })
  }
  await caller.session.close({ sessionId: session.id })
  return session.id
}

async function createFairSession() {
  const caller = createCaller(alice)
  const session = await caller.session.start({ diceSetId: 'set-1' })
  for (let i = 0; i < 10; i++) {
    await caller.session.addRoll({ sessionId: session.id, pipValues: [1, 2, 3, 4, 5, 6] })
  }
  await caller.session.close({ sessionId: session.id })
  return session.id
}

describe('session.savePhoto', () => {
  it('uploads the photo and returns the URL', async () => {
    const sessionId = await createLoadedSession()
    const caller = createCaller(alice)
    const result = await caller.session.savePhoto({ sessionId, imageData: fakeBase64 })
    expect(result.photoUrl).toBe('https://cdn.example.com/evidence/test.jpg')
  })

  it('stores the photo URL on the session record', async () => {
    const sessionId = await createLoadedSession()
    const caller = createCaller(alice)
    await caller.session.savePhoto({ sessionId, imageData: fakeBase64 })
    const detail = await caller.session.get({ sessionId })
    expect(detail.session.photoUrl).toBe('https://cdn.example.com/evidence/test.jpg')
  })

  it('rejects if the session is not loaded', async () => {
    const sessionId = await createFairSession()
    const caller = createCaller(alice)
    await expect(
      caller.session.savePhoto({ sessionId, imageData: fakeBase64 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects if the session is not closed', async () => {
    const caller = createCaller(alice)
    const session = await caller.session.start({ diceSetId: 'set-1' })
    await expect(
      caller.session.savePhoto({ sessionId: session.id, imageData: fakeBase64 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects if the session belongs to another user', async () => {
    const sessionId = await createLoadedSession()
    const bobCaller = createCaller(bob)
    await expect(
      bobCaller.session.savePhoto({ sessionId, imageData: fakeBase64 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects unauthenticated callers', async () => {
    const sessionId = await createLoadedSession()
    const caller = createCaller({ user: null, req, db })
    await expect(
      caller.session.savePhoto({ sessionId, imageData: fakeBase64 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
