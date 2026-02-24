import { createBaseServer } from '@tabletop-tools/server-core'
import { validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'

import { appRouter } from './routers'
import type { Context } from './trpc'

export function createServer(db: Db) {
  return createBaseServer<Context>({
    router: appRouter,
    createContext: async (req) => ({
      user: await validateSession(db, req.headers),
      req,
      db,
    }),
  })
}
