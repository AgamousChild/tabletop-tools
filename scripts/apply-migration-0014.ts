/**
 * One-off: apply migration 0014 (add source_list_id column to meta_event_players).
 *
 *   npx tsx scripts/apply-migration-0014.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createClient } from '@libsql/client'

function loadEnv(): void {
  const p = join(process.cwd(), '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]!
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    if (!process.env[m[1]!]) process.env[m[1]!] = v
  }
}
loadEnv()

async function main(): Promise<void> {
  const url = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    console.error('TURSO_DB_URL / TURSO_AUTH_TOKEN missing')
    process.exit(1)
  }
  const client = createClient({ url, authToken })

  try {
    await client.execute('ALTER TABLE meta_event_players ADD COLUMN source_list_id text')
    console.log('Column added: meta_event_players.source_list_id')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      console.log('Column already exists: meta_event_players.source_list_id (idempotent skip)')
    } else {
      throw e
    }
  }

  const cols = await client.execute('PRAGMA table_info(meta_event_players)')
  const listCols = cols.rows.filter((r) => String(r.name).includes('list'))
  console.log('list-related columns:', listCols.map((r) => r.name).join(', '))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
