import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { loadFactionMap, resetFactionMapCache } from './faction-map'
import { parsePendingLists } from './parse-lists'

const SEED = `
INSERT INTO dim_faction VALUES ('tyranids', 'Tyranids', 'xenos');
INSERT INTO dim_faction_alias VALUES ('Tyranids', 'tyranids');
INSERT INTO meta_events VALUES ('evt1', 'Test GT', ${new Date('2026-03-15').getTime()}, NULL, NULL, NULL, 'GT', 5, 40, 'bcp', 'bcp-1', ${Date.now()}, NULL, NULL, NULL);
`

function createTestDb() {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)
  return { client, db }
}

async function setupTables(client: ReturnType<typeof createClient>) {
  // Real schema from the committed migrations — see packages/db test-schema.
  await applyTestSchema(client)
  await seedReferenceDims(client)
  await client.executeMultiple(SEED)
}

describe('parsePendingLists', () => {
  let db: ReturnType<typeof createDbFromClient>
  let client: ReturnType<typeof createClient>

  beforeEach(async () => {
    resetFactionMapCache()
    const testDb = createTestDb()
    client = testDb.client
    db = testDb.db
    await setupTables(client)
    await loadFactionMap(db)
  })

  afterAll(() => {
    resetFactionMapCache()
  })

  it('parses a GW App list and writes TTT JSON', async () => {
    const listText =
      'Bug List (1995 Points)\nTyranids\nSubterranean Assault\nStrike Force (2,000 Points)\nCHARACTERS\nHive Tyrant (215 Points)\n  • Warlord'
    await db.run(
      sql`INSERT INTO meta_event_players (id, event_id, player_name, faction_id, placement, list_text) VALUES ('p1', 'evt1', 'Test Player', 'tyranids', 1, ${listText})`,
    )

    const result = await parsePendingLists(db)
    expect(result.parsed + result.partial + result.failed).toBeGreaterThanOrEqual(1)

    const rows = (await db.all(sql`SELECT list_ttt FROM meta_event_players WHERE id = 'p1'`)) as {
      list_ttt: string
    }[]
    expect(rows[0].list_ttt).toBeTruthy()
    const ttt = JSON.parse(rows[0].list_ttt)
    expect(ttt.parseStatus).toBeDefined()
    expect(ttt.list.factionId).toBe('tyranids')
  })

  it('skips rows already parsed', async () => {
    await db.run(
      sql`INSERT INTO meta_event_players (id, event_id, player_name, faction_id, placement, list_text, list_ttt) VALUES ('p2', 'evt1', 'Already Done', 'tyranids', 2, 'some text', '{"already":"parsed"}')`,
    )

    const result = await parsePendingLists(db)
    expect(result.parsed + result.partial + result.failed + result.skipped).toBe(0)
  })

  it('marks HTML as failed', async () => {
    await db.run(
      sql`INSERT INTO meta_event_players (id, event_id, player_name, faction_id, placement, list_text) VALUES ('p3', 'evt1', 'HTML Player', 'tyranids', 3, 'You need to enable JavaScript<div>')`,
    )

    const result = await parsePendingLists(db)
    expect(result.failed).toBe(1)

    const rows = (await db.all(sql`SELECT list_ttt FROM meta_event_players WHERE id = 'p3'`)) as {
      list_ttt: string
    }[]
    const ttt = JSON.parse(rows[0].list_ttt)
    expect(ttt.parseStatus).toBe('failed')
  })

  it('skips events before 2026', async () => {
    await client.execute({
      sql: `INSERT INTO meta_events VALUES (?, ?, ?, NULL, NULL, NULL, 'GT', 5, 40, 'bcp', 'bcp-old', ?, NULL, NULL, NULL)`,
      args: ['evt-old', 'Old GT', new Date('2024-06-15').getTime(), Date.now()],
    })
    await db.run(
      sql`INSERT INTO meta_event_players (id, event_id, player_name, faction_id, placement, list_text) VALUES ('p4', 'evt-old', 'Old Player', 'tyranids', 1, 'Old List (2000 Points)\nTyranids\nCHARACTERS')`,
    )

    const result = await parsePendingLists(db)
    expect(result.parsed + result.failed + result.skipped).toBe(0)
  })

  it('skips rows with empty list_text', async () => {
    await db.run(
      sql`INSERT INTO meta_event_players (id, event_id, player_name, faction_id, placement, list_text) VALUES ('p5', 'evt1', 'Empty Player', 'tyranids', 5, '')`,
    )

    const result = await parsePendingLists(db)
    // Empty list_text is filtered by the WHERE clause (list_text != '')
    expect(result.parsed + result.partial + result.failed + result.skipped).toBe(0)
  })
})
