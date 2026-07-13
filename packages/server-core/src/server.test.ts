import { createClient } from '@libsql/client'
import {
  authCookie,
  setupAuthTables,
  TEST_SECRET,
  TEST_USER,
} from '@tabletop-tools/auth/src/test-helpers'
import { createDbFromClient, type Db } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createBaseServer } from './server'
import { type BaseContext, protectedProcedure, publicProcedure, router } from './trpc'

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

function makeApp(trustedOrigins: string[] = ['http://example.com']) {
  return createBaseServer({
    router: testRouter,
    db,
    secret: TEST_SECRET,
    trustedOrigins,
  })
}

describe('createBaseServer', () => {
  it('serves tRPC endpoints at /trpc/*', async () => {
    const app = makeApp()
    const res = await app.fetch(new Request('http://localhost/trpc/health', { method: 'GET' }))
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

  // Regression: prior CORS reflected every incoming origin with
  // `credentials: true`, which is an "open door" shape flagged by D2-06.
  // With SameSite=Lax session cookies the browser mostly protects users
  // from cross-site fetch abuse, but relying on that alone is not defense
  // in depth. Untrusted origins should not appear in the response.
  it('does not reflect untrusted origins for credentialed requests', async () => {
    const app = makeApp(['https://tabletop-tools.net'])
    const res = await app.fetch(
      new Request('http://localhost/trpc/health', {
        method: 'GET',
        headers: { Origin: 'https://evil.com' },
      }),
    )
    // Whatever the header value is, it must not echo evil.com back.
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.com')
  })

  it('defaults trustedOrigins to https://tabletop-tools.net when omitted', async () => {
    const app = createBaseServer({ router: testRouter, db, secret: TEST_SECRET })
    const res = await app.fetch(
      new Request('http://localhost/trpc/health', {
        method: 'GET',
        headers: { Origin: 'https://tabletop-tools.net' },
      }),
    )
    expect(res.headers.get('access-control-allow-origin')).toBe('https://tabletop-tools.net')
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
    expect(body.result.data).toEqual({ name: TEST_USER.name })
  })

  it('returns 401 for protected procedures without auth', async () => {
    const app = makeApp()
    const res = await app.fetch(new Request('http://localhost/trpc/whoami', { method: 'GET' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 for non-tRPC paths', async () => {
    const app = makeApp()
    const res = await app.fetch(new Request('http://localhost/not-trpc', { method: 'GET' }))
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
