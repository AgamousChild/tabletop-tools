import { createBaseServer } from '@tabletop-tools/server-core'
import type { Db } from '@tabletop-tools/db'

import { appRouter } from './routers'
import type { Context } from './trpc'

export function createServer(db: Db, secret: string) {
  return createBaseServer<Context>({
    router: appRouter,
    db,
    secret,
  })
}
