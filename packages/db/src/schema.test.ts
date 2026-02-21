import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { authUsers, diceSets, diceRollingSessions, rolls } from './schema'

const client = createClient({ url: ':memory:' })
const db = drizzle(client)

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  // Auth tables (Better Auth managed)
  await client.execute(`CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    username TEXT UNIQUE,
    display_username TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "session" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "account" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at INTEGER,
    refresh_token_expires_at INTEGER,
    scope TEXT,
    password TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
  )`)

  // App tables
  await client.execute(`CREATE TABLE dice_sets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
    opponent_name TEXT,
    z_score REAL,
    is_loaded INTEGER,
    photo_url TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  )`)

  await client.execute(`CREATE TABLE rolls (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    pip_values TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  // Seed a user for FK tests
  await db.insert(authUsers).values({
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})

describe('authUsers', () => {
  it('inserts and retrieves a user', async () => {
    const result = await db.select().from(authUsers).where(eq(authUsers.id, 'user-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.email).toBe('test@example.com')
  })

  it('enforces unique email constraint', async () => {
    await expect(
      db.insert(authUsers).values({
        id: 'user-2',
        name: 'Dupe',
        email: 'test@example.com', // duplicate
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow()
  })
})

describe('diceSets', () => {
  it('inserts and retrieves a dice set', async () => {
    await db.insert(diceSets).values({
      id: 'set-1',
      userId: 'user-1',
      name: 'Red Dice',
      createdAt: Date.now(),
    })

    const result = await db.select().from(diceSets).where(eq(diceSets.id, 'set-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Red Dice')
    expect(result[0]?.userId).toBe('user-1')
  })
})

describe('diceRollingSessions', () => {
  it('inserts an open session with null verdict fields', async () => {
    await db.insert(diceRollingSessions).values({
      id: 'sess-1',
      userId: 'user-1',
      diceSetId: 'set-1',
      opponentName: 'Bob',
      createdAt: Date.now(),
    })

    const result = await db
      .select()
      .from(diceRollingSessions)
      .where(eq(diceRollingSessions.id, 'sess-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.closedAt).toBeNull()
    expect(result[0]?.isLoaded).toBeNull()
    expect(result[0]?.zScore).toBeNull()
  })

  it('closes a session with a verdict', async () => {
    const closedAt = Date.now()
    await db
      .update(diceRollingSessions)
      .set({ zScore: 2.84, isLoaded: 1, closedAt })
      .where(eq(diceRollingSessions.id, 'sess-1'))

    const result = await db
      .select()
      .from(diceRollingSessions)
      .where(eq(diceRollingSessions.id, 'sess-1'))
    expect(result[0]?.isLoaded).toBe(1)
    expect(result[0]?.zScore).toBeCloseTo(2.84)
    expect(result[0]?.closedAt).toBe(closedAt)
  })
})

describe('rolls', () => {
  it('inserts a roll and retrieves pip values', async () => {
    const pipValues = [3, 5, 2, 6, 1, 4]

    await db.insert(rolls).values({
      id: 'roll-1',
      sessionId: 'sess-1',
      pipValues: JSON.stringify(pipValues),
      createdAt: Date.now(),
    })

    const result = await db.select().from(rolls).where(eq(rolls.sessionId, 'sess-1'))
    expect(result).toHaveLength(1)
    expect(JSON.parse(result[0]?.pipValues ?? '[]')).toEqual(pipValues)
  })

  it('deletes a roll', async () => {
    await db.delete(rolls).where(eq(rolls.id, 'roll-1'))

    const result = await db.select().from(rolls).where(eq(rolls.id, 'roll-1'))
    expect(result).toHaveLength(0)
  })
})
