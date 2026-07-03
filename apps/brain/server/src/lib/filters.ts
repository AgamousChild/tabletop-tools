/**
 * Shared filtering rules for all brain data importers.
 * One place, one set of rules. All parsers import from here.
 *
 * Filters:
 * - Boarding Actions (detachment type)
 * - Legends (discontinued datasheets and their weapons/abilities)
 *
 * NOTE: Fuzzy chapter-from-text detection (`detectChapterFromText`,
 * `detectChapterFromHeading`, `buildDetachmentChapterMap`, `CHAPTERS`,
 * `CHAPTER_KEYWORDS`) was deleted in PR A of the scalar-to-ref refactor
 * (docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md). It was
 * manufacturing wrong `subfaction` tags on generic units (Rhino, Intercessor
 * Squad → black-templars). Structured chapter data (Wahapedia
 * datasheet_keywords, BSData catalog membership) is wired in PR B.
 */

// ── Boarding Actions ────────────────────────────────────────────────────────

export function isBoardingAction(detachment: { type: string }): boolean {
  return detachment.type.toLowerCase() === 'boarding actions'
}

// ── Legends ─────────────────────────────────────────────────────────────────

export function isLegends(datasheet: { isLegends?: boolean }): boolean {
  return !!datasheet.isLegends
}

// ── Scope Detection ─────────────────────────────────────────────────────────

export type AbilityScope = 'bearer' | 'unit' | 'army' | 'stratagem' | 'aura'

/**
 * Detect the scope of an ability from its category and text.
 */
export function detectScope(category: string, content: string): AbilityScope {
  const lower = content.toLowerCase()
  if (category === 'stratagem') return 'stratagem'
  if (category === 'enhancement' && (lower.includes('the bearer') || lower.includes("bearer's")))
    return 'bearer'
  if (lower.includes('aura') && lower.includes('within') && lower.includes('"')) return 'aura'
  if (category === 'faction-ability' && !lower.includes('models in this unit')) return 'army'
  if (
    lower.includes('models in this unit') ||
    lower.includes('models in that unit') ||
    lower.includes('leading a unit')
  )
    return 'unit'
  return 'unit'
}

// ── Weapon Type Detection ───────────────────────────────────────────────────

const WEAPON_TYPE_PATTERNS = ['torrent', 'melta', 'pistol', 'heavy', 'assault', 'rapid fire']

/**
 * Detect which weapon types an ability/stratagem targets.
 * Returns array of types, or ['all'] if no specific type detected.
 */
export function detectWeaponTypes(content: string): string[] {
  const lower = content.toLowerCase()
  const types: string[] = []
  for (const wt of WEAPON_TYPE_PATTERNS) {
    if (lower.includes(wt)) types.push(wt)
  }
  if (lower.includes('melee weapon') || lower.includes('melee attack')) types.push('melee')
  if (lower.includes('ranged weapon') || lower.includes('ranged attack')) types.push('ranged')
  if (types.length === 0) types.push('all')
  return types
}

// ── Grant Detection ─────────────────────────────────────────────────────────

export interface GrantClassification {
  grantsRerolls: 'hit' | 'wound' | null
  grantsAbility: string[] // 'sustained hits', 'lethal hits', 'devastating wounds'
}

/**
 * Detect what an ability/stratagem/enhancement grants.
 */
export function classifyGrants(content: string): GrantClassification {
  const lower = content.toLowerCase()

  const grantsAbility: string[] = []
  if (lower.includes('sustained hits')) grantsAbility.push('sustained hits')
  if (lower.includes('lethal hits')) grantsAbility.push('lethal hits')
  if (lower.includes('devastating wounds')) grantsAbility.push('devastating wounds')

  let grantsRerolls: 'hit' | 'wound' | null = null
  if (lower.includes('re-roll') && lower.includes('wound')) grantsRerolls = 'wound'
  if (lower.includes('re-roll') && lower.includes('hit')) grantsRerolls = 'hit'
  if (lower.includes('twin-linked')) grantsRerolls = 'wound'

  return { grantsRerolls, grantsAbility }
}

// ── Shared Utilities ────────────────────────────────────────────────────────

/** Truncate text to maxLen chars, appending "..." if truncated. */
export function truncate(text: string, maxLen: number): string {
  const clean = text
    .replace(/<[^>]+>/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return clean.length > maxLen ? clean.substring(0, maxLen - 3) + '...' : clean
}

/** Strip HTML tags and convert basic HTML to markdown. */
export function stripHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<ul>/gi, '')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<b>/gi, '**')
    .replace(/<\/b>/gi, '**')
    .replace(/<i>/gi, '*')
    .replace(/<\/i>/gi, '*')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\*\*\*\*/g, '** **')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
