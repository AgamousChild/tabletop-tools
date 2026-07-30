/**
 * Backfill a player's detachments from the parsed list blob.
 *
 * Why this exists: parsePendingLists() writes the parsed army list to
 * meta_event_players.list_ttt, and the detachments are in there — but the
 * analytics cube reads the dimension columns (see meta-cube.ts), which nothing
 * populated for scraped events. The result was 0 of 33,744 fact_game_results
 * rows carrying a detachment while ~4,938 parsed lists named one. This module
 * is the missing bridge.
 *
 * It writes three things per row: meta_event_player_detachment (one row per
 * detachment, with position and its DP cost), meta_event_players.combo_id (the
 * SET of detachments as one dimension key), and meta_event_players.detachment_id
 * (still the position-1 detachment, for consumers not yet on combo_id).
 *
 * 11e armies take MULTIPLE detachments, so a declaration has to be split — and
 * splitting is where this gets dangerous, because real detachment names contain
 * "and" ("Penitents and Pilgrims"). See resolveDeclaredDetachments.
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
import { type SQL, sql } from 'drizzle-orm'

import { comboId, comboUpsertStatements, loadSubfactionParents } from './meta-detachment-combos'

/** Lowercase alphanumerics only — the one key both sides can agree on. */
export function compactKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export interface DetachmentDim {
  id: string
  name: string
  factionId: string
  /** Detachment Points cost. Null for 10e-era rows that have no 11e cost. */
  dp?: number | null
}

/** dim_detachment indexed by faction for scoped resolution. */
export interface DetachmentIndex {
  /** factionId -> [{ compact, id }], longest compact first for prefix matching. */
  byFaction: Map<string, Array<{ compact: string; id: string }>>
  /** dim_detachment.id -> dp, for stamping the bridge rows. */
  dpById: Map<string, number | null>
}

export interface DetachmentIndexOptions {
  /**
   * subfaction id -> parent faction id, from dim_subfaction.
   *
   * The marine chapters are both a dim_faction row and a dim_subfaction of
   * space-marines, and dim_detachment holds the shared marine detachments only
   * under space-marines. Without this, a Dark Angels army taking Gladius Task
   * Force resolves to nothing.
   */
  parents?: Map<string, string>
}

export function buildDetachmentIndex(
  dims: DetachmentDim[],
  opts: DetachmentIndexOptions = {},
): DetachmentIndex {
  const byFaction = new Map<string, Array<{ compact: string; id: string }>>()
  const dpById = new Map<string, number | null>()
  for (const d of dims) {
    dpById.set(d.id, d.dp ?? null)
    // The dim id is "{faction}:{slug}"; key on the slug half so a faction
    // prefix baked into the source string can't skew the comparison.
    const slug = d.id.includes(':') ? d.id.slice(d.id.indexOf(':') + 1) : d.id
    const entry = { compact: compactKey(slug || d.name), id: d.id }
    const list = byFaction.get(d.factionId)
    if (list) list.push(entry)
    else byFaction.set(d.factionId, [entry])
  }

  // A subfaction can take its parent's detachments as well as its own. Own
  // entries stay first and the sort below is stable, so a slug both of them have
  // still resolves to the subfaction's.
  for (const [child, parent] of opts.parents ?? []) {
    if (child === parent) continue
    const inherited = byFaction.get(parent)
    if (!inherited) continue
    byFaction.set(child, [...(byFaction.get(child) ?? []), ...inherited])
  }

  // Longest first so "shield-host-strike-force" prefers a longer real
  // detachment over a shorter one that merely happens to be a prefix.
  for (const list of byFaction.values()) list.sort((a, b) => b.compact.length - a.compact.length)
  return { byFaction, dpById }
}

