// ============================================================
// frameFilters — dim-driven frame & granularity discovery
//
// Reads available frame types, granularities, and frames from
// dim_for_type / dim_granularity / meta_for / meta_top. No
// hardcoded type_id or granularity_id literals (Rule 6).
//
// All functions take a Drizzle-style `db.all()` runner so they
// can be reused across procedures and tested with an in-memory
// SQLite client.
// ============================================================

import { sql } from 'drizzle-orm'

// Minimal subset of the Drizzle DB interface we use here. Anything
// that exposes `.all(SQL)` will work — that includes both the prod
// Drizzle wrapper and the createDbFromClient helper.
export interface FrameFilterDb {
  all: (query: ReturnType<typeof sql>) => Promise<unknown[]>
}

export interface FrameTypeRow {
  /** Numeric id from dim_for_type (do NOT bake into queries — pass as variable.) */
  id: number
  name: string
}

export interface GranularityRow {
  id: number
  name: string
}

export interface FrameTypeSummary extends FrameTypeRow {
  /** Total frames of this type that have any meta_top rows for the given granularity. */
  framesWithData: number
}

export interface FrameRow {
  id: string
  typeId: number
  typeName: string
  date: number
  endDate: number | null
  month: number | null
  quarter: number | null
  year: number
  label: string
  /** True iff at least one meta_top row exists for this frame at the requested granularity. */
  hasData: boolean
}

