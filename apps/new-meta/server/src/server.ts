import type { KVLike } from '@tabletop-tools/auth'
import type { Db } from '@tabletop-tools/db'
import { createBaseServer } from '@tabletop-tools/server-core'

import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'

export function createServer(
  db: Db,
  adminEmails: string[] = [],
  secret: string,
  sessionKV?: KVLike,
) {
  return createBaseServer<Context>({
    router: appRouter,
    db,
    secret,
    sessionKV,
    extendContext: (ctx) => ({ ...ctx, adminEmails }),
  })
}
