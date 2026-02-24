import { createClient } from '@libsql/client'
import { createDb, type Db } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TRPCError } from '@trpc/server'

import {
  router,
  publicProcedure,
  protectedProcedure,
  createCallerFactory,
  type BaseContext,
  type User,
} from './trpc'

const TEST_DB = `test-server-core-trpc-${Date.now()}.db`
let db: Db

beforeAll(() => {
  db = createDb({ url: `file:./${TEST_DB}` })
})

afterAll(async () => {
  const { existsSync, unlinkSync } = await import('fs')
  try {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  } catch {
    // May be locked on Windows
  }
})

// Minimal test router
const testRouter = router({
  publicHello: publicProcedure.query(() => ({ msg: 'hello' })),
  protectedSecret: protectedProcedure.query(({ ctx }) => ({
    msg: `secret for ${ctx.user.name}`,
  })),
})

const createCaller = createCallerFactory(testRouter)

function makeContext(user: User | null): BaseContext {
  return {
    user,
    req: new Request('http://localhost/trpc'),
    db,
  }
}

describe('publicProcedure', () => {
  it('allows unauthenticated access', async () => {
    const caller = createCaller(makeContext(null))
    const result = await caller.publicHello()
    expect(result).toEqual({ msg: 'hello' })
  })

  it('allows authenticated access', async () => {
    const caller = createCaller(makeContext({ id: '1', email: 'a@b.com', name: 'Alice' }))
    const result = await caller.publicHello()
    expect(result).toEqual({ msg: 'hello' })
  })
})

describe('protectedProcedure', () => {
  it('rejects unauthenticated access with UNAUTHORIZED', async () => {
    const caller = createCaller(makeContext(null))
    await expect(caller.protectedSecret()).rejects.toThrow(TRPCError)
    try {
      await caller.protectedSecret()
    } catch (e) {
      expect((e as TRPCError).code).toBe('UNAUTHORIZED')
    }
  })

  it('passes user through context for authenticated access', async () => {
    const user: User = { id: 'u1', email: 'test@example.com', name: 'Test User' }
    const caller = createCaller(makeContext(user))
    const result = await caller.protectedSecret()
    expect(result).toEqual({ msg: 'secret for Test User' })
  })
})

describe('User type', () => {
  it('has id, email, and name fields', () => {
    const user: User = { id: '1', email: 'a@b.com', name: 'Alice' }
    expect(user.id).toBe('1')
    expect(user.email).toBe('a@b.com')
    expect(user.name).toBe('Alice')
  })
})

describe('BaseContext type', () => {
  it('includes user, req, and db', () => {
    const ctx = makeContext(null)
    expect(ctx.user).toBeNull()
    expect(ctx.req).toBeInstanceOf(Request)
    expect(ctx.db).toBeDefined()
  })
})
