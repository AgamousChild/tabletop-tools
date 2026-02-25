import { createWorkerHandler } from '@tabletop-tools/server-core'
import { createClient } from '@libsql/client/web'
import { createDbFromClient } from '@tabletop-tools/db'

import { createServer } from './server'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  AUTH_SECRET: string
}

export default createWorkerHandler<Env>({
  createApp: async (env) => {
    const client = createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    })
    const db = createDbFromClient(client)
    return createServer(db, env.AUTH_SECRET)
  },
})
