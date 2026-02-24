/// <reference types="vite/client" />
import { createAuthClient } from '@tabletop-tools/ui'

const AUTH_SERVER_URL =
  typeof window !== 'undefined'
    ? (import.meta.env['VITE_AUTH_SERVER_URL'] as string | undefined) ?? 'http://localhost:3000/api/auth'
    : 'http://localhost:3000/api/auth'

export const authClient = createAuthClient(AUTH_SERVER_URL)
export const { useSession, signIn, signOut, signUp } = authClient
