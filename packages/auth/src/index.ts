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
import { and, eq, gt } from 'drizzle-orm'

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
