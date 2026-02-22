import { createAuthClient } from 'better-auth/react'

const AUTH_SERVER_URL =
  typeof window !== 'undefined'
    ? (import.meta.env['VITE_AUTH_SERVER_URL'] as string | undefined) ?? 'http://localhost:3000'
    : 'http://localhost:3000'

export const authClient = createAuthClient({
  baseURL: AUTH_SERVER_URL,
})
