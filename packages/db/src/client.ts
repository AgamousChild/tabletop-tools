import { createClient, type Client, type Config } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export function createDbFromClient(client: Client) {
  return drizzle(client, { schema })
}

export function createDb(config: Config) {
  const client = createClient(config)
  return createDbFromClient(client)
}

export type Db = ReturnType<typeof createDb>
