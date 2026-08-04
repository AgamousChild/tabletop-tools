/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-turso.md — Turso database schema (meta_event_players)
 */
import type { Db } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

import { parseList } from './list-parser'

/** Rows whose event is newer than this are parsed by default — the scrape path
 *  only ever cares about current-season lists. A full backfill passes since: 0. */
const DEFAULT_SINCE = new Date('2026-01-01').getTime()

/** Statements per round trip. One awaited UPDATE per row meant 23.5k sequential
 *  round trips for the 2024–2025 backlog; batching takes the same work to ~470. */
const WRITES_PER_BATCH = 50

export interface ParsePendingOptions {
  /** Only parse lists from events after this epoch-ms. Defaults to 2026-01-01. */
  since?: number
  /** Rows to claim per call. Kept under the Worker CPU budget (root rule 9). */
  limit?: number
}

export async function parsePendingLists(
  db: Db,
  options: ParsePendingOptions = {},
): Promise<{
  parsed: number
  partial: number
  failed: number
  skipped: number
}> {
  const since = options.since ?? DEFAULT_SINCE
  const limit = options.limit ?? 100

  // Get rows with list_text but no list_ttt, limited per run (Worker time budget)
  const rows = (await db.all(sql`
    SELECT mep.id, mep.list_text
    FROM meta_event_players mep
    JOIN meta_events me ON mep.event_id = me.id
    WHERE mep.list_ttt IS NULL
      AND mep.list_text IS NOT NULL
      AND mep.list_text != ''
      AND me.date > ${since}
    LIMIT ${limit}
  `)) as { id: string; list_text: string }[]

  let parsed = 0,
    partial = 0,
    failed = 0,
    skipped = 0

  const writes: ReturnType<typeof sql>[] = []

  for (const row of rows) {
    const text = row.list_text?.trim()
    if (!text) {
      skipped++
      continue
    }

    const result = parseList(text)
    const json = JSON.stringify(result)

    writes.push(sql`UPDATE meta_event_players SET list_ttt = ${json} WHERE id = ${row.id}`)

    if (result.parseStatus === 'ok') parsed++
    else if (result.parseStatus === 'partial') partial++
    else failed++
  }

  for (let i = 0; i < writes.length; i += WRITES_PER_BATCH) {
    const slice = writes.slice(i, i + WRITES_PER_BATCH).map((st) => db.run(st))
    await db.batch(slice as [(typeof slice)[number], ...typeof slice])
  }

  return { parsed, partial, failed, skipped }
}
