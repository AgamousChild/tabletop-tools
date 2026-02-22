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

export function createAuth(
  db: Db,
  baseURL = 'http://localhost:3001',
  trustedOrigins: string[] = [],
) {
  return betterAuth({
    baseURL,
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
    secret: process.env['AUTH_SECRET'] ?? 'dev-secret-change-in-production',
  })
}

export type Auth = ReturnType<typeof createAuth>
