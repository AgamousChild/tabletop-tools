import { createClient } from '@libsql/client'
import { createDb, type Db } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { router, publicProcedure, protectedProcedure, type BaseContext, type User } from './trpc'
import { createBaseServer } from './server'

const TEST_DB = `test-server-core-server-${Date.now()}.db`
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

// Test router
const testRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
  whoami: protectedProcedure.query(({ ctx }) => ({ name: ctx.user.name })),
})

function makeApp(user: User | null = null) {
  return createBaseServer({
    router: testRouter,
    createContext: async (req) => ({
      user,
      req,
      db,
    }),
  })
}

describe('createBaseServer', () => {
  it('serves tRPC endpoints at /trpc/*', async () => {
    const app = makeApp()
    const res = await app.fetch(
      new Request('http://localhost/trpc/health', { method: 'GET' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.data).toEqual({ status: 'ok' })
  })

  it('returns CORS headers with credentials', async () => {
    const app = makeApp()
    const res = await app.fetch(
      new Request('http://localhost/trpc/health', {
        method: 'GET',
        headers: { Origin: 'http://example.com' },
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://example.com')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('handles CORS preflight requests', async () => {
    const app = makeApp()
    const res = await app.fetch(
      new Request('http://localhost/trpc/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://example.com')
  })

  it('passes context with authenticated user to protected procedures', async () => {
    const user: User = { id: 'u1', email: 'test@x.com', name: 'Tester' }
    const app = makeApp(user)
    const res = await app.fetch(
      new Request('http://localhost/trpc/whoami', { method: 'GET' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.data).toEqual({ name: 'Tester' })
  })

  it('returns 401 for protected procedures without auth', async () => {
    const app = makeApp(null)
    const res = await app.fetch(
      new Request('http://localhost/trpc/whoami', { method: 'GET' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 for non-tRPC paths', async () => {
    const app = makeApp()
    const res = await app.fetch(
      new Request('http://localhost/not-trpc', { method: 'GET' }),
    )
    expect(res.status).toBe(404)
  })
})
