/**
 * shapes/list-review.ts — "Rate my list" / army-list-review question shape.
 *
 * Matches when the question contains:
 *   - A points total (3–4 digit number followed by pts/points)
 *   - AND enumerated units (bulleted/numbered list, or "attached", "characters", etc.)
 *
 * Canonicalize: extract { faction, detachment, points, units[], parseOk }.
 * Handle:
 *   - parseOk: false → augmentContext with a formatting suggestion.
 *   - parseOk: true  → augmentContext with a "PARSED LIST" block + placeholder
 *                       for meta comparison (wired in a follow-up task).
 */

import { register } from '../registry'
import type { HandlerResult, QuestionShape, ShapeContext } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListReviewParsed {
  parseOk: boolean
  points: number | null
  faction: string | null
  detachment: string | null
  units: string[]
}

// ── Detection regexes ─────────────────────────────────────────────────────────

/** Matches e.g. "1500pts", "1,500 points", "2000 pts" */
const POINTS_RE = /\b(\d{1,2},?\d{3})\s*(?:pts?|points?)\b/i

/** Heuristics that suggest an enumerated unit list is present. */
const LIST_SIGNALS_RE =
  /(?:^[-•*]\s|\n\s*[-•*]\s|\n\s*\d+[.)]\s|attached\s+unit|characters?:|units?:|leader[s:]|squad[s:]|\d+x\s+[A-Z])/im

// ── Parsing helpers ───────────────────────────────────────────────────────────

/**
 * Extract a points value from the question text.
 */
function parsePoints(text: string): number | null {
  const m = POINTS_RE.exec(text)
  if (!m) return null
  return parseInt(m[1]!.replace(',', ''), 10)
}

/**
 * Extract faction name — look for common faction keywords or known faction slugs
 * adjacent to an army label.
 */
function parseFaction(text: string, detectedFactions: string[]): string | null {
  // If faction-detect already found something, use it.
  if (detectedFactions.length > 0) return detectedFactions[0]!

  // Fallback: look for faction-like labels near army keywords.
  const m =
    /(?:playing|running|using|army[:\s]+|list[:\s]+)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i.exec(
      text,
    )
  return m ? m[1]!.trim() : null
}

/**
 * Extract detachment name — look for "X Detachment" or "Detachment: X".
 */
function parseDetachment(text: string): string | null {
  const m = /(?:detachment[:\s]+([A-Za-z\s''-]+)|([A-Za-z\s''-]+?)\s+detachment)/i.exec(text)
  if (!m) return null
  return (m[1] ?? m[2] ?? '').trim().replace(/\s+/g, ' ') || null
}

/**
 * Extract unit names from bullet/numbered list lines.
 * Returns up to 30 entries to keep augmentContext concise.
 */
function parseUnits(text: string): string[] {
  const units: string[] = []
  // Match lines that start with bullet, asterisk, dash, or "Nx " patterns.
  const lineRe = /(?:^|\n)\s*(?:[-•*]|\d+[.)]) *(?:\d+x?\s+)?([A-Z][^\n]{1,80})/gm
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(text)) !== null && units.length < 30) {
    const unit = m[1]!
      .trim()
      // Strip trailing point costs "(180pts)", "[120]", etc.
      .replace(/\s*[[(]?\d+\s*(?:pts?|points?)?[\])]?\s*$/i, '')
      .trim()
    if (unit.length >= 3 && unit.length <= 80) {
      units.push(unit)
    }
  }
  return units
}

// ── Shape implementation ──────────────────────────────────────────────────────

const listReviewShape: QuestionShape<ListReviewParsed> = {
  id: 'list-review',
  description: 'Army list review — points total + enumerated units',
  priority: 80,

  matches(ctx: ShapeContext): boolean {
    const { question } = ctx
    return POINTS_RE.test(question) && LIST_SIGNALS_RE.test(question)
  },

  canonicalize(ctx: ShapeContext): ListReviewParsed {
    const { question, detectedFactions } = ctx
    const points = parsePoints(question)
    const faction = parseFaction(question, detectedFactions)
    const detachment = parseDetachment(question)
    const units = parseUnits(question)

    // Require at least a points value and at least 2 units to consider the
    // parse successful. Without a points value we can't validate the list.
    const parseOk = points !== null && units.length >= 2

    return { parseOk, points, faction, detachment, units }
  },

  async handle(parsed: ListReviewParsed, _ctx: ShapeContext): Promise<HandlerResult> {
    if (!parsed.parseOk) {
      return {
        delegated: false,
        shapeId: 'list-review',
        parsedNotes: `parseOk: false (points=${parsed.points}, units=${parsed.units.length})`,
        augmentContext: [
          'SHAPE[list-review]: List detected but could not be fully parsed.',
          'Suggest asking the user to format their list as:',
          '  - Unit Name (Npts)',
          'with a total like "1500pts" at the top.',
        ].join('\n'),
      }
    }

    const lines: string[] = [
      'SHAPE[list-review] PARSED LIST:',
      `  Faction    : ${parsed.faction ?? 'unknown'}`,
      `  Detachment : ${parsed.detachment ?? 'unknown'}`,
      `  Points     : ${parsed.points}`,
      `  Units (${parsed.units.length}):`,
      ...parsed.units.map((u) => `    - ${u}`),
      '',
      'META COMPARISON PENDING (wired in follow-up task).',
    ]

    return {
      delegated: false,
      shapeId: 'list-review',
      parsedNotes: `parseOk: true, points=${parsed.points}, units=${parsed.units.length}, faction=${parsed.faction}`,
      augmentContext: lines.join('\n'),
    }
  },
}

register(listReviewShape)

export { listReviewShape }
