/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-turso.md — Turso database schema (meta_event_players)
 */
import type { Db } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

import { parseList } from './list-parser'

export async function parsePendingLists(db: Db): Promise<{
  parsed: number
  partial: number
  failed: number
  skipped: number
}> {
  // Get rows with list_text but no list_ttt, limited to 100 per run (Worker time budget)
  const rows = (await db.all(sql`
    SELECT mep.id, mep.list_text
    FROM meta_event_players mep
    JOIN meta_events me ON mep.event_id = me.id
    WHERE mep.list_ttt IS NULL
      AND mep.list_text IS NOT NULL
      AND mep.list_text != ''
      AND me.date > ${new Date('2026-01-01').getTime()}
    LIMIT 100
  `)) as { id: string; list_text: string }[]

  let parsed = 0,
    partial = 0,
    failed = 0,
    skipped = 0

  for (const row of rows) {
    const text = row.list_text?.trim()
    if (!text) {
      skipped++
      continue
    }

    const result = parseList(text)
    const json = JSON.stringify(result)

    await db.run(sql`UPDATE meta_event_players SET list_ttt = ${json} WHERE id = ${row.id}`)

    if (result.parseStatus === 'ok') parsed++
    else if (result.parseStatus === 'partial') partial++
    else failed++
  }

  return { parsed, partial, failed, skipped }
}
