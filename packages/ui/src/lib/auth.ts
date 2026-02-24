import { createAuthClient as createBetterAuthClient } from 'better-auth/react'

export function createAuthClient(baseURL = 'http://localhost:3000/api/auth') {
  return createBetterAuthClient({ baseURL })
}
