/**
 * Apply a migration file from packages/db/migrations to the configured Turso DB.
 *
 * Statement-by-statement and idempotent: "duplicate column" / "already exists"
 * are treated as already-applied and skipped, so re-running is safe. Anything
 * else aborts so a genuine failure is not mistaken for a no-op.
 *
 *   npx tsx scripts/apply-migration.ts 0015_detachment_combos
 *   npx tsx scripts/apply-migration.ts 0015_detachment_combos --dry-run
 *
 * Replaces the per-migration one-offs (apply-migration-0014.ts).
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

/** Strip -- comments and split on ';' into executable statements. */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

const ALREADY_APPLIED = ['duplicate column', 'already exists']

async function main(): Promise<void> {
  const name = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!name) {
    console.error('usage: apply-migration.ts <migration-name-without-.sql> [--dry-run]')
    process.exit(1)
  }

  const path = join(process.cwd(), 'packages', 'db', 'migrations', `${name}.sql`)
  if (!existsSync(path)) {
    console.error(`migration not found: ${path}`)
    process.exit(1)
  }

  const statements = splitStatements(readFileSync(path, 'utf-8'))
  console.log(`${name}: ${statements.length} statements`)

  if (dryRun) {
    statements.forEach((s, i) => console.log(`\n[${i + 1}]\n${s}`))
    console.log('\nDry run — nothing executed.')
    return
  }

  const url = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url) {
    console.error('TURSO_DB_URL missing')
    process.exit(1)
  }
  const client = createClient({ url, authToken })

  let applied = 0
  let skipped = 0

  for (const [i, stmt] of statements.entries()) {
    const label = stmt.replace(/\s+/g, ' ').slice(0, 78)
    try {
      await client.execute(stmt)
      applied++
      console.log(`  [${i + 1}] OK    ${label}`)
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
      if (ALREADY_APPLIED.some((frag) => msg.includes(frag))) {
        skipped++
        console.log(`  [${i + 1}] SKIP  ${label}  (already applied)`)
      } else {
        console.error(`  [${i + 1}] FAIL  ${label}`)
        throw e
      }
    }
  }

  console.log(`\napplied=${applied} skipped=${skipped}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
