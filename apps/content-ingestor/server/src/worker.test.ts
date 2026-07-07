/**
 * Worker-level tests for the Gladia webhook callback authentication.
 *
 * POST /ingest/callback is the only non-/health route that isn't gated by
 * `checkAuth` (Bearer-token auth for internal admin calls) — it's a public
 * webhook that Gladia (an external transcription API) calls back on. Without
 * a shared-secret check, anyone who discovers the callback URL can POST a
 * forged `{id, status: 'done', result: {...}}` payload and have it written
 * straight into `ingestContent.transcript`, which later feeds the public
 * brain knowledge base. `checkWebhookToken` closes that gap with a
 * query-param shared secret, verified via constant-time comparison, and
 * fails loud (401) when `WEBHOOK_SECRET` itself is unset — unlike the
 * existing `checkAuth`, which permissively allows everything when
 * `SYNC_SECRET` is unset. That permissive fallback is wrong for a public
 * external webhook: better to break Gladia callbacks loudly than silently
 * accept forged transcripts.
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
  it('rejects when WEBHOOK_SECRET is unset — fail loud, not open', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = {
      env: { WEBHOOK_SECRET: '' },
      req: { query: (name: string) => (name === 'token' ? 'anything' : undefined) },
    }

    expect(checkWebhookToken(c as any)).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('rejects when no token query param is present', () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: () => undefined },
    }
    expect(checkWebhookToken(c as any)).toBe(false)
  })

  it('rejects when the token does not match', () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: (name: string) => (name === 'token' ? 'wrong-token' : undefined) },
    }
    expect(checkWebhookToken(c as any)).toBe(false)
  })

  it('accepts when the token matches exactly', () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: (name: string) => (name === 'token' ? WEBHOOK_SECRET : undefined) },
    }
    expect(checkWebhookToken(c as any)).toBe(true)
  })

  it('rejects a token of different length without throwing', () => {
    const c = {
      env: { WEBHOOK_SECRET },
      req: { query: (name: string) => (name === 'token' ? 'short' : undefined) },
    }
    expect(checkWebhookToken(c as any)).toBe(false)
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
