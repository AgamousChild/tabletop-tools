import { createBaseServer } from '@tabletop-tools/server-core'
import { validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'

import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'

export function createServer(db: Db, adminEmails: string[] = []) {
  return createBaseServer<Context>({
    router: appRouter,
    createContext: async (req) => ({
      user: await validateSession(db, req.headers),
      req,
      db,
      adminEmails,
    }),
  })
}
