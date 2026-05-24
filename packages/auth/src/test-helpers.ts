/**
 * Shared test helpers for HTTP integration tests that exercise
 * the full session cookie → validateSession → protectedProcedure path.
 *
 * Usage in an app's server.test.ts:
 *
 *   import { setupAuthTables, TEST_TOKEN, EXPIRED_TOKEN } from '@tabletop-tools/auth/src/test-helpers'
 *
 *   const client = createClient({ url: ':memory:' })
 *   const db = createDbFromClient(client)
 *
 *   beforeAll(async () => {
 *     await setupAuthTables(client)
 *     await client.executeMultiple(`... app-specific tables ...`)
 *   })
 *
 * IMPORTANT: These helpers only work with in-memory SQLite (url: ':memory:').
 * They must never be used against a production database.
 */
import type { Client } from '@libsql/client'
import { randomBytes } from 'crypto'

/** Generate a unique ID per test run to avoid cross-run collisions */
function testId(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`
}

export const TEST_SECRET = `test-secret-${randomBytes(8).toString('hex')}`
export const TEST_TOKEN = `test-token-${randomBytes(8).toString('hex')}`
export const TEST_TOKEN_2 = `test-token2-${randomBytes(8).toString('hex')}`
export const EXPIRED_TOKEN = `expired-token-${randomBytes(8).toString('hex')}`
export const TEST_USER = {
  id: testId('user'),
  name: 'Test User 1',
  email: `test-${randomBytes(4).toString('hex')}@test.local`,
} as const
export const TEST_USER_2 = {
  id: testId('user'),
  name: 'Test User 2',
  email: `test-${randomBytes(4).toString('hex')}@test.local`,
} as const

/**
 * Creates auth tables (user + session) and inserts test users.
 * ONLY for in-memory SQLite — never call against a real database.
 */
export async function setupAuthTables(client: Client) {
  const now = Math.floor(Date.now() / 1000)
  const future = now + 86400
  const past = now - 86400

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
    CREATE TABLE IF NOT EXISTS "session" (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${TEST_USER.id}', '${TEST_USER.name}', '${TEST_USER.email}', 0, ${now}, ${now});

    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${TEST_USER_2.id}', '${TEST_USER_2.name}', '${TEST_USER_2.email}', 0, ${now}, ${now});

    INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at)
    VALUES ('${testId('sess')}', '${TEST_USER.id}', '${TEST_TOKEN}', ${future}, ${now}, ${now});

    INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at)
    VALUES ('${testId('sess')}', '${TEST_USER_2.id}', '${TEST_TOKEN_2}', ${future}, ${now}, ${now});

    INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at)
    VALUES ('${testId('sess')}', '${TEST_USER.id}', '${EXPIRED_TOKEN}', ${past}, ${now}, ${now});
  `)
}

/**
 * Helper to make HTTP requests through a Hono app with optional session cookie.
 */
export function createRequestHelper(
  appFactory: () => { fetch: (req: Request) => Response | Promise<Response> },
) {
  return function makeRequest(
    path: string,
    opts: { cookie?: string; method?: string; body?: unknown } = {},
  ) {
    const app = appFactory()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (opts.cookie) headers['Cookie'] = opts.cookie

    return app.fetch(
      new Request(`http://localhost${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      }),
    )
  }
}

/** Sign a token with HMAC-SHA256 (same format as Better Auth) */
async function signToken(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(token)))
  const b64 = btoa(String.fromCharCode(...sig))
  return `${token}.${b64}`
}

/** Cookie string for authenticated requests (HMAC-signed) */
export async function authCookie(
  token: string = TEST_TOKEN,
  secret: string = TEST_SECRET,
): Promise<string> {
  const signed = await signToken(token, secret)
  return `better-auth.session_token=${signed}`
}
