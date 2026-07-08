/**
 * Seed the `tasks` table with the historical project-task list.
 *
 * This data used to live as a hardcoded `TASKS` array in
 * apps/admin/client/src/pages/TasksPage.tsx — moved to the DB per root
 * CLAUDE.md Rule 6 (data lives in datastores, not source code). `id` values
 * are preserved verbatim (non-sequential, has gaps) so history stays intact.
 *
 * Importable as a plain function taking a drizzle `db` handle (Rule 4 —
 * everything is a callable function). Run directly for one-off seeding:
 *   TURSO_DB_URL=... TURSO_AUTH_TOKEN=... npx tsx src/lib/seed-tasks.ts
 */

import { createClient } from '@libsql/client'
import { createDbFromClient, type Db, tasks } from '@tabletop-tools/db'

interface SeedTask {
  id: number
  subject: string
  category: string
  priority: number
  status: string
}

const KNOWN_TASKS: SeedTask[] = [
  {
    id: 25,
    subject: 'Fix brain retrieval for matchup queries',
    category: 'review',
    priority: 1,
    status: 'pending',
  },
  {
    id: 26,
    subject: 'Fix brain Ask prompt template',
    category: 'review',
    priority: 1,
    status: 'pending',
  },
  {
    id: 28,
    subject: 'Turso: update all Worker secrets to new URL',
    category: 'auto',
    priority: 1,
    status: 'completed',
  },
  {
    id: 30,
    subject: 'New-meta: add detachment data to cube',
    category: 'auto',
    priority: 2,
    status: 'completed',
  },
  {
    id: 37,
    subject: 'New-meta: add proper schema to packages/db/schema.ts',
    category: 'auto',
    priority: 2,
    status: 'completed',
  },
  {
    id: 31,
    subject: 'Content ingestor: auto-review Red Path drafts',
    category: 'auto',
    priority: 2,
    status: 'completed',
  },
  {
    id: 32,
    subject: 'Content ingestor: auto-review Warphammer Math remaining 610',
    category: 'auto',
    priority: 2,
    status: 'completed',
  },
  {
    id: 34,
    subject: 'Brain: revert Ask model to configurable',
    category: 'auto',
    priority: 2,
    status: 'completed',
  },
  {
    id: 36,
    subject: 'BCP: paginate event scan beyond 155 events',
    category: 'auto',
    priority: 3,
    status: 'pending',
  },
  {
    id: 47,
    subject: 'BCP: scrape all 10th edition GTs + US RTTs 20+ players',
    category: 'auto',
    priority: 3,
    status: 'pending',
  },
  {
    id: 27,
    subject: 'Fix first turn scraper checkbox detection',
    category: 'review',
    priority: 3,
    status: 'pending',
  },
  {
    id: 29,
    subject: 'New-meta: build Hutber/StatCheck quality dashboard UI',
    category: 'review',
    priority: 3,
    status: 'pending',
  },
  {
    id: 50,
    subject: 'New-meta: fix OverRep calculation',
    category: 'review',
    priority: 2,
    status: 'pending',
  },
  {
    id: 44,
    subject: 'New-meta: improve list viewer — parse army lists as structured data',
    category: 'review',
    priority: 4,
    status: 'pending',
  },
  {
    id: 48,
    subject: 'Admin: YouTube channel manager — add channels, auto-process 24/7',
    category: 'auto',
    priority: 3,
    status: 'completed',
  },
  {
    id: 51,
    subject: 'Ingest: daily cron crawl + auto-processing pipeline',
    category: 'auto',
    priority: 1,
    status: 'completed',
  },
  {
    id: 52,
    subject: 'CLAUDE.md: rewrite to 10 project rules (97 lines, was 430)',
    category: 'auto',
    priority: 1,
    status: 'completed',
  },
  {
    id: 35,
    subject: 'Admin: set up routines for pipeline job control',
    category: 'design',
    priority: 4,
    status: 'pending',
  },
  {
    id: 45,
    subject: 'Lists: convert army lists to TTT standard format',
    category: 'design',
    priority: 4,
    status: 'pending',
  },
  {
    id: 38,
    subject: 'List Builder: overhaul with designed interface',
    category: 'design',
    priority: 5,
    status: 'pending',
  },
  {
    id: 42,
    subject: 'List Builder: use brain detachment/unit cards for display',
    category: 'design',
    priority: 5,
    status: 'pending',
  },
  {
    id: 39,
    subject: 'Game Tracker: overhaul with designed UI + data model changes',
    category: 'design',
    priority: 5,
    status: 'pending',
  },
  {
    id: 40,
    subject: 'No-Cheat: integrate Python vision model for dice detection',
    category: 'design',
    priority: 5,
    status: 'pending',
  },
  {
    id: 41,
    subject: 'Versus: add strat/detachment/ability selectors — auto-apply in sim',
    category: 'design',
    priority: 5,
    status: 'pending',
  },
  {
    id: 43,
    subject: 'Tournament: BCP integration — sync events, dual registration',
    category: 'design',
    priority: 5,
    status: 'pending',
  },
  {
    id: 46,
    subject: '11th Edition: prepare platform for June launch',
    category: 'design',
    priority: 2,
    status: 'pending',
  },
  {
    id: 49,
    subject: 'Admin: add project task list page',
    category: 'auto',
    priority: 1,
    status: 'completed',
  },
]

/**
 * Insert the known task list into `tasks`. Idempotent — safe to re-run;
 * existing rows (matched by id) are left untouched.
 */
export async function seedTasks(db: Db): Promise<{ inserted: number }> {
  const now = new Date()
  const rows = KNOWN_TASKS.map((t) => ({
    ...t,
    createdAt: now,
    updatedAt: now,
  }))
  await db.insert(tasks).values(rows).onConflictDoNothing()
  return { inserted: rows.length }
}

function getClient() {
  const local = process.argv.includes('--local')
  if (local) {
    console.log('Using local DB: .local/dev.db\n')
    return createClient({ url: 'file:.local/dev.db' })
  }
  const dbUrl = process.env['TURSO_DB_URL']
  const authToken = process.env['TURSO_AUTH_TOKEN']
  if (!dbUrl || !authToken) {
    console.error('Set TURSO_DB_URL and TURSO_AUTH_TOKEN')
    process.exit(1)
  }
  return createClient({ url: dbUrl, authToken })
}

async function main() {
  const client = getClient()
  const db = createDbFromClient(client)
  const { inserted } = await seedTasks(db)
  console.log(`Seeded ${inserted} tasks.`)
  client.close()
}

// Only run when executed directly, not when imported.
const isMain = process.argv[1]?.includes('seed-tasks')
if (isMain) main().catch(console.error)
