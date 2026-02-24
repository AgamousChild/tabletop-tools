import { createBaseServer } from '@tabletop-tools/server-core'
import { validateSession } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'
import type { GameContentAdapter } from '@tabletop-tools/game-content'

import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'

export function createServer(db: Db, gameContent: GameContentAdapter) {
  return createBaseServer<Context>({
    router: appRouter,
    createContext: async (req) => ({
      user: await validateSession(db, req.headers),
      req,
      db,
      gameContent,
    }),
  })
}
