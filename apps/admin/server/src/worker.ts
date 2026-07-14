import { createClient } from '@libsql/client/web'
import type { KVLike } from '@tabletop-tools/auth'
import { createDbFromClient } from '@tabletop-tools/db'
import { createWorkerHandler } from '@tabletop-tools/server-core'

import { createServer } from './server'
import type { AiBinding } from './trpc'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  AUTH_SECRET: string
  AUTH_RATE_LIMIT?: KVLike
  /**
   * Bearer token attached to every service-binding call this worker
   * makes to `tabletop-tools-bcp-scraper` and `tabletop-tools-content-ingestor`.
   * Must equal the SYNC_SECRET set on those workers. When unset, service
   * calls go without the header — targets that fail-closed on missing
   * secret will 401.
   */
  SYNC_SECRET?: string
  ADMIN_EMAILS: string
  BCP_SCRAPER?: { fetch(request: Request): Promise<Response> }
  CONTENT_INGESTOR?: { fetch(request: Request): Promise<Response> }
  AI?: AiBinding
}

export default createWorkerHandler<Env>({
  createApp: async (env) => {
    const client = createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    })
    const db = createDbFromClient(client)
    const adminEmails = (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    return createServer(
      db,
      adminEmails,
      env.AUTH_SECRET,
      env.BCP_SCRAPER,
      env.CONTENT_INGESTOR,
      env.AI,
      env.AUTH_RATE_LIMIT,
      env.SYNC_SECRET,
    )
  },
})
