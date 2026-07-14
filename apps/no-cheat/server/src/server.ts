import type { KVLike } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'
import { createBaseServer } from '@tabletop-tools/server-core'

import type { R2Storage } from './lib/storage/r2.js'
import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'

export function createServer(db: Db, storage: R2Storage, secret: string, sessionKV?: KVLike) {
  return createBaseServer<Context>({
    router: appRouter,
    db,
    secret,
    sessionKV,
    extendContext: (ctx) => ({ ...ctx, storage }),
  })
}
