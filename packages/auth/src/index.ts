import { scryptAsync } from '@noble/hashes/scrypt.js'
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  type Db,
} from '@tabletop-tools/db'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins'
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

/**
 * Minimal shape of a Cloudflare KV namespace binding — just what the
 * rate limiter's secondaryStorage adapter needs. Kept local instead of
 * depending on @cloudflare/workers-types since this package also runs
 * in Node (auth-server's dev server has no KV binding at all).
 */
export interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
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
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
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
  rateLimitKV?: KVLike,
) {
  // Better Auth's default rate limiter is `enabled: isProduction` with
  // `storage: "memory"` unless a secondaryStorage is configured — on
  // Cloudflare Workers, "memory" means a per-isolate Map that is useless
  // (isolates are ephemeral, no shared state). When a KV namespace is
  // provided, back the limiter with it explicitly and turn it on
  // regardless of NODE_ENV. When no KV is provided (local dev, tests),
  // omit both options entirely — unchanged from prior behavior.
  const secondaryStorage: BetterAuthOptions['secondaryStorage'] = rateLimitKV
    ? {
        get: async (key) => (await rateLimitKV.get(key)) ?? undefined,
        set: async (key, value, ttl) => {
          await rateLimitKV.put(key, value, ttl !== undefined ? { expirationTtl: ttl } : undefined)
        },
        delete: async (key) => {
          await rateLimitKV.delete(key)
        },
      }
    : undefined

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
    ...(secondaryStorage ? { secondaryStorage } : {}),
    ...(rateLimitKV ? { rateLimit: { enabled: true, storage: 'secondary-storage' as const } } : {}),
    // When `secondaryStorage` is configured, Better Auth's default is to
    // write sessions to secondary storage ONLY and skip the database
    // (see node_modules/better-auth/dist/db/internal-adapter.mjs — every
    // session write is gated on `!secondaryStorage || session.storeSessionInDatabase`).
    // The app workers (packages/server-core/createBaseServer) validate every
    // request by looking up the session in the DB via validateSession(). If
    // sessions never land in the DB, every authenticated tRPC call returns
    // UNAUTHORIZED even though the cookie is valid at the auth-server. This
    // exact regression shipped when the KV rate limiter (PR #121) was
    // deployed on 2026-07-11 and was rolled back the same evening. Force
    // dual writes so KV acts as a cache in front of the DB, not as a
    // replacement.
    session: { storeSessionInDatabase: true },
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
export async function validateSession(
  db: Db,
  headers: Headers,
  secret: string,
  sessionKV?: KVLike,
): Promise<User | null> {
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

  // Fast path: when sessionKV is provided (the same KV namespace Better Auth
  // uses as `secondaryStorage`), Better Auth writes each session under
  // key=<raw token>, value=JSON({ session, user }). Reading it here avoids a
  // Turso round-trip for every authenticated request. Defense-in-depth: if
  // sessions ever go KV-only again (see createAuth's session.storeSessionInDatabase
  // guard), this keeps the DB lookup from being the sole path.
  if (sessionKV) {
    const kvUser = await lookupSessionInKV(sessionKV, token)
    if (kvUser) return kvUser
  }

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

/**
 * Look up a Better Auth session in KV using the same key/value shape Better
 * Auth writes (see node_modules/better-auth/dist/db/internal-adapter.mjs):
 *
 *   key   = raw token
 *   value = JSON.stringify({ session: {...}, user: {...} })
 *
 * Returns the User if the KV hit is present and the session hasn't expired,
 * null otherwise. Never throws on parse failures — a bad row falls through
 * to the DB lookup instead of blocking auth.
 */
async function lookupSessionInKV(sessionKV: KVLike, token: string): Promise<User | null> {
  try {
    const raw = await sessionKV.get(token)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      session?: { expiresAt?: string | number }
      user?: {
        id?: string
        email?: string
        name?: string
        emailVerified?: boolean
        image?: string | null
        createdAt?: string | number | Date
        updatedAt?: string | number | Date
      }
    }
    const expiresAt = parsed.session?.expiresAt
    if (!expiresAt) return null
    const expiryMs = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number(expiresAt)
    if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) return null
    const u = parsed.user
    if (!u?.id || typeof u.email !== 'string' || typeof u.name !== 'string') return null
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: Boolean(u.emailVerified),
      image: u.image ?? null,
      createdAt: new Date(u.createdAt ?? 0),
      updatedAt: new Date(u.updatedAt ?? 0),
    }
  } catch {
    return null
  }
}
