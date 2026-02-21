import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
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
    CREATE TABLE IF NOT EXISTS dice_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
      opponent_name TEXT,
      z_score REAL,
      is_loaded INTEGER,
      photo_url TEXT,
      created_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      pip_values TEXT NOT NULL,
      created_at INTEGER NOT NULL
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

// ---------------------------------------------------------------------------
// session.start
// ---------------------------------------------------------------------------
describe('session.start', () => {
  it('creates and returns an open session', async () => {
    const caller = createCaller(alice)
    const session = await caller.session.start({ diceSetId: 'set-1' })
    expect(session.id).toBeTruthy()
    expect(session.userId).toBe('user-1')
    expect(session.diceSetId).toBe('set-1')
    expect(session.closedAt).toBeNull()
    expect(session.isLoaded).toBeNull()
  })

  it('accepts an optional opponent name', async () => {
    const caller = createCaller(alice)
    const session = await caller.session.start({
      diceSetId: 'set-1',
      opponentName: 'Dave',
    })
    expect(session.opponentName).toBe('Dave')
  })

  it('rejects if the dice set does not belong to the user', async () => {
    const caller = createCaller(bob) // Bob doesn't own set-1
    await expect(caller.session.start({ diceSetId: 'set-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller({ user: null, req, db })
    await expect(caller.session.start({ diceSetId: 'set-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

// ---------------------------------------------------------------------------
// session.addRoll
// ---------------------------------------------------------------------------
describe('session.addRoll', () => {
  let sessionId: string

  beforeAll(async () => {
    const caller = createCaller(alice)
    const session = await caller.session.start({ diceSetId: 'set-1' })
    sessionId = session.id
  })

  it('records pip values and returns roll count and running z-score', async () => {
    const caller = createCaller(alice)
    const result = await caller.session.addRoll({
      sessionId,
      pipValues: [3, 5, 2, 6, 1, 4],
    })
    expect(result.rollCount).toBe(1)
    expect(typeof result.zScore).toBe('number')
  })

  it('increments roll count on each addition', async () => {
    const caller = createCaller(alice)
    const r2 = await caller.session.addRoll({ sessionId, pipValues: [2, 4, 6, 1, 3, 5] })
    expect(r2.rollCount).toBe(2)
  })

  it('rejects if the session does not belong to the user', async () => {
    const caller = createCaller(bob)
    await expect(
      caller.session.addRoll({ sessionId, pipValues: [1, 2, 3] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects pip values outside the 1–6 range', async () => {
    const caller = createCaller(alice)
    await expect(
      caller.session.addRoll({ sessionId, pipValues: [0, 7] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects adding rolls to a closed session', async () => {
    const caller = createCaller(alice)
    const closed = await caller.session.start({ diceSetId: 'set-1' })
    await caller.session.close({ sessionId: closed.id })
    await expect(
      caller.session.addRoll({ sessionId: closed.id, pipValues: [1, 2, 3] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

// ---------------------------------------------------------------------------
// session.close
// ---------------------------------------------------------------------------
describe('session.close', () => {
  it('closes the session and returns verdict with z-score', async () => {
    const caller = createCaller(alice)
    const session = await caller.session.start({ diceSetId: 'set-1' })

    // Add enough rolls for a meaningful result (uniform)
    for (let i = 0; i < 10; i++) {
      await caller.session.addRoll({ sessionId: session.id, pipValues: [1, 2, 3, 4, 5, 6] })
    }

    const result = await caller.session.close({ sessionId: session.id })
    expect(typeof result.zScore).toBe('number')
    expect(typeof result.isLoaded).toBe('boolean')
    expect(result.isLoaded).toBe(false) // uniform distribution is fair
  })

  it('flags loaded dice when rolls are heavily biased', async () => {
    const caller = createCaller(alice)
    const session = await caller.session.start({ diceSetId: 'set-1' })

    // 30 sixes, 6 of each other face = heavily biased
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

    const result = await caller.session.close({ sessionId: session.id })
    expect(result.isLoaded).toBe(true)
  })

  it('rejects closing a session that belongs to another user', async () => {
    const aliceCaller = createCaller(alice)
    const bobCaller = createCaller(bob)
    const session = await aliceCaller.session.start({ diceSetId: 'set-1' })
    await expect(bobCaller.session.close({ sessionId: session.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

// ---------------------------------------------------------------------------
// session.list
// ---------------------------------------------------------------------------
describe('session.list', () => {
  it('returns all sessions for the authenticated user', async () => {
    const caller = createCaller(alice)
    const sessions = await caller.session.list({})
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.every((s) => s.userId === 'user-1')).toBe(true)
  })

  it('filters by diceSetId when provided', async () => {
    const caller = createCaller(alice)
    const sessions = await caller.session.list({ diceSetId: 'set-1' })
    expect(sessions.every((s) => s.diceSetId === 'set-1')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// session.get
// ---------------------------------------------------------------------------
describe('session.get', () => {
  it('returns the session with all its rolls', async () => {
    const caller = createCaller(alice)
    const session = await caller.session.start({ diceSetId: 'set-1' })
    await caller.session.addRoll({ sessionId: session.id, pipValues: [1, 2, 3] })
    await caller.session.addRoll({ sessionId: session.id, pipValues: [4, 5, 6] })

    const detail = await caller.session.get({ sessionId: session.id })
    expect(detail.session.id).toBe(session.id)
    expect(detail.rolls).toHaveLength(2)
    expect(JSON.parse(detail.rolls[0]!.pipValues)).toEqual([1, 2, 3])
  })

  it('rejects if the session belongs to another user', async () => {
    const aliceCaller = createCaller(alice)
    const bobCaller = createCaller(bob)
    const session = await aliceCaller.session.start({ diceSetId: 'set-1' })
    await expect(bobCaller.session.get({ sessionId: session.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
