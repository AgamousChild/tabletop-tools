import { createBaseServer } from '@tabletop-tools/server-core'
import { validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'

import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'
import type { R2Storage } from './lib/storage/r2.js'

export function createServer(db: Db, storage: R2Storage) {
  return createBaseServer<Context>({
    router: appRouter,
    createContext: async (req) => ({
      user: await validateSession(db, req.headers),
      req,
      db,
      storage,
    }),
  })
}
