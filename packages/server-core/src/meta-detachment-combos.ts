/**
 * Enumerate and record 11e detachment combinations.
 *
 * 11e armies take multiple detachments under a Detachment Points budget. Each
 * detachment costs 1-3 DP; the budget is 2 DP at Incursion (1,000 pts) and 3 DP
 * at Strike Force (2,000 pts). A legal Strike Force army is therefore one 3pt
 * detachment, a 2pt plus a 1pt, or three 1pt.
 *
 * dim_detachment_combo makes the SET the unit of analysis, so "which pairing
 * wins" is an indexed lookup rather than a query-time GROUP_CONCAT. Two kinds of
 * row live there:
 *
 *   is_legal = 1  enumerated from the DP rules — exists whether or not anyone
 *                 has played it, which is what makes "what is nobody playing"
 *                 answerable
 *   is_legal = 0  observed in a real list but not a legal build (garbled parse,
 *                 detachment missing from the dim, an actually-illegal army).
 *                 Recorded rather than dropped so its fact rows have something
 *                 to reference.
 */
import type { Db } from '@tabletop-tools/db'
import { type SQL, sql } from 'drizzle-orm'

/** DP budget by battle size. Incursion 2, Strike Force 3. */
export const DP_BUDGET = { incursion: 2, strikeForce: 3 } as const

export interface DetachmentWithDp {
  /** dim_detachment.id, shaped "{faction}:{slug}". */
  id: string
  factionId: string
  /** 1-3. Rows with no dp (10e-era) cannot participate in enumeration. */
  dp: number | null
}

export interface DetachmentCombo {
  id: string
  factionId: string
  memberIds: string[]
  memberCount: number
  totalDp: number | null
}

/** The slug half of a dim_detachment id ("aeldari:spirit-conclave" -> "spirit-conclave"). */
function slugOf(detachmentId: string): string {
  const i = detachmentId.indexOf(':')
  return i === -1 ? detachmentId : detachmentId.slice(i + 1)
}

/**
 * Deterministic combo id: faction, then member slugs sorted and joined with "+".
 *
 * Sorting is the point — a player writing "Spearpoint Task Force and Librarius
 * Conclave" must produce the same id as "Librarius Conclave and Spearpoint Task
 * Force", or the same army counts as two different combos.
 */
export function comboId(factionId: string, detachmentIds: string[]): string {
  const slugs = [...new Set(detachmentIds.map(slugOf))].sort()
  return `${factionId}:${slugs.join('+')}`
}

export interface EnumerateCombosOptions {
  /**
   * subfaction id -> parent faction id, from dim_subfaction.
   *
   * A subfaction can field its parent's detachments as well as its own, and
   * dim_detachment keeps the shared marine detachments only under space-marines.
   * Enumerating strictly by dim_detachment.faction_id therefore produces no
   * combos at all for a chapter, and every real chapter army ends up recorded
   * as an illegal build (measured: 103 of 110 distinct).
   */
  parents?: Map<string, string>
}

/**
 * Every legal combination available to each faction, given a DP budget.
 *
 * Detachments with no dp are skipped: without a cost there is no way to know
 * whether including them is legal, and guessing would populate the "available"
 * set with combos that may not exist.
 */
