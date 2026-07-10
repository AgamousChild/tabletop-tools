/**
 * Periodic full-catch-up cube rebuild for bcp-scraper.
 *
 * D2-01 (packages/server-core/src/meta-cube.ts): the actual cube-building
 * logic (frame generation, fact_game_results, meta_top) now lives in the
 * shared, event-scoped `buildCubeForEvents()`. `upsertMetaEvent()` already
 * calls it per-event on every write from any of the three meta writers
 * (native tournament export, CSV import, BCP scrape), so this pipeline's
 * job is reduced to: track a watermark (meta_cube_status) and periodically
 * sweep for any event that watermark check missed — e.g. rows written by a
 * process that bypassed upsertMetaEvent, or a prior failed run.
 *
 * This file previously selected "events since last run" via
 * `WHERE imported_at > lastCompleted` with no `source` filter, which cubed
 * every writer's rows regardless of origin — the exact bug D2-01 fixes at
 * the source in buildCubeForEvents. Kept here only as bcp-scraper's own
 * periodic safety-net sweep, scoped the same way (explicit event ids
 * passed to the shared function, not an unscoped table scan happening
 * inside the cube builder itself).
 *
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-turso.md — Turso database schema (meta_for, meta_top, fact_game_results)
 */
import type { Db } from '@tabletop-tools/db'
import { buildCubeForEvents, type EventRow, generateFrames } from '@tabletop-tools/server-core'
import { sql } from 'drizzle-orm'

export type { EventRow }
export { generateFrames }

export async function runPipeline(db: Db): Promise<void> {
  await db.run(
    sql`UPDATE meta_cube_status SET status = 'running', last_started_at = ${Date.now()} WHERE id = 1`,
  )

  try {
    const cubeStatus = (await db.all(
      sql`SELECT last_completed_at FROM meta_cube_status WHERE id = 1`,
    )) as Array<{ last_completed_at: number | null }>
    const lastCompleted = cubeStatus[0]?.last_completed_at ?? 0

    const newEvents = (await db.all(sql`
      SELECT id, date, name FROM meta_events
      WHERE imported_at > ${lastCompleted}
    `)) as unknown as EventRow[]

    if (newEvents.length > 0) {
      await buildCubeForEvents(
        db,
        newEvents.map((e) => e.id),
      )
    }

    await db.run(
      sql`UPDATE meta_cube_status SET status = 'complete', last_completed_at = ${Date.now()} WHERE id = 1`,
    )
  } catch (err) {
    await db.run(sql`UPDATE meta_cube_status SET status = 'failed' WHERE id = 1`)
    throw err
  }
}
