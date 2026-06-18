import type { Db } from '@tabletop-tools/db'
import { createBaseServer } from '@tabletop-tools/server-core'

import { appRouter } from './routers'

export function createServer(db: Db, secret: string) {
  return createBaseServer({
    router: appRouter,
    db,
    secret,
  })
}
