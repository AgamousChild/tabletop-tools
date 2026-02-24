/// <reference types="vite/client" />
import { createTRPCReact } from '@trpc/react-query'
import { createTRPCLinks } from '@tabletop-tools/ui'
import type { AppRouter } from '../../../server/src/routers'

export const trpc = createTRPCReact<AppRouter>()

export function createTRPCClient() {
  return trpc.createClient({
    links: createTRPCLinks(`${import.meta.env.BASE_URL}trpc`),
  })
}
