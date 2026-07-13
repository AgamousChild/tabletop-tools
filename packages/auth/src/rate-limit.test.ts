import { createClient } from '@libsql/client'
import { createDb } from '@tabletop-tools/db'
import { existsSync, unlinkSync } from 'fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createAuth } from './index'

/**
 * In-memory fake KV implementing the minimal shape createAuth expects
 * (get/put/delete with expirationTtl) — modeled on Cloudflare's KVNamespace.
 * Real TTL expiry isn't required for these tests since Better Auth's
 * sign-in rate limit window (10s) outlives the test run.
 */
class FakeKV {
  private store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

const TEST_DB = `test-auth-rate-limit-${Date.now()}.db`
const TEST_DB_URL = `file:./${TEST_DB}`

let db: ReturnType<typeof createDb>

beforeAll(async () => {
  const setup = createClient({ url: TEST_DB_URL })

  await setup.execute(`CREATE TABLE "user" (
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

  await setup.execute(`CREATE TABLE "session" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await setup.execute(`CREATE TABLE "account" (
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

  await setup.execute(`CREATE TABLE "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
  )`)

  setup.close()

  db = createDb({ url: TEST_DB_URL })
})

afterAll(() => {
  try {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  } catch {
    // File may still be locked by Better Auth's internal client on Windows
  }
})

describe('createAuth without KV (unchanged behavior)', () => {
  it('creates an auth instance and allows sign-up without a rate limit config', async () => {
    const auth = createAuth(db)

    const result = await auth.api.signUpEmail({
      body: {
        name: 'No KV User',
        email: 'no-kv@example.com',
        password: 'password123',
        username: 'nokvuser',
      },
    })

    expect(result.user).toBeDefined()
    expect(result.user.email).toBe('no-kv@example.com')
  })

  it('does not rate-limit repeated sign-in attempts (no secondary storage configured)', async () => {
    const auth = createAuth(db)

    // Better Auth's default in-memory rate limiter is disabled outside of
    // production and createAuth does not set NODE_ENV, so repeated attempts
    // should never surface a 429 in this path.
    for (let i = 0; i < 5; i++) {
      await expect(
        auth.api.signInEmail({
          body: { email: 'no-kv@example.com', password: 'wrongpassword' },
        }),
      ).rejects.toThrow()
    }
  })
})

describe('createAuth with KV-backed rate limiting', () => {
  let kv: FakeKV

  beforeEach(() => {
    kv = new FakeKV()
  })

  // Better Auth only applies the rate-limit middleware to requests that go
  // through the router (auth.handler) — server-side auth.api.* calls bypass
  // the router entirely, so these tests drive real HTTP requests, matching
  // how apps/auth-server actually invokes Better Auth (auth.handler(c.req.raw)).
  function signInRequest(email: string, password: string) {
    return new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  }

  it('rate-limits repeated sign-in attempts beyond the limit (429)', async () => {
    const auth = createAuth(db, undefined, undefined, undefined, undefined, kv)

    await auth.api.signUpEmail({
      body: {
        name: 'Rate Limited User',
        email: 'rate-limited@example.com',
        password: 'password123',
        username: 'ratelimiteduser',
      },
    })

    // Better Auth's default special rule for /sign-in paths: window=10s, max=3.
    const responses: Response[] = []
    for (let i = 0; i < 5; i++) {
      responses.push(await auth.handler(signInRequest('rate-limited@example.com', 'wrongpassword')))
    }

    const statuses = responses.map((r) => r.status)
    expect(statuses).toContain(429)
  })

  it('persists rate limit counters in the provided KV store', async () => {
    const auth = createAuth(db, undefined, undefined, undefined, undefined, kv)

    await auth.api.signUpEmail({
      body: {
        name: 'KV Persist User',
        email: 'kv-persist@example.com',
        password: 'password123',
        username: 'kvpersistuser',
      },
    })

    await auth.handler(signInRequest('kv-persist@example.com', 'wrongpassword'))

    // The rate limiter should have written at least one key into the KV store.
    const keys = Array.from((kv as unknown as { store: Map<string, string> }).store.keys())
    expect(keys.length).toBeGreaterThan(0)
  })

  // Regression: PR #121 wired `secondaryStorage` into createAuth() to back
  // the rate limiter with KV. Better Auth's default when `secondaryStorage`
  // is present is to write NEW sessions to secondary storage only and skip
  // the DB (see internal-adapter.mjs: every session write is gated on
  // `!secondaryStorage || options.session.storeSessionInDatabase`).
  // The app workers' `validateSession()` looks up sessions in the DB, so
  // KV-only sessions produce UNAUTHORIZED on every authenticated tRPC call.
  // createAuth() sets `session.storeSessionInDatabase: true` to force dual
  // writes; this test locks that in.
  it('writes new sessions to the database even with KV secondary storage', async () => {
    const auth = createAuth(db, undefined, undefined, undefined, undefined, kv)

    const email = `session-in-db-${Date.now()}@example.com`
    const signUp = await auth.api.signUpEmail({
      body: {
        name: 'Session In DB',
        email,
        password: 'password123',
        username: `sessioninbd${Date.now()}`,
      },
    })

    expect(signUp.token).toBeDefined()

    // Query the raw session table — this is exactly what validateSession()
    // does in production. Row must exist with the token returned by signUp.
    const rows = await db.$client.execute({
      sql: 'SELECT token FROM session WHERE token = ?',
      args: [signUp.token],
    })
    expect(rows.rows).toHaveLength(1)
  })
})
