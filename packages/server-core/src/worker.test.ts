import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import { createWorkerHandler, type BaseEnv } from './worker'

function makeTestApp() {
  const app = new Hono()
  app.get('/health', (c) => c.json({ status: 'ok' }))
  return app
}

describe('createWorkerHandler', () => {
  it('calls createApp on first request and returns a response', async () => {
    const createApp = vi.fn().mockResolvedValue(makeTestApp())

    const handler = createWorkerHandler({ createApp })
    const env = { TURSO_DB_URL: 'file:./test.db', TURSO_AUTH_TOKEN: '' } satisfies BaseEnv
    const res = await handler.fetch!(new Request('http://localhost/health'), env, {} as any)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(createApp).toHaveBeenCalledOnce()
    expect(createApp).toHaveBeenCalledWith(env)
  })

  it('reuses cached app on subsequent requests (module-scope caching)', async () => {
    const createApp = vi.fn().mockResolvedValue(makeTestApp())

    const handler = createWorkerHandler({ createApp })
    const env = { TURSO_DB_URL: 'file:./test.db', TURSO_AUTH_TOKEN: '' } satisfies BaseEnv

    await handler.fetch!(new Request('http://localhost/health'), env, {} as any)
    await handler.fetch!(new Request('http://localhost/health'), env, {} as any)
    await handler.fetch!(new Request('http://localhost/health'), env, {} as any)

    expect(createApp).toHaveBeenCalledOnce()
  })

  it('each handler instance has independent cache', async () => {
    const createApp1 = vi.fn().mockResolvedValue(makeTestApp())
    const createApp2 = vi.fn().mockResolvedValue(makeTestApp())

    const handler1 = createWorkerHandler({ createApp: createApp1 })
    const handler2 = createWorkerHandler({ createApp: createApp2 })
    const env = { TURSO_DB_URL: 'file:./test.db', TURSO_AUTH_TOKEN: '' } satisfies BaseEnv

    await handler1.fetch!(new Request('http://localhost/health'), env, {} as any)
    await handler2.fetch!(new Request('http://localhost/health'), env, {} as any)

    expect(createApp1).toHaveBeenCalledOnce()
    expect(createApp2).toHaveBeenCalledOnce()
  })

  it('returns 404 for unknown paths', async () => {
    const handler = createWorkerHandler({ createApp: async () => makeTestApp() })
    const env = { TURSO_DB_URL: 'file:./test.db', TURSO_AUTH_TOKEN: '' } satisfies BaseEnv
    const res = await handler.fetch!(new Request('http://localhost/unknown'), env, {} as any)

    expect(res.status).toBe(404)
  })
})
