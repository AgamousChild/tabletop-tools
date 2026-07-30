/**
 * Backfill meta_event_players.detachment_id from the parsed list blob.
 *
 * Why this exists: parsePendingLists() writes the parsed army list to
 * meta_event_players.list_ttt, and the detachment is in there — but the
 * analytics cube reads meta_event_players.detachment_id (see meta-cube.ts),
 * which nothing populated for scraped events. The result was 0 of 33,744
 * fact_game_results rows carrying a detachment while ~4,938 parsed lists
 * named one. This module is the missing bridge.
 *
 * Matching is not string equality. The two sides slugify differently:
 *   dim_detachment.id  = "{faction}:{slug}", slug = name lowercased with every
 *                        non-alphanumeric run collapsed to "-"
 *                        ("Reaper's Wager" -> "drukhari:reaper-s-wager")
 *   list_ttt detachment = the list parser's slugify, which only converts
 *                        spaces and preserves apostrophes ("reaper's-wager")
 *
 * On top of that, real exports bake the faction name into the detachment
 * ("t'au-empire-mont'ka") and append battle size / force dispositions
 * ("shield-host-strike-force"). So resolution runs on a compact key —
 * lowercase alphanumerics only — with a faction-prefix strip and a
 * longest-prefix fallback.
 *
 * After running this, rebuild the cube for the touched events
 * (buildCubeForEvents) or fact_game_results keeps the old NULLs.
 */
import type { Db } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

/** Lowercase alphanumerics only — the one key both sides can agree on. */
export function compactKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export interface DetachmentDim {
  id: string
  name: string
  factionId: string
}

/** dim_detachment indexed by faction for scoped resolution. */
export interface DetachmentIndex {
  /** factionId -> [{ compact, id }], longest compact first for prefix matching. */
  byFaction: Map<string, Array<{ compact: string; id: string }>>
}

export function buildDetachmentIndex(dims: DetachmentDim[]): DetachmentIndex {
  const byFaction = new Map<string, Array<{ compact: string; id: string }>>()
  for (const d of dims) {
    // The dim id is "{faction}:{slug}"; key on the slug half so a faction
    // prefix baked into the source string can't skew the comparison.
    const slug = d.id.includes(':') ? d.id.slice(d.id.indexOf(':') + 1) : d.id
    const entry = { compact: compactKey(slug || d.name), id: d.id }
    const list = byFaction.get(d.factionId)
    if (list) list.push(entry)
    else byFaction.set(d.factionId, [entry])
  }
  // Longest first so "shield-host-strike-force" prefers a longer real
  // detachment over a shorter one that merely happens to be a prefix.
  for (const list of byFaction.values()) list.sort((a, b) => b.compact.length - a.compact.length)
  return { byFaction }
}

/**
 * Resolve a raw detachment slug/name to a dim_detachment.id within a faction.
 * Returns null when nothing matches — callers should report those rather than
 * guess, since an unmatched value usually means dim_detachment is missing the
 * entry, not that the list is wrong.
 */
export function resolveDetachmentId(
  raw: string,
  factionId: string,
  index: DetachmentIndex,
): string | null {
  const candidates = index.byFaction.get(factionId)
  if (!candidates || candidates.length === 0) return null

  let key = compactKey(raw)
  if (!key) return null

  // Exact match on the compact key.
  const exact = candidates.find((c) => c.compact === key)
  if (exact) return exact.id

  // Strip a faction name baked into the front ("t'au-empire-mont'ka").
  const factionCompact = compactKey(factionId)
  if (factionCompact && key.startsWith(factionCompact) && key.length > factionCompact.length) {
    key = key.slice(factionCompact.length)
    const afterStrip = candidates.find((c) => c.compact === key)
    if (afterStrip) return afterStrip.id
  }

  // Trailing noise: battle size, force dispositions, secondary picks.
  // Candidates are longest-first, so this takes the most specific match.
  const prefixed = candidates.find((c) => c.compact.length >= 6 && key.startsWith(c.compact))
  if (prefixed) return prefixed.id

  return null
}

