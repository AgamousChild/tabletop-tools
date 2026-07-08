import { createRequire } from 'node:module'

import type { Client } from '@libsql/client'
import type * as DrizzleKitApi from 'drizzle-kit/api'

// drizzle-kit's ESM build (api.mjs) throws "Dynamic require of 'fs' is not
// supported" when transformed by Vite/Vitest; require() the CJS build natively
// instead so Node resolves its internal requires.
const require = createRequire(import.meta.url)
const { generateSQLiteDrizzleJson, generateSQLiteMigration } =
  require('drizzle-kit/api') as typeof DrizzleKitApi

/**
 * Create tables (and their indexes) in a test database directly from Drizzle
 * schema objects, so test DDL can never drift from schema.ts — hand-rolled
 * CREATE TABLE fixtures broke 16 crosswalk tests when content_entity gained
 * can_deploy_solo.
 *
 * Test-only. Deep-import it:
 *   import { createTestTables } from '@tabletop-tools/db/src/test-ddl'
 * Never re-export from index.ts or import in Worker code — drizzle-kit would
 * land in the Worker bundle.
 *
 * Pass every table the test touches INCLUDING FK targets (e.g. contentEntity
 * references dimDataslate); with PRAGMA foreign_keys = ON, writes against a
 * missing referenced table fail.
 */
export async function createTestTables(
  client: Client,
  tables: Record<string, unknown>,
): Promise<void> {
  const statements = await generateSQLiteMigration(
    await generateSQLiteDrizzleJson({}),
    await generateSQLiteDrizzleJson(tables),
  )
  for (const statement of statements) {
    await client.execute(statement)
  }
}
