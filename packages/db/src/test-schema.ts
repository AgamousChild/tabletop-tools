/**
 * Build the real schema in an in-memory SQLite database by applying the
 * committed migrations in order.
 *
 * WHY THIS EXISTS: eight test files each hand-rolled their own
 * `CREATE TABLE meta_event_players (...)`, so every column added to a shared
 * table silently broke whichever of them happened to exercise the shared
 * writer. That cost two rounds of CI breakage in a single day —
 * `source_list_id`, then `combo_id` — with CI the only thing catching it. A
 * hand-maintained copy of a schema is a copy that drifts, and per the root
 * CLAUDE.md a mock that passes while the real thing fails is worse than no
 * test at all.
 *
 * Why the migrations rather than codegen from schema.ts: drizzle-kit 0.30.6's
 * programmatic api bundle throws `Dynamic require of "fs" is not supported`
 * under Vitest, tsx, and plain node alike, and its CJS build is not reachable
 * through the package's exports map. The migrations are real SQL that
 * production already ran, `drizzle-kit check` keeps them in step with
 * schema.ts, and applying them here exercises the chain as a bonus.
 *
 * Not re-exported from index.ts on purpose — it reads from disk, which has no
 * place in a Worker bundle. Import the source path directly, matching the
 * existing convention for `@tabletop-tools/auth/src/test-helpers`:
 *
 *   import { applyTestSchema } from '@tabletop-tools/db/src/test-schema'
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Client } from '@libsql/client'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

let cached: string[] | null = null

/** Split a migration file into executable statements, dropping -- comments. */
function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:--> statement-breakpoint)?/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Every statement from every migration, in filename order. Cached — the set
 * cannot change within a test run.
 */
export function schemaStatements(): string[] {
  if (cached) return cached
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const out: string[] = []
  for (const file of files) {
    out.push(...splitStatements(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')))
  }
  cached = out
  return out
}

export interface ApplyTestSchemaOptions {
  /**
   * Enable foreign key enforcement after the DDL. Defaults to true, matching
   * the hosted Turso instance (verified `PRAGMA foreign_keys = 1`). Pass false
   * for tests that insert partial fixtures without satisfying every FK.
   */
  foreignKeys?: boolean
}

/**
 * Apply the full schema to a libSQL client.
 *
 * Statements that fail because the object already exists are skipped, since
 * later migrations legitimately recreate tables; anything else is a real
 * failure and propagates. Foreign keys go on after the DDL, because migrations
 * are not ordered by dependency.
 */
export async function applyTestSchema(
  client: Client,
  opts: ApplyTestSchemaOptions = {},
): Promise<void> {
  await client.execute('PRAGMA foreign_keys = OFF')
  for (const statement of schemaStatements()) {
    try {
      await client.execute(statement)
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
      const benign =
        msg.includes('already exists') ||
        msg.includes('duplicate column') ||
        msg.includes('no such table') // DROP/ALTER against a table a later migration creates
      if (!benign) throw e
    }
  }
  if (opts.foreignKeys !== false) {
    await client.execute('PRAGMA foreign_keys = ON')
  }
}

/**
 * Static reference dimensions, seeded so foreign keys can actually be enforced.
 *
 * These are not fixtures — they are fixed reference data that production holds,
 * and the cube writes rows referencing them (meta_for.type_id is NOT NULL, and
 * meta_top.granularity_id) so a schema with FKs on is unusable without them.
 * Each test used to seed its own subset by hand, which is the same drift
 * problem as the DDL.
 *
 * `unknown` in dim_faction is required by upsertMetaEvent, which resolves an
 * unrecognised faction to it rather than failing the import.
 */
export async function seedReferenceDims(client: Client): Promise<void> {
  // Names verified against production 2026-07-29. Casing matters: new-meta's
  // frame-filter procedures resolve these by name, not just by id.
  const forTypes: Array<[number, string]> = [
    [1, 'Event'],
    [2, 'Weekend'],
    [3, 'Month'],
    [4, 'Quarter'],
    [5, 'Year'],
    [6, 'DataSlate'],
    [7, 'TournamentPack'],
    [8, 'Edition'],
  ]
  for (const [id, name] of forTypes) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO dim_for_type (id, name) VALUES (?, ?)',
      args: [id, name],
    })
  }

  // meta_top is written at granularity 1 (Faction); 2 and 3 exist for
  // subfaction/detachment rollups.
  const granularities: Array<[number, string]> = [
    [1, 'Faction'],
    [2, 'SubFaction'],
    [3, 'Detachment'],
  ]
  for (const [id, name] of granularities) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO dim_granularity (id, name) VALUES (?, ?)',
      args: [id, name],
    })
  }

  await client.execute({
    sql: 'INSERT OR IGNORE INTO dim_faction (id, name, allegiance) VALUES (?, ?, ?)',
    args: ['unknown', 'Unknown', 'unknown'],
  })
}