export function enumerateLegalCombos(
  detachments: DetachmentWithDp[],
  budget: number = DP_BUDGET.strikeForce,
  opts: EnumerateCombosOptions = {},
): DetachmentCombo[] {
  const byFaction = new Map<string, DetachmentWithDp[]>()
  for (const d of detachments) {
    if (d.dp === null || d.dp < 1) continue
    const list = byFaction.get(d.factionId)
    if (list) list.push(d)
    else byFaction.set(d.factionId, [d])
  }

  // Give every subfaction the parent's pool on top of its own. Iterating a
  // snapshot so a parent that is itself a subfaction cannot see a half-built
  // pool — the relationship is one level deep in dim_subfaction.
  const ownPools = new Map([...byFaction].map(([f, pool]) => [f, [...pool]]))
  for (const [child, parent] of opts.parents ?? []) {
    if (child === parent) continue
    const inherited = ownPools.get(parent)
    if (!inherited) continue
    byFaction.set(child, [...(ownPools.get(child) ?? []), ...inherited])
  }

  const out: DetachmentCombo[] = []

  for (const [factionId, pool] of byFaction) {
    // Depth-first over combinations, pruning as soon as the budget is exceeded.
    // Enumerating all 2^n subsets and filtering afterwards would be needless
    // work for factions with many detachments.
    const walk = (startIndex: number, chosen: DetachmentWithDp[], spent: number): void => {
      if (chosen.length > 0) {
        out.push({
          id: comboId(
            factionId,
            chosen.map((c) => c.id),
          ),
          factionId,
          memberIds: chosen.map((c) => c.id),
          memberCount: chosen.length,
          totalDp: spent,
        })
      }
      for (let i = startIndex; i < pool.length; i++) {
        const next = pool[i]!
        const cost = next.dp!
        if (spent + cost > budget) continue
        chosen.push(next)
        walk(i + 1, chosen, spent + cost)
        chosen.pop()
      }
    }
    walk(0, [], 0)
  }

  return out
}

export interface ComboUpsertResult {
  combos: number
  members: number
}

/**
 * The statements that record one combo and its membership.
 *
 * Returned rather than executed so the backfill can fold them into its own
 * write batch — one round trip for a whole chunk instead of one per statement.
 */
export function comboUpsertStatements(c: DetachmentCombo, isLegal: boolean): SQL[] {
  const statements: SQL[] = [
    sql`
      INSERT INTO dim_detachment_combo (id, faction_id, member_count, total_dp, is_legal)
      VALUES (${c.id}, ${c.factionId}, ${c.memberCount}, ${c.totalDp}, ${isLegal ? 1 : 0})
      ON CONFLICT(id) DO UPDATE SET
        member_count = excluded.member_count,
        total_dp = excluded.total_dp,
        -- never downgrade a legal combo to illegal: enumeration is authoritative
        is_legal = MAX(dim_detachment_combo.is_legal, excluded.is_legal)
    `,
  ]
  for (const memberId of c.memberIds) {
    statements.push(sql`
      INSERT OR IGNORE INTO dim_detachment_combo_member (combo_id, detachment_id)
      VALUES (${c.id}, ${memberId})
    `)
  }
  return statements
}

/**
 * Write combos and their membership. Idempotent — safe to re-run.
 *
 * `isLegal` is passed rather than inferred so the same writer serves both the
 * enumerated set and observed-but-illegal combos.
 */
export async function upsertCombos(
  db: Db,
  combos: DetachmentCombo[],
  isLegal: boolean,
): Promise<ComboUpsertResult> {
  let members = 0
  for (const c of combos) {
    for (const statement of comboUpsertStatements(c, isLegal)) await db.run(statement)
    members += c.memberIds.length
  }
  return { combos: combos.length, members }
}

/** Load dim_detachment with its dp, for enumeration. */
export async function loadDetachmentsWithDp(db: Db): Promise<DetachmentWithDp[]> {
  return (await db.all(
    sql`SELECT id, faction_id AS factionId, dp FROM dim_detachment`,
  )) as unknown as DetachmentWithDp[]
}

/**
 * subfaction id -> parent faction id, for the inherited detachment pool.
 *
 * Self-references are dropped: a marine chapter appears as both a dim_faction
 * row and a dim_subfaction row, and inheriting from itself is a no-op that only
 * duplicates its pool.
 */
export async function loadSubfactionParents(db: Db): Promise<Map<string, string>> {
  const rows = (await db.all(
    sql`SELECT id, faction_id AS factionId FROM dim_subfaction`,
  )) as unknown as Array<{ id: string; factionId: string }>
  return new Map(rows.filter((r) => r.id !== r.factionId).map((r) => [r.id, r.factionId]))
}