/** The compact key with a faction name stripped off the front, if present. */
function keysFor(raw: string, factionId: string): string[] {
  const key = compactKey(raw)
  if (!key) return []
  const factionCompact = compactKey(factionId)
  // Real exports bake the faction into the detachment ("t'au-empire-mont'ka").
  if (factionCompact && key.startsWith(factionCompact) && key.length > factionCompact.length) {
    return [key, key.slice(factionCompact.length)]
  }
  return [key]
}

/**
 * Resolve a detachment name to a dim_detachment.id by EXACT match only.
 *
 * Separate from resolveDetachmentId because the prefix fallback below is
 * actively wrong when the input might name more than one detachment: given
 * "Cursed Legion and Skyshroud Spearhead", a prefix match happily returns
 * Cursed Legion and the second detachment vanishes. Callers testing a whole
 * declaration must use this, then split and use the prefix-tolerant resolver on
 * the parts.
 */
export function resolveDetachmentExact(
  raw: string,
  factionId: string,
  index: DetachmentIndex,
): string | null {
  const candidates = index.byFaction.get(factionId)
  if (!candidates || candidates.length === 0) return null
  for (const key of keysFor(raw, factionId)) {
    const hit = candidates.find((c) => c.compact === key)
    if (hit) return hit.id
  }
  return null
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
  const exact = resolveDetachmentExact(raw, factionId, index)
  if (exact) return exact

  const candidates = index.byFaction.get(factionId)
  if (!candidates || candidates.length === 0) return null

  // Trailing noise: battle size, force dispositions, secondary picks.
  // Candidates are longest-first, so this takes the most specific match.
  for (const key of keysFor(raw, factionId)) {
    const prefixed = candidates.find((c) => c.compact.length >= 6 && key.startsWith(c.compact))
    if (prefixed) return prefixed.id
  }
  return null
}

/**
 * Split a declared detachment string into individual candidate names.
 *
 * 11e exports join multiple detachments with " and " (418 of 600 sampled
 * DP-marked lists) or, less often, a comma. Some older blobs only carry the
 * slugified form, where the joiner is "-and-".
 *
 * BEST EFFORT by construction: real detachment names contain "and" — "Penitents
 * and Pilgrims" is a single Adepta Sororitas detachment — so a split alone
 * cannot tell a two-detachment army from a one-detachment army with a
 * conjunction in its name. Only dim_detachment settles that, which is why
 * resolveDeclaredDetachments tries the FULL string before these parts.
 */
