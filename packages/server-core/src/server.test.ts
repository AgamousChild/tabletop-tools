import { createClient } from '@libsql/client'
import { createDbFromClient, type Db } from '@tabletop-tools/db'
import {
  setupAuthTables,
  authCookie,
  TEST_SECRET,
} from '@tabletop-tools/auth/src/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { router, publicProcedure, protectedProcedure, type BaseContext } from './trpc'
import { createBaseServer } from './server'

const client = createClient({ url: ':memory:' })
let db: Db

beforeAll(async () => {
  db = createDbFromClient(client)
  await setupAuthTables(client)
})

afterAll(() => client.close())

// Test router
const testRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
  whoami: protectedProcedure.query(({ ctx }) => ({ name: ctx.user.name })),
})

function makeApp() {
  return createBaseServer({
    router: testRouter,
    db,
    secret: TEST_SECRET,
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
    const app = makeApp()
    const res = await app.fetch(
      new Request('http://localhost/trpc/whoami', {
        method: 'GET',
        headers: { Cookie: await authCookie() },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.data).toEqual({ name: 'Alice' })
  })

  it('returns 401 for protected procedures without auth', async () => {
    const app = makeApp()
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

  it('supports extendContext for app-specific fields', async () => {
    type ExtendedContext = BaseContext & { custom: string }
    const extendedRouter = router({
      custom: protectedProcedure.query(({ ctx }) => ({
        custom: (ctx as ExtendedContext).custom,
      })),
    })

    const app = createBaseServer<ExtendedContext>({
      router: extendedRouter,
      db,
      secret: TEST_SECRET,
      extendContext: (baseCtx) => ({ ...baseCtx, custom: 'hello' }),
    })

    const res = await app.fetch(
      new Request('http://localhost/trpc/custom', {
        method: 'GET',
        headers: { Cookie: await authCookie() },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.data).toEqual({ custom: 'hello' })
  })
})
