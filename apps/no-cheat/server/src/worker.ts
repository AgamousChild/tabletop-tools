import { createClient } from '@libsql/client/web'
import { createDbFromClient } from '@tabletop-tools/db'
import { createWorkerHandler } from '@tabletop-tools/server-core'

import { createNullR2Storage, createR2Storage } from './lib/storage/r2'
import { createServer } from './server'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  AUTH_SECRET: string
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
    return createServer(db, storage, env.AUTH_SECRET)
  },
})