export function splitDetachmentNames(raw: string): string[] {
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  return cleaned
    .split(/\s+and\s+|\s*,\s*|-and-/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** What a parsed list declared about its detachments. */
export interface DeclaredDetachments {
  /** The declaration as one line, faction header and list body removed. */
  declared: string | null
  /** Candidate detachment names in written order — the split of `declared`. */
  parts: string[]
  /** Total Detachment Points the list stated, when it stated one. */
  declaredDp: number | null
}

const DP_MARKER = /\((\d+)\s*Detachment\s+Points?\)/i

/**
 * Reduce a raw detachmentName to the single line that declares the detachments.
 *
 * The pre-array parser assigned everything after the faction and subfaction to
 * detachmentName, so real values look like:
 *
 *   "Cursed Legion and Skyshroud Spearhead (3 Detachment Points)\nReconnaissance
 *    \n\nAttached Units\nLokhust Lord (90 points)\n• Attached as: Leader..."
 *   "T'au Empire\nAdvanced Acquisition Cadre and Kauyon \n(3 Detachment Points)
 *    \nForce Disposition: Priority Assets\n\nATTACHED UNITS\n..."
 *
 * Everything past the declaration is force dispositions, mission picks and unit
 * entries — all of which carry their own "and"s and commas ("Take and Hold",
 * "Purge the Foe, Reconnaissance") that a split would turn into detachments
 * that do not exist. Measured on 6,000 prod rows: 2,109 detachmentName values
 * contain newlines and 1,163 contain a "Force Dispositions" line.
 */
function cleanDeclaration(
  raw: string,
  factions: string[],
): { declared: string | null; dp: number | null } {
  let text = raw
  let dp: number | null = null

  // The DP marker terminates the declaration, so it doubles as the cut point.
  const m = text.match(DP_MARKER)
  if (m) {
    dp = parseInt(m[1]!, 10)
    text = text.slice(0, m.index!)
  }

  const factionKeys = [...new Set(factions.map(compactKey).filter((k) => k.length > 0))]
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // First line that isn't the faction header. Without a DP marker to cut at,
  // this is also what keeps the list body out.
  let declared: string | null = null
  for (const line of lines) {
    if (factionKeys.includes(compactKey(line))) continue
    declared = line
    break
  }
  if (!declared) return { declared: null, dp }

  // A dispositions tail can share the line when there was no DP marker.
  declared = declared.replace(/\s*Force\s+Dispositions?:?.*$/i, '').trim()

  // Some exports glue the chapter straight onto the detachment with no
  // separator at all — "Space WolvesSaga of the Great Wolf" (69 rows).
  for (const faction of factions) {
    const trimmed = faction.trim()
    if (trimmed.length > 2 && declared.length > trimmed.length && declared.startsWith(trimmed)) {
      declared = declared.slice(trimmed.length).trim()
      break
    }
  }

  return { declared: declared || null, dp }
}

export interface ExtractDetachmentsOptions {
  /**
   * The player row's faction. Needed because only 46 of 400 sampled blobs carry
   * list.factionId, so the blob alone cannot say what faction header to skip.
   */
  factionId?: string
  /** Faction and subfaction names that may appear as a header or glued prefix. */
  factionNames?: Iterable<string>
}

/** Read every detachment a parsed list declared, tolerating both blob shapes. */
export function extractDeclaredDetachments(
  listTtt: string,
  opts: ExtractDetachmentsOptions = {},
): DeclaredDetachments {
  const empty: DeclaredDetachments = { declared: null, parts: [], declaredDp: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(listTtt)
  } catch {
    return empty
  }
  const list = (
    parsed as {
      list?: {
        factionId?: unknown
        factionName?: unknown
        detachmentId?: unknown
        detachmentName?: unknown
        detachments?: unknown
        detachmentPoints?: unknown
      }
    }
  ).list
  if (!list) return empty

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const declaredDp = typeof list.detachmentPoints === 'number' ? list.detachmentPoints : null

  // Newer blobs carry the parser's array, which is authoritative for the parts.
  if (Array.isArray(list.detachments) && list.detachments.length > 0) {
    const parts = list.detachments
      .map((d) => {
        const e = d as { id?: unknown; name?: unknown }
        return str(e.name) || str(e.id)
      })
      .filter(Boolean)
    if (parts.length > 0) {
      // detachmentName holds only the PRIMARY once the array exists, so rebuild
      // a full-string candidate from the members. compactKey erases the joiner,
      // so " and " is enough to recover a real name containing "and".
      return { declared: parts.join(' and '), parts, declaredDp }
    }
  }

  // Older blobs: detachmentName is the raw declaration plus whatever followed.
  const raw = str(list.detachmentName) || str(list.detachmentId)
  if (!raw) return { ...empty, declaredDp }
  // Longest first so "Space Marines (Astartes)" is tried before "Space Marines".
  const factions = [
    str(list.factionName),
    str(list.factionId),
    opts.factionId ?? '',
    ...(opts.factionNames ?? []),
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const cleaned = cleanDeclaration(raw, factions)
  if (!cleaned.declared) return { ...empty, declaredDp: declaredDp ?? cleaned.dp }
  return {
    declared: cleaned.declared,
    parts: splitDetachmentNames(cleaned.declared),
    declaredDp: declaredDp ?? cleaned.dp,
  }
}

/**
 * Shortest cover of a declaration by known detachment names, or null.
 *
 * This is what makes multi-detachment splitting safe. Working on the compact key
 * (lowercase alphanumerics) means the joiner all but disappears, so
 * "Legends of Saga and Song and Saga of the Beastslayer" becomes
 * "legendsofsagaandsongandsagaofthebeastslayer" and the registry itself decides
 * where the boundaries are: "legendsofsagaandsong" + "and" +
 * "sagaofthebeastslayer". A flat split on " and " gets this wrong three ways.
 *
 * Fewest segments wins, so a name containing "and" is preferred whole over
 * being torn in two. Returns null when the candidates cannot account for the
 * entire string — trailing battle-size noise, a detachment missing from the
 * registry — which is the caller's cue to fall back to the split parts.
 */
function segmentByRegistry(
  declared: string,
  candidates: Array<{ compact: string; id: string }>,
): string[] | null {
  const key = compactKey(declared)
  if (!key) return null

  // Real slugs are all longer than this; the floor stops a long declaration
  // being tiled out of very short names.
  const usable = candidates.filter((c) => c.compact.length >= 5)
  const memo = new Map<number, string[] | null>()

  const walk = (pos: number): string[] | null => {
    if (pos >= key.length) return []
    const cached = memo.get(pos)
    if (cached !== undefined) return cached

    let best: string[] | null = null
    for (const c of usable) {
      if (!key.startsWith(c.compact, pos)) continue
      const after = pos + c.compact.length
      // A joiner between two members survives compaction as a bare "and".
      const nexts = key.startsWith('and', after) ? [after + 3, after] : [after]
      for (const next of nexts) {
        const rest = walk(next)
        if (rest && (best === null || rest.length + 1 < best.length)) best = [c.id, ...rest]
      }
    }
    memo.set(pos, best)
    return best
  }

  return walk(0)
}

export interface ResolvedDetachments {
  /** dim_detachment ids in written order, deduplicated. */
  ids: string[]
  /** Candidate names nothing in dim_detachment matched. */
  unresolved: string[]
}

/**
 * Turn a declaration into dim_detachment ids.
 *
 * Order matters and is the whole point. Splitting on " and " first is wrong
 * because real detachment names contain "and", so this works down from the
 * registry instead:
 *
 *   1. the WHOLE string as one detachment, exact — "Penitents and Pilgrims"
 *   2. cover the string with registry entries — "Legends of Saga and Song" +
 *      "Saga of the Beastslayer", which no split can get right
 *   3. only then the split parts, prefix-tolerant, for anything the registry
 *      cannot account for
 */
export function resolveDeclaredDetachments(
  declared: DeclaredDetachments,
  factionId: string,
  index: DetachmentIndex,
): ResolvedDetachments {
  if (!declared.declared) return { ids: [], unresolved: [] }

  const whole = resolveDetachmentExact(declared.declared, factionId, index)
  if (whole) return { ids: [whole], unresolved: [] }

  const candidates = index.byFaction.get(factionId)
  if (candidates && candidates.length > 0) {
    const segmented = segmentByRegistry(declared.declared, candidates)
    if (segmented) return { ids: [...new Set(segmented)], unresolved: [] }
  }

  const parts = declared.parts.length > 0 ? declared.parts : [declared.declared]
  const ids: string[] = []
  const unresolved: string[] = []
  for (const part of parts) {
    const id = resolveDetachmentId(part, factionId, index)
    if (!id) unresolved.push(part)
    else if (!ids.includes(id)) ids.push(id)
  }
  return { ids, unresolved }
}

export interface DetachmentBackfillResult {
  /** Rows examined (parsed list_ttt, no combo_id yet). */
  scanned: number
  /** Rows whose detachments and combo_id were written. */
  updated: number
  /** Bridge rows written to meta_event_player_detachment. */
  detachmentRows: number
  /** Rows resolving to more than one detachment. */
  multiDetachment: number
  /**
   * Combos written with is_legal = 0 because enumeration never produced them.
   * A rising count means either a bad split or dim_detachment missing a dp.
   */
  illegalCombos: number
  /**
   * Rows whose members' dp did not sum to the DP total the list declared.
   *
   * The most useful signal available for a bad split: the list says 3 DP, the
   * detachments we resolved cost 4, so at least one of them is wrong. Reported
   * rather than rejected — the row is still better than nothing.
   */
  dpMismatch: number
  /** Rows whose list_ttt named no detachment at all. */
  noDetachmentInList: number
  /** Rows that named one we could not resolve, with counts. */
  unmatched: Array<{ raw: string; factionId: string; count: number }>
  /** Distinct event ids touched — feed these to buildCubeForEvents(). */
  eventIds: string[]
  /**
   * Highest row id examined this pass — pass back as `afterId` to continue.
   * Null when nothing was examined, which means the queue is drained.
   */
  lastId: string | null
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
  /**
   * Keyset cursor: only consider rows with `id` greater than this.
   *
   * Required for looping. Rows that cannot be resolved keep detachment_id NULL,
   * so a bare LIMIT re-reads the same stuck rows on every pass — the first run
   * of this backfill burned 17 passes over ~1,271 real updates and reported
   * `scanned=8500` because of it. A keyset cursor advances past everything
   * examined, resolved or not, and stays flat as the table grows (unlike
   * OFFSET).
   */
  afterId?: string
}

interface PendingRow {
  id: string
  event_id: string
  faction_id: string
  list_ttt: string
}

/**
 * Statements per round trip. Bounded so a 500-row chunk does not build one
 * enormous request body — the point is to stop paying latency per statement,
 * not to send everything at once.
 */
const WRITES_PER_BATCH = 200

/** Run the collected writes in batches. Each batch is one round trip. */
async function flushWrites(db: Db, writes: SQL[]): Promise<void> {
  for (let i = 0; i < writes.length; i += WRITES_PER_BATCH) {
    const slice = writes.slice(i, i + WRITES_PER_BATCH).map((statement) => db.run(statement))
    // drizzle's batch() types demand a non-empty tuple; the slice is non-empty
    // by construction.
    await db.batch(slice as [(typeof slice)[number], ...typeof slice])
  }
}

export async function backfillDetachmentsFromLists(
  db: Db,
  opts: DetachmentBackfillOptions = {},
): Promise<DetachmentBackfillResult> {
  const limit = opts.limit ?? 500

  const dims = (await db.all(
    sql`SELECT id, name, faction_id AS factionId, dp FROM dim_detachment`,
  )) as unknown as DetachmentDim[]
  const index = buildDetachmentIndex(dims, { parents: await loadSubfactionParents(db) })

  // Faction and subfaction names, for stripping the header line or glued prefix
  // a list writes ahead of its detachments.
  const names = (await db.all(sql`
    SELECT name FROM dim_faction UNION SELECT name FROM dim_subfaction
  `)) as unknown as Array<{ name: string }>
  const factionNames = names.map((n) => n.name)

  // Enumeration has already written every legal combo, so this is a membership
  // test in memory rather than a SELECT per row.
  const knownCombos = new Set(
    (
      (await db.all(sql`SELECT id FROM dim_detachment_combo`)) as unknown as Array<{ id: string }>
    ).map((c) => c.id),
  )

  // combo_id, not detachment_id, is what marks a row as done: the earlier
  // single-detachment pass already set detachment_id on ~6,000 rows, and those
  // are exactly the rows that still need their combo and bridge written.
  const conditions = [
    `mep.combo_id IS NULL`,
    `mep.list_ttt IS NOT NULL`,
    `mep.list_ttt LIKE '%"parseStatus":"ok"%'`,
  ]
  if (opts.since !== undefined) conditions.push(`me.date >= ${opts.since}`)
  if (opts.until !== undefined) conditions.push(`me.date <= ${opts.until}`)
  if (opts.afterId !== undefined) {
    conditions.push(`mep.id > '${opts.afterId.replace(/'/g, "''")}'`)
  }

  // ORDER BY id is what makes the keyset cursor well-defined.
  const rows = (await db.all(
    sql.raw(`
      SELECT mep.id, mep.event_id, mep.faction_id, mep.list_ttt
      FROM meta_event_players mep
      JOIN meta_events me ON mep.event_id = me.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY mep.id
      LIMIT ${limit}
    `),
  )) as unknown as PendingRow[]

  const result: DetachmentBackfillResult = {
    scanned: rows.length,
    updated: 0,
    detachmentRows: 0,
    multiDetachment: 0,
    illegalCombos: 0,
    dpMismatch: 0,
    noDetachmentInList: 0,
    unmatched: [],
    eventIds: [],
    lastId: rows.length > 0 ? rows[rows.length - 1]!.id : null,
  }

  const missCounts = new Map<string, { raw: string; factionId: string; count: number }>()
  const touched = new Set<string>()
  // Every write for this chunk, executed as batches at the end. Turso latency
  // dominates: one round trip per statement put a 10,056-row pass on course for
  // 5+ hours (measured 216 players in ~7 minutes).
  const writes: SQL[] = []

  for (const row of rows) {
    const declared = extractDeclaredDetachments(row.list_ttt, {
      factionId: row.faction_id,
      factionNames,
    })
    if (!declared.declared) {
      result.noDetachmentInList++
      continue
    }

    const resolved = resolveDeclaredDetachments(declared, row.faction_id, index)
    for (const miss of resolved.unresolved) {
      const key = `${row.faction_id}::${miss}`
      const existing = missCounts.get(key)
      if (existing) existing.count++
      else missCounts.set(key, { raw: miss, factionId: row.faction_id, count: 1 })
    }
    // Nothing resolved: leave the row alone so a later dim_detachment fix can
    // pick it up, and report what it named.
    if (resolved.ids.length === 0) continue

    if (resolved.ids.length > 1) result.multiDetachment++

    const dps = resolved.ids.map((id) => index.dpById.get(id) ?? null)
    const totalDp = dps.some((d) => d === null) ? null : dps.reduce((a, b) => a! + b!, 0)
    if (declared.declaredDp !== null && totalDp !== null && totalDp !== declared.declaredDp) {
      result.dpMismatch++
    }

    const combo = comboId(row.faction_id, resolved.ids)
    if (!knownCombos.has(combo)) {
      // Not enumerated, so not a legal build under the DP rules. Recorded with
      // is_legal = 0 so the fact rows have something to reference; the upsert
      // takes MAX(is_legal) and therefore cannot downgrade a legal row.
      writes.push(
        ...comboUpsertStatements(
          {
            id: combo,
            factionId: row.faction_id,
            memberIds: resolved.ids,
            memberCount: resolved.ids.length,
            totalDp,
          },
          false,
        ),
      )
      knownCombos.add(combo)
      result.illegalCombos++
    }

    // Clear first: a re-run after dim_detachment gained an entry can resolve to
    // a different set, and stale bridge rows would silently accumulate.
    writes.push(sql`DELETE FROM meta_event_player_detachment WHERE player_id = ${row.id}`)
    for (const [i, detachmentId] of resolved.ids.entries()) {
      writes.push(sql`
        INSERT INTO meta_event_player_detachment
          (player_id, detachment_id, position, detachment_points)
        VALUES (${row.id}, ${detachmentId}, ${i + 1}, ${dps[i]})
      `)
    }
    // detachment_id keeps holding the position-1 detachment so the cube and
    // existing queries keep working while consumers move to combo_id.
    writes.push(sql`
      UPDATE meta_event_players
      SET detachment_id = ${resolved.ids[0]}, combo_id = ${combo}
      WHERE id = ${row.id}
    `)

    result.detachmentRows += resolved.ids.length
    result.updated++
    touched.add(row.event_id)
  }

  if (!opts.dryRun) await flushWrites(db, writes)

  result.eventIds = [...touched]
  result.unmatched = [...missCounts.values()].sort((a, b) => b.count - a.count)
  return result
}
