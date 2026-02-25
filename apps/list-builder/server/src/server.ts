import { createBaseServer } from '@tabletop-tools/server-core'
import type { Db } from '@tabletop-tools/db'
import type { GameContentAdapter } from '@tabletop-tools/game-content'

import { appRouter } from './routers'
import type { Context } from './trpc'

export function createServer(db: Db, gameContent: GameContentAdapter, secret: string) {
  return createBaseServer<Context>({
    router: appRouter,
    db,
    secret,
    extendContext: (ctx) => ({ ...ctx, gameContent }),
  })
}
