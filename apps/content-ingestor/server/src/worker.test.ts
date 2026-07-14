/**
 * Worker-level tests for the Gladia webhook callback authentication.
 *
 * POST /ingest/callback uses a query-param shared-secret (`checkWebhookToken`)
 * because Gladia's callback caller can't attach an Authorization header.
 * Every other admin route is gated by `checkAuth` (Bearer-token) — both
 * paths now fail loud (401) when their secret is unset, matching each
 * other and D2-06. The old `checkAuth` permissive fallback (allow all
 * when SYNC_SECRET was unset) was replaced 2026-07-13 after verifying it
 * had left `/sources` and friends unauth on the deployed worker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkWebhookToken, getApp } from './worker'

const WEBHOOK_SECRET = 'test-webhook-secret-value'

function makeEnv(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    TURSO_DB_URL: ':memory:',
    TURSO_AUTH_TOKEN: '',
    GLADIA_API_KEY: 'gladia-key',
    ANTHROPIC_API_KEY: 'anthropic-key',
    WEBHOOK_SECRET,
    BRAIN_BUCKET: {} as R2Bucket,
    BRAIN_INDEX: {} as VectorizeIndex,
    AI: {} as Ai,
    ...overrides,
  }
}

describe('checkWebhookToken', () => {
  it('rejects when WEBHOOK_SECRET is unset — fail loud, not open', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = {
      env: { WEBHOOK_SECRET: '' },
      req: { query: (name: string) => (name === 'token' ? 'anything' : undefined) },
    }

    expect(await checkWebhookToken(c as any)).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('rejects when no token query param is present', async () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: () => undefined },
    }
    expect(await checkWebhookToken(c as any)).toBe(false)
  })

  it('rejects when the token does not match', async () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: (name: string) => (name === 'token' ? 'wrong-token' : undefined) },
    }
    expect(await checkWebhookToken(c as any)).toBe(false)
  })

  it('accepts when the token matches exactly', async () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: (name: string) => (name === 'token' ? WEBHOOK_SECRET : undefined) },
    }
    expect(await checkWebhookToken(c as any)).toBe(true)
  })

  it('rejects a token of different length without throwing', async () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: (name: string) => (name === 'token' ? 'short' : undefined) },
    }
    expect(await checkWebhookToken(c as any)).toBe(false)
  })
})

describe('POST /ingest/callback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 when no token query param is provided', async () => {
    const env = makeEnv()
    const res = await getApp().request(
      '/ingest/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'job-1', status: 'done' }),
      },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token query param is wrong', async () => {
    const env = makeEnv()
    const res = await getApp().request(
      '/ingest/callback?token=not-the-secret',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'job-1', status: 'done' }),
      },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 when WEBHOOK_SECRET is entirely unset, even with a token supplied', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = makeEnv({ WEBHOOK_SECRET: '' })

    const res = await getApp().request(
      '/ingest/callback?token=anything',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'job-1', status: 'done' }),
      },
      env,
    )

    expect(res.status).toBe(401)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('passes through to the existing callback logic when the token is correct', async () => {
    // A minimal payload ({id, status: 'done'} with no `result` field) makes
    // parseGladiaCallback resolve `transcript: null`, which the handler's
    // existing early-return branch reports as a (non-DB-touching) callback
    // error — 200 with `{received: true, error}`. That's fine: this test's
    // job is narrower than exercising the full DB-write path (covered by
    // the `checkWebhookToken` unit tests for the token comparison itself).
    // It proves auth does NOT short-circuit to 401 when the token is
    // correct — the request reaches the real handler at all.
    const env = makeEnv()
    const res = await getApp().request(
      '/ingest/callback?token=' + WEBHOOK_SECRET,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'job-1', status: 'done' }),
      },
      env,
    )

    // Not a 401 — auth passed through to the callback handler.
    expect(res.status).not.toBe(401)
    const json = (await res.json()) as { received: boolean }
    expect(json.received).toBe(true)
  })
})