/** Read the rows from dim_for_type as-is. */
export async function getDimForTypes(db: FrameFilterDb): Promise<FrameTypeRow[]> {
  const rows = (await db.all(sql`SELECT id, name FROM dim_for_type ORDER BY id`)) as Array<{
    id: number
    name: string
  }>
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

/** Read the rows from dim_granularity as-is. */
export async function getDimGranularities(db: FrameFilterDb): Promise<GranularityRow[]> {
  const rows = (await db.all(sql`SELECT id, name FROM dim_granularity ORDER BY id`)) as Array<{
    id: number
    name: string
  }>
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

/**
 * Read the granularities that actually have any meta_top rows.
 * Useful for hiding empty granularity options in the client.
 */
export async function getPopulatedGranularities(db: FrameFilterDb): Promise<GranularityRow[]> {
  const rows = (await db.all(sql`
    SELECT dg.id, dg.name
    FROM dim_granularity dg
    JOIN meta_top mt ON mt.granularity_id = dg.id
    GROUP BY dg.id, dg.name
    ORDER BY dg.id
  `)) as Array<{ id: number; name: string }>
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

/**
 * Per-type frame counts. `framesWithData` is the count of frames of
 * that type which have at least one meta_top row at the given
 * granularity.
 */
export async function getFrameTypeSummaries(
  db: FrameFilterDb,
  granularityId: number,
): Promise<FrameTypeSummary[]> {
  const rows = (await db.all(sql`
    SELECT
      dft.id,
      dft.name,
      COUNT(DISTINCT CASE WHEN mt.meta_for_id IS NOT NULL THEN mf.id END) AS frames_with_data
    FROM dim_for_type dft
    LEFT JOIN meta_for mf ON mf.type_id = dft.id
    LEFT JOIN meta_top mt
      ON mt.meta_for_id = mf.id
     AND mt.granularity_id = ${granularityId}
    GROUP BY dft.id, dft.name
    ORDER BY dft.id
  `)) as Array<{ id: number; name: string; frames_with_data: number }>
  return rows.map((r) => ({ id: r.id, name: r.name, framesWithData: r.frames_with_data }))
}

/**
 * Build a label for a frame from its row + the type name. The label
 * format is derived from the type name, not from a hardcoded type_id
 * mapping.
 */
function buildLabel(r: {
  id: string
  typeName: string
  year: number | null
  quarter: number | null
  month: number | null
  date: number
  /** Human name joined from the row this frame is derived from, when it has one. */
  sourceName: string | null
}): string {
  const isoDate = () => new Date(r.date).toISOString().slice(0, 10)

  switch (r.typeName) {
    case 'Quarter':
      return r.year != null && r.quarter != null ? `${r.year} Q${r.quarter}` : isoDate()
    case 'Month':
      return r.year != null && r.month != null
        ? `${r.year}-${String(r.month).padStart(2, '0')}`
        : isoDate()
    case 'Year':
      return r.year != null ? `${r.year}` : isoDate()
    case 'Weekend':
      return `Weekend ${isoDate()}`
    // The rest name a real row. Use ITS name — never the id, and never a
    // string carved out of the id. Every one of these used to leak: events
    // rendered as raw nanoids, and the TournamentPack branch tested for a
    // `tourney_pack:` prefix that generateFrames never writes (it writes
    // `pack:`), so `pack:pack-pariah-nexus` went straight to the user.
    case 'Event':
      // Date included because tournament names repeat across years.
      return r.sourceName ? `${r.sourceName} (${isoDate()})` : isoDate()
    case 'DataSlate':
    case 'TournamentPack':
    case 'Edition':
      return r.sourceName ?? isoDate()
    default:
      return r.sourceName ?? isoDate()
  }
}

/**
 * All frames, joined with their type name, with a `hasData` flag
 * indicating whether the frame has any meta_top rows at the given
 * granularity.
 */
export async function getFramesWithData(
  db: FrameFilterDb,
  granularityId: number,
): Promise<FrameRow[]> {
  const rows = (await db.all(sql`
    SELECT
      mf.id,
      mf.type_id AS typeId,
      dft.name AS typeName,
      mf.date,
      mf.end_date AS endDate,
      mf.month,
      mf.quarter,
      mf.year,
      -- The human name of whatever row this frame is derived from. Joined by
      -- type name rather than a hardcoded type_id, and by the frame's own FK
      -- columns where it has them. Event frames key on the id suffix because
      -- meta_for holds no event_id column.
      COALESCE(me.name, dd.name, dtp.name, de.name) AS sourceName,
      EXISTS (
        SELECT 1 FROM meta_top mt
        WHERE mt.meta_for_id = mf.id AND mt.granularity_id = ${granularityId}
      ) AS hasData
    FROM meta_for mf
    JOIN dim_for_type dft ON mf.type_id = dft.id
    LEFT JOIN meta_events me
      ON dft.name = 'Event' AND me.id = substr(mf.id, 7)
    LEFT JOIN dim_dataslate dd
      ON dft.name = 'DataSlate' AND dd.id = mf.dataslate_id
    LEFT JOIN dim_tournament_pack dtp
      ON dft.name = 'TournamentPack' AND dtp.id = mf.tourney_pack_id
    LEFT JOIN dim_edition de
      ON dft.name = 'Edition' AND de.id = mf.edition_id
    ORDER BY mf.date DESC
  `)) as Array<{
    id: string
    typeId: number
    typeName: string
    date: number
    endDate: number | null
    month: number | null
    quarter: number | null
    year: number
    sourceName: string | null
    hasData: number
  }>

  return rows.map((r) => ({
    id: r.id,
    typeId: r.typeId,
    typeName: r.typeName,
    date: r.date,
    endDate: r.endDate,
    month: r.month,
    quarter: r.quarter,
    year: r.year,
    label: buildLabel({
      id: r.id,
      typeName: r.typeName,
      year: r.year,
      quarter: r.quarter,
      month: r.month,
      date: r.date,
      sourceName: r.sourceName,
    }),
    hasData: Boolean(r.hasData),
  }))
}

/**
 * Resolve the default frame for a given granularity.
 *
 * Picks the most recent frame (by date DESC) that:
 *  - has at least one meta_top row at the given granularity, AND
 *  - if `preferredTypeName` is supplied, matches that type.
 *
 * Falls back to the most recent populated frame of ANY type if the
 * preferred type has no data.
 *
 * Returns null if no frame at the given granularity has any data.
 */
export async function resolveDefaultFrame(
  db: FrameFilterDb,
  granularityId: number,
  preferredTypeName?: string,
  now: number = Date.now(),
): Promise<string | null> {
  // Frames whose period has not started yet are excluded from the default.
  //
  // BCP leagues carry an endDate months out, so 32 scraped events were dated
  // Oct-Dec 2026 while the actual date was July. They populated
  // quarter:2026:4 with 36 games, and "most recent populated frame" then handed
  // every faction page a 36-game headline in place of Q3's 21,807. The frames
  // still exist and are still selectable — they are just not the default.
  const started = sql`AND mf.date <= ${now}`

  for (const dateFilter of [started, sql``]) {
    if (preferredTypeName) {
      const preferred = (await db.all(sql`
        SELECT mf.id
        FROM meta_for mf
        JOIN dim_for_type dft ON mf.type_id = dft.id
        JOIN meta_top mt ON mt.meta_for_id = mf.id
        WHERE dft.name = ${preferredTypeName}
          AND mt.granularity_id = ${granularityId}
          ${dateFilter}
        GROUP BY mf.id, mf.date
        ORDER BY mf.date DESC
        LIMIT 1
      `)) as Array<{ id: string }>
      if (preferred[0]?.id) return preferred[0].id
    }

    const fallback = (await db.all(sql`
      SELECT mf.id
      FROM meta_for mf
      JOIN meta_top mt ON mt.meta_for_id = mf.id
      WHERE mt.granularity_id = ${granularityId}
        ${dateFilter}
      GROUP BY mf.id, mf.date
      ORDER BY mf.date DESC
      LIMIT 1
    `)) as Array<{ id: string }>
    if (fallback[0]?.id) return fallback[0].id
    // Nothing has started yet — retry unfiltered rather than show an empty
    // page, which is what a brand-new dataset of future-dated events would hit.
  }

  return null
}

/**
 * Look up the numeric type_id for a given type name (e.g. "Month").
 * Returns null if the type is not present in dim_for_type.
 *
 * Use this when a query needs to filter by a specific type (timelines,
 * etc) — never hardcode the integer.
 */
export async function getTypeIdByName(db: FrameFilterDb, typeName: string): Promise<number | null> {
  const rows = (await db.all(
    sql`SELECT id FROM dim_for_type WHERE name = ${typeName} LIMIT 1`,
  )) as Array<{ id: number }>
  return rows[0]?.id ?? null
}

/**
 * Look up the numeric granularity_id for a given name (e.g. "Faction").
 * Returns null if the granularity is not present in dim_granularity.
 */
export async function getGranularityIdByName(
  db: FrameFilterDb,
  granularityName: string,
): Promise<number | null> {
  const rows = (await db.all(
    sql`SELECT id FROM dim_granularity WHERE name = ${granularityName} LIMIT 1`,
  )) as Array<{ id: number }>
  return rows[0]?.id ?? null
}
