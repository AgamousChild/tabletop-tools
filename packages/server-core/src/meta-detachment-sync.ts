/**
 * Sync the 11e detachment registry (and its Detachment Points cost) from the
 * brain's cube export into dim_detachment.
 *
 * dim_detachment is the canonical entity registry (root CLAUDE.md rule 1), but
 * it was missing 11e rows the brain already had. Measured 2026-07-29 against
 * 266 brain 11e detachments and 253 dim rows:
 *   195 matched, 71 present only in the brain, 58 present only in the dim.
 *
 * The two stores slugify punctuation differently — the brain drops apostrophes
 * ("hurons-marauders") while the dim converts them to a dash
 * ("huron-s-marauders") — so reconciliation runs on a compact alphanumeric key,
 * not on id equality. Matching on raw ids reports 185 and invents 149 phantom
 * differences.
 *
 * Everything here is pure except applyDetachmentSync(). Reading the brain
 * export is the caller's job: server-core is imported by Workers, which have no
 * filesystem.
 */
import type { Db } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

import { compactKey } from './meta-detachment-backfill.js'

export interface BrainDetachment {
  /** dim-shaped id with the "11e:det:" prefix removed. */
  id: string
  name: string
  factionId: string
  /** Detachment Points cost, 1-3. */
  dp: number
}

export interface DimDetachmentRow {
  id: string
  name: string
  factionId: string
  dp: number | null
}

/**
 * Pull 11e detachment nodes out of the brain cube's fact_node.jsonl lines.
 * Ignores other categories, other editions, and unparseable lines.
 */
export function parseBrainDetachments(lines: Iterable<string>): BrainDetachment[] {
  const out: BrainDetachment[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    let node: Record<string, unknown>
    try {
      node = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (node.category !== 'detachment' || node.edition !== '11th') continue
    const rawId = String(node.id ?? '')
    if (!rawId) continue
    const dp = Number(node.dp ?? 0)
    // dp outside 1-3 is not a legal 11e cost; skip rather than store nonsense.
    if (!Number.isInteger(dp) || dp < 1 || dp > 3) continue
    out.push({
      id: rawId.replace(/^11e:det:/, ''),
      name: String(node.title ?? ''),
      factionId: String(node.factionId ?? ''),
      dp,
    })
  }
  return out
}

export interface DetachmentSyncPlan {
  /** Existing dim rows whose dp should be set/changed. */
  dpUpdates: Array<{ id: string; dp: number; from: number | null }>
  /** 11e detachments absent from dim_detachment. */
  inserts: BrainDetachment[]
  /** Inserts blocked because their faction is not in dim_faction. */
  blockedByFaction: BrainDetachment[]
  /** dim rows with no brain counterpart — left alone, reported for visibility. */
  dimOnly: DimDetachmentRow[]
}

/**
 * Work out what the sync would change. Pure — no writes, no IO.
 *
 * knownFactionIds gates inserts: dim_detachment.faction_id is a NOT NULL FK to
 * dim_faction, so an insert for an unknown faction would fail the whole batch.
 * Those are reported instead.
 */
export function planDetachmentSync(
  brain: BrainDetachment[],
  dims: DimDetachmentRow[],
  knownFactionIds: Set<string>,
): DetachmentSyncPlan {
  const dimByCompact = new Map(dims.map((d) => [compactKey(d.id), d]))
  const brainCompacts = new Set(brain.map((b) => compactKey(b.id)))

  const dpUpdates: DetachmentSyncPlan['dpUpdates'] = []
  const inserts: BrainDetachment[] = []
  const blockedByFaction: BrainDetachment[] = []

  for (const b of brain) {
    const match = dimByCompact.get(compactKey(b.id))
    if (match) {
      if (match.dp !== b.dp) dpUpdates.push({ id: match.id, dp: b.dp, from: match.dp })
      continue
    }
    if (!knownFactionIds.has(b.factionId)) {
      blockedByFaction.push(b)
      continue
    }
    inserts.push(b)
  }

  const dimOnly = dims.filter((d) => !brainCompacts.has(compactKey(d.id)))

  return { dpUpdates, inserts, blockedByFaction, dimOnly }
}

export interface DetachmentSyncResult {
  dpUpdated: number
  inserted: number
  blocked: number
  dimOnly: number
}

/** Apply a plan. Idempotent: re-running with the same inputs is a no-op. */
export async function applyDetachmentSync(
  db: Db,
  plan: DetachmentSyncPlan,
): Promise<DetachmentSyncResult> {
  for (const u of plan.dpUpdates) {
    await db.run(sql`UPDATE dim_detachment SET dp = ${u.dp} WHERE id = ${u.id}`)
  }
  for (const i of plan.inserts) {
    await db.run(
      sql`INSERT OR IGNORE INTO dim_detachment (id, name, faction_id, subfaction_id, dp)
          VALUES (${i.id}, ${i.name}, ${i.factionId}, NULL, ${i.dp})`,
    )
  }
  return {
    dpUpdated: plan.dpUpdates.length,
    inserted: plan.inserts.length,
    blocked: plan.blockedByFaction.length,
    dimOnly: plan.dimOnly.length,
  }
}
