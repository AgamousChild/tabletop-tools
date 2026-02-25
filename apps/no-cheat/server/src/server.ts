import { createBaseServer } from '@tabletop-tools/server-core'
import type { Db } from '@tabletop-tools/db'

import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'
import type { R2Storage } from './lib/storage/r2.js'

export function createServer(db: Db, storage: R2Storage, secret: string) {
  return createBaseServer<Context>({
    router: appRouter,
    db,
    secret,
    extendContext: (ctx) => ({ ...ctx, storage }),
  })
}
