import { createClient } from '@libsql/client'
import { createDb } from '@tabletop-tools/db'
import { existsSync, unlinkSync } from 'fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuth, validateSession } from './index'

const TEST_DB = `test-auth-${Date.now()}.db`
const TEST_DB_URL = `file:./${TEST_DB}`

const AUTH_SECRET = 'dev-secret-change-in-production'

let auth: ReturnType<typeof createAuth>
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
  auth = createAuth(db)
})

afterAll(() => {
  try {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  } catch {
    // File may still be locked by Better Auth's internal client on Windows
  }
})

// Better Auth uses cookies for session management. Returns the cookie string
// to pass to subsequent requests.
async function signIn(email: string, password: string) {
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  })
  const setCookie = response.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0] ?? '' // "better-auth.session_token=XYZ"
  const data = (await response.json()) as { token: string; user: { email: string } }
  return { token: data.token, cookie }
}

describe('register', () => {
  it('creates a user and returns a token', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      },
    })

    expect(result.user).toBeDefined()
    expect(result.user.email).toBe('test@example.com')
    expect(result.token).toBeDefined()
  })

  it('rejects a duplicate email', async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          name: 'Duplicate',
          email: 'test@example.com',
          password: 'password123',
          username: 'duplicate',
        },
      }),
    ).rejects.toThrow()
  })
})

describe('login', () => {
  it('returns a token for valid credentials', async () => {
    const result = await auth.api.signInEmail({
      body: { email: 'test@example.com', password: 'password123' },
    })

    expect(result.user.email).toBe('test@example.com')
    expect(result.token).toBeDefined()
  })

  it('rejects a wrong password', async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: 'test@example.com', password: 'wrongpassword' },
      }),
    ).rejects.toThrow()
  })

  it('rejects an unknown email', async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: 'nobody@example.com', password: 'password123' },
      }),
    ).rejects.toThrow()
  })
})

describe('getSession', () => {
  it('returns the user for a valid session cookie', async () => {
    const { cookie } = await signIn('test@example.com', 'password123')

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    })

    expect(session?.user.email).toBe('test@example.com')
  })

  it('returns null for an invalid token', async () => {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: 'better-auth.session_token=invalid-xyz' }),
    })

    expect(session).toBeNull()
  })
})

describe('validateSession', () => {
  it('returns the user for a valid session cookie', async () => {
    const { cookie } = await signIn('test@example.com', 'password123')
    const user = await validateSession(db, new Headers({ cookie }), AUTH_SECRET)

    expect(user).not.toBeNull()
    expect(user?.email).toBe('test@example.com')
    expect(user?.id).toBeDefined()
    expect(user?.name).toBeDefined()
  })

  it('returns null for an invalid token', async () => {
    const user = await validateSession(
      db,
      new Headers({ cookie: 'better-auth.session_token=invalid-xyz' }),
      AUTH_SECRET,
    )
    expect(user).toBeNull()
  })

  it('returns null when no cookie is present', async () => {
    const user = await validateSession(db, new Headers(), AUTH_SECRET)
    expect(user).toBeNull()
  })
})

describe('logout', () => {
  it('invalidates the session', async () => {
    const { cookie } = await signIn('test@example.com', 'password123')

    await auth.api.signOut({
      headers: new Headers({ cookie }),
    })

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    })

    expect(session).toBeNull()
  })
})

// ============================================================
// V2: HMAC signature verification
// ============================================================

describe('validateSession with HMAC verification', () => {
  it('accepts a valid signed cookie when secret is provided', async () => {
    const { cookie } = await signIn('test@example.com', 'password123')
    const user = await validateSession(db, new Headers({ cookie }), AUTH_SECRET)

    expect(user).not.toBeNull()
    expect(user?.email).toBe('test@example.com')
  })

  it('rejects a cookie with tampered signature', async () => {
    const { cookie } = await signIn('test@example.com', 'password123')
    // Flip the last character of the cookie to tamper with the HMAC
    const lastChar = cookie.charAt(cookie.length - 1)
    const tampered = cookie.slice(0, -1) + (lastChar === '0' ? '1' : '0')

    const user = await validateSession(db, new Headers({ cookie: tampered }), AUTH_SECRET)
    expect(user).toBeNull()
  })

  it('rejects a cookie with no signature separator', async () => {
    const user = await validateSession(
      db,
      new Headers({ cookie: 'better-auth.session_token=noseparator' }),
      AUTH_SECRET,
    )
    expect(user).toBeNull()
  })

  it('rejects a cookie signed with wrong secret', async () => {
    const { cookie } = await signIn('test@example.com', 'password123')
    const user = await validateSession(db, new Headers({ cookie }), 'wrong-secret-entirely')

    expect(user).toBeNull()
  })

})

// ============================================================
// V2: Expanded User type
// ============================================================

describe('validateSession returns expanded User', () => {
  it('includes all canonical User fields', async () => {
    const { cookie } = await signIn('test@example.com', 'password123')
    const user = await validateSession(db, new Headers({ cookie }), AUTH_SECRET)

    expect(user).not.toBeNull()
    expect(user?.id).toBeTypeOf('string')
    expect(user?.email).toBe('test@example.com')
    expect(user?.name).toBe('Test User')
    expect(user?.emailVerified).toBe(false)
    expect(user?.image).toBeNull()
    expect(user?.createdAt).toBeInstanceOf(Date)
    expect(user?.updatedAt).toBeInstanceOf(Date)
  })
})
