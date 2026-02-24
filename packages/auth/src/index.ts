import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  type Db,
} from '@tabletop-tools/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { and, eq, gt } from 'drizzle-orm'

// Lighter scrypt params that fit within Cloudflare Workers CPU limits.
// Default better-auth uses r=16 which exceeds Workers' ~30ms CPU budget.
const SCRYPT = { N: 16384, r: 8, p: 1, dkLen: 64 } as const

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

async function hashPassword(password: string): Promise<string> {
  const salt = hexEncode(crypto.getRandomValues(new Uint8Array(16)))
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    dkLen: SCRYPT.dkLen,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  })
  return `${salt}:${hexEncode(key)}`
}

async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const [salt, storedKey] = data.hash.split(':')
  if (!salt || !storedKey) return false
  const key = await scryptAsync(data.password.normalize('NFKC'), salt, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    dkLen: SCRYPT.dkLen,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  })
  return hexEncode(key) === storedKey
}

export function createAuth(
  db: Db,
  baseURL = 'http://localhost:3000',
  trustedOrigins: string[] = [],
  secret = process.env['AUTH_SECRET'] ?? 'dev-secret-change-in-production',
  basePath = '/api/auth',
) {
  return betterAuth({
    baseURL,
    basePath,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    plugins: [username()],
    secret,
  })
}

export type Auth = ReturnType<typeof createAuth>

export type User = {
  id: string
  email: string
  name: string
}

/**
 * Validate a session from request headers.
 *
 * Reads the better-auth.session_token cookie, looks it up in the shared DB,
 * and returns the user if the session exists and has not expired.
 *
 * App servers call this instead of running their own auth instance.
 * The central auth-server (apps/auth-server) handles all auth routes.
 */
export async function validateSession(db: Db, headers: Headers): Promise<User | null> {
  const cookieHeader = headers.get('cookie') ?? ''
  // Better Auth uses '__Secure-better-auth.session_token' on HTTPS (production)
  // and 'better-auth.session_token' on HTTP (local dev)
  const cookies = cookieHeader.split(';').map((c) => c.trim())
  const tokenEntry =
    cookies.find((c) => c.startsWith('__Secure-better-auth.session_token=')) ??
    cookies.find((c) => c.startsWith('better-auth.session_token='))

  if (!tokenEntry) return null

  // Use indexOf to split only on the first '=' — signed cookie value may contain '='
  const signedToken = decodeURIComponent(tokenEntry.slice(tokenEntry.indexOf('=') + 1))
  if (!signedToken) return null

  // Better Auth signed cookie format: <raw_token>.<hmac_sha256_signature>
  // The DB stores only the raw token — strip the trailing signature
  const lastDot = signedToken.lastIndexOf('.')
  const token = lastDot > 0 ? signedToken.substring(0, lastDot) : signedToken

  const [row] = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
    })
    .from(authSessions)
    .innerJoin(authUsers, eq(authSessions.userId, authUsers.id))
    .where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())))
    .limit(1)

  return row ?? null
}
