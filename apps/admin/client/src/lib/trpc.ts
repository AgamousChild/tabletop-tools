/// <reference types="vite/client" />
import { createTRPCLinks } from '@tabletop-tools/ui'
import { createTRPCReact } from '@trpc/react-query'

import type { AppRouter } from '../../../server/src/routers/index.js'

export const trpc = createTRPCReact<AppRouter>()

export function createTRPCClient() {
  return trpc.createClient({
    links: createTRPCLinks(`${import.meta.env.BASE_URL}trpc`),
  })
}