export interface DetachmentBackfillResult {
  /** Rows examined (had list_ttt, no detachment_id yet). */
  scanned: number
  /** Rows whose detachment_id was written. */
  updated: number
  /** Rows whose list_ttt named no detachment at all. */
  noDetachmentInList: number
  /** Rows that named one we could not resolve, with counts. */
  unmatched: Array<{ raw: string; factionId: string; count: number }>
  /** Distinct event ids touched — feed these to buildCubeForEvents(). */
  eventIds: string[]
}

export interface DetachmentBackfillOptions {
  /** Max rows per call. Keeps a single invocation inside the Worker CPU budget. */
  limit?: number
  /** Only events on/after this epoch ms. */
  since?: number
  /** Only events on/before this epoch ms. */
  until?: number
  /** Resolve and report without writing. */
  dryRun?: boolean
}

interface PendingRow {
  id: string
  event_id: string
  faction_id: string
  list_ttt: string
}

/** Pull the detachment the list parser recorded, tolerating shape drift. */
export function extractDetachment(listTtt: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(listTtt)
  } catch {
    return null
  }
  const list = (parsed as { list?: { detachmentId?: unknown; detachmentName?: unknown } }).list
  if (!list) return null
  const id = typeof list.detachmentId === 'string' ? list.detachmentId.trim() : ''
  if (id) return id
  const name = typeof list.detachmentName === 'string' ? list.detachmentName.trim() : ''
  return name || null
}

export async function backfillDetachmentsFromLists(
  db: Db,
  opts: DetachmentBackfillOptions = {},
): Promise<DetachmentBackfillResult> {
  const limit = opts.limit ?? 500

  const dims = (await db.all(
    sql`SELECT id, name, faction_id AS factionId FROM dim_detachment`,
  )) as unknown as DetachmentDim[]
  const index = buildDetachmentIndex(dims)

  const conditions = [
    `mep.detachment_id IS NULL`,
    `mep.list_ttt IS NOT NULL`,
    `mep.list_ttt LIKE '%"parseStatus":"ok"%'`,
  ]
  if (opts.since !== undefined) conditions.push(`me.date >= ${opts.since}`)
  if (opts.until !== undefined) conditions.push(`me.date <= ${opts.until}`)

  const rows = (await db.all(
    sql.raw(`
      SELECT mep.id, mep.event_id, mep.faction_id, mep.list_ttt
      FROM meta_event_players mep
      JOIN meta_events me ON mep.event_id = me.id
      WHERE ${conditions.join(' AND ')}
      LIMIT ${limit}
    `),
  )) as unknown as PendingRow[]

  const result: DetachmentBackfillResult = {
    scanned: rows.length,
    updated: 0,
    noDetachmentInList: 0,
    unmatched: [],
    eventIds: [],
  }

  const missCounts = new Map<string, { raw: string; factionId: string; count: number }>()
  const touched = new Set<string>()

  for (const row of rows) {
    const raw = extractDetachment(row.list_ttt)
    if (!raw) {
      result.noDetachmentInList++
      continue
    }

    const detachmentId = resolveDetachmentId(raw, row.faction_id, index)
    if (!detachmentId) {
      const key = `${row.faction_id}::${raw}`
      const existing = missCounts.get(key)
      if (existing) existing.count++
      else missCounts.set(key, { raw, factionId: row.faction_id, count: 1 })
      continue
    }

    if (!opts.dryRun) {
      await db.run(
        sql`UPDATE meta_event_players SET detachment_id = ${detachmentId} WHERE id = ${row.id}`,
      )
    }
    result.updated++
    touched.add(row.event_id)
  }

  result.eventIds = [...touched]
  result.unmatched = [...missCounts.values()].sort((a, b) => b.count - a.count)
  return result
}
