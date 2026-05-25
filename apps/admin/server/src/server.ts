import type { Db } from '@tabletop-tools/db'
import { createBaseServer } from '@tabletop-tools/server-core'

import { appRouter } from './routers/index.js'
import type { Context } from './trpc.js'

export function createServer(
  db: Db,
  adminEmails: string[],
  secret: string,
  bcpScraper?: { fetch(request: Request): Promise<Response> },
  contentIngestor?: { fetch(request: Request): Promise<Response> },
) {
  return createBaseServer<Context>({
    router: appRouter,
    db,
    secret,
    extendContext: (ctx) => ({ ...ctx, adminEmails, bcpScraper, contentIngestor }),
  })
}
