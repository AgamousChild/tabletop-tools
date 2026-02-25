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

/** Constant-time comparison to prevent timing attacks. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
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
  // V2: Timing-safe comparison — prevents character-by-character timing attacks
  const derivedBytes = hexDecode(hexEncode(key))
  const storedBytes = hexDecode(storedKey)
  return timingSafeEqual(derivedBytes, storedBytes)
}

/**
 * Verify the HMAC-SHA256 signature on a Better Auth signed cookie.
 * Format: `{token}.{base64_signature}` (44-char Base64, ends with '=')
 * Returns the raw token if valid, null if invalid.
 * Uses Web Crypto API for Node.js and Cloudflare Workers compatibility.
 */
async function verifySignature(signedValue: string, secret: string): Promise<string | null> {
  const lastDot = signedValue.lastIndexOf('.')
  if (lastDot <= 0) return null

  const token = signedValue.substring(0, lastDot)
  const signature = signedValue.substring(lastDot + 1)
  if (!token || !signature) return null

  // Better Auth Base64 signatures are always 44 chars (32 bytes HMAC-SHA256)
  if (signature.length !== 44 || !signature.endsWith('=')) return null

  let sigBytes: Uint8Array
  try {
    const bin = atob(signature)
    sigBytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) {
      sigBytes[i] = bin.charCodeAt(i)
    }
  } catch {
    return null // Invalid Base64
  }

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const expectedBuf = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(token)))

  if (!timingSafeEqual(sigBytes, expectedBuf)) return null

  return token
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

/** Canonical User type for all tRPC contexts. */
export type User = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Validate a session from request headers.
 *
 * Reads the better-auth.session_token cookie, looks it up in the shared DB,
 * and returns the user if the session exists and has not expired.
 *
 * App servers call this instead of running their own auth instance.
 * The central auth-server (apps/auth-server) handles all auth routes.
 *
 * @param secret - AUTH_SECRET for HMAC verification (required).
 */
export async function validateSession(db: Db, headers: Headers, secret: string): Promise<User | null> {
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

  const token = await verifySignature(signedToken, secret)
  if (!token) return null

  const [row] = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      emailVerified: authUsers.emailVerified,
      image: authUsers.image,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
    })
    .from(authSessions)
    .innerJoin(authUsers, eq(authSessions.userId, authUsers.id))
    .where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())))
    .limit(1)

  return row ?? null
}
