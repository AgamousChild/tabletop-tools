import { createBaseServer } from '@tabletop-tools/server-core'
import type { Db } from '@tabletop-tools/db'

import { appRouter } from './routers/index.js'

export function createServer(db: Db, secret: string) {
  return createBaseServer({
    router: appRouter,
    db,
    secret,
  })
}
