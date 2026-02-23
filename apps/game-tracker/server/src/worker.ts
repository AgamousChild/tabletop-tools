import { createClient } from '@libsql/client/web'
import { createDbFromClient } from '@tabletop-tools/db'

import { createServer } from './server'
import { createNullR2Storage } from './lib/storage/r2'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    })
    const db = createDbFromClient(client)
    const storage = createNullR2Storage()
    const app = createServer(db, storage)
    return app.fetch(request)
  },
}
