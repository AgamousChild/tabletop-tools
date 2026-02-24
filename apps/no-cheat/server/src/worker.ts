import { createWorkerHandler } from '@tabletop-tools/server-core'
import { createClient } from '@libsql/client/web'
import { createDbFromClient } from '@tabletop-tools/db'

import { createServer } from './server'
import { createR2Storage, createNullR2Storage } from './lib/storage/r2'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  EVIDENCE_BUCKET?: {
    put(
      key: string,
      value: ArrayBuffer,
      options?: { httpMetadata?: { contentType: string } },
    ): Promise<unknown>
  }
}

export default createWorkerHandler<Env>({
  createApp: async (env) => {
    const client = createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    })
    const db = createDbFromClient(client)
    const storage = env.EVIDENCE_BUCKET
      ? createR2Storage(env.EVIDENCE_BUCKET, 'https://evidence.tabletop-tools.net')
      : createNullR2Storage()
    return createServer(db, storage)
  },
})
