/**
 * faction-detect.ts — Single source of truth for faction/subfaction detection,
 * query stripping, and mechanic alias expansion.
 *
 * CRITICAL: FACTION_PATTERNS order matters — more specific patterns (e.g.,
 * "chaos space marine") must appear before their substrings ("space marine").
 */

// ── Faction patterns ──────────────────────────────────────────────────────────

export const FACTION_PATTERNS: Array<{ pattern: string; slug: string }> = [
  { pattern: 'chaos space marine', slug: 'chaos-space-marines' },
  { pattern: 'space marine', slug: 'space-marines' },
  { pattern: 'blood angel', slug: 'blood-angels' },
  { pattern: 'dark angel', slug: 'dark-angels' },
  { pattern: 'space wolf', slug: 'space-wolves' },
  { pattern: 'space wolves', slug: 'space-wolves' },
  { pattern: 'black templar', slug: 'black-templars' },
  { pattern: 'grey knight', slug: 'grey-knights' },
  { pattern: 'death guard', slug: 'death-guard' },
  { pattern: 'thousand sons', slug: 'thousand-sons' },
  { pattern: 'world eater', slug: 'world-eaters' },
  { pattern: 'imperial agent', slug: 'imperial-agents' },
  { pattern: 'imperial knight', slug: 'imperial-knights' },
  { pattern: 'chaos knight', slug: 'chaos-knights' },
  { pattern: 'imperial guard', slug: 'astra-militarum' },
  { pattern: 'astra militarum', slug: 'astra-militarum' },
  { pattern: 'sisters of battle', slug: 'adepta-sororitas' },
  { pattern: 'dark eldar', slug: 'drukhari' },
  { pattern: 'ork', slug: 'orks' },
  { pattern: 'necron', slug: 'necrons' },
  { pattern: 'tyranid', slug: 'tyranids' },
  { pattern: 'aeldari', slug: 'aeldari' },
  { pattern: 'eldar', slug: 'aeldari' },
  { pattern: 'tau', slug: 't-au-empire' },
  { pattern: "t'au", slug: 't-au-empire' },
  { pattern: 'custodes', slug: 'adeptus-custodes' },
  { pattern: 'sororitas', slug: 'adepta-sororitas' },
  { pattern: 'mechanicus', slug: 'adeptus-mechanicus' },
  { pattern: 'genestealer', slug: 'genestealer-cults' },
  { pattern: 'drukhari', slug: 'drukhari' },
  { pattern: 'votann', slug: 'leagues-of-votann' },
  { pattern: 'deathwatch', slug: 'deathwatch' },
  { pattern: 'daemon', slug: 'chaos-daemons' },
]

// ── Subfaction → parent faction mapping ───────────────────────────────────────

/**
 * Maps subfaction names (lowercase) to their parent faction slug.
 * Chapters resolve to 'space-marines', daemon legions to 'chaos-daemons', etc.
 */
export const SUBFACTION_TO_PARENT: Record<string, string> = {
  // Space Marines chapters
  'blood angels': 'space-marines',
  'dark angels': 'space-marines',
  'space wolves': 'space-marines',
  'black templars': 'space-marines',
  'deathwatch': 'space-marines',
  'iron hands': 'space-marines',
  'ultramarines': 'space-marines',
  'salamanders': 'space-marines',
  'raven guard': 'space-marines',
  'imperial fists': 'space-marines',
  'white scars': 'space-marines',
  'crimson fists': 'space-marines',
  'blood ravens': 'space-marines',
  // Aeldari subfactions
  'ynnari': 'aeldari',
  'harlequins': 'aeldari',
  'asuryani': 'aeldari',
  // Chaos Daemons legions
  'plague legions': 'chaos-daemons',
  'scintillating legions': 'chaos-daemons',
  'legions of excess': 'chaos-daemons',
  'blood legions': 'chaos-daemons',
  // Chaos Space Marines
  'damned': 'chaos-space-marines',
}

// ── Mechanic aliases ──────────────────────────────────────────────────────────

export const MECHANIC_ALIASES: Array<{ alias: string; canonical: string }> = [
  { alias: 'dev wounds', canonical: 'devastating wounds' },
  { alias: 'devs', canonical: 'devastating wounds' },
  { alias: 'sus hits', canonical: 'sustained hits' },
  { alias: 'exploding 6s', canonical: 'sustained hits' },
  { alias: 'exploding 6', canonical: 'sustained hits' },
  { alias: 'critical hit', canonical: 'sustained hits' },
  { alias: 'crit', canonical: 'sustained hits' },
  { alias: 'auto wound', canonical: 'lethal hits' },
  { alias: 'auto-wound', canonical: 'lethal hits' },
  { alias: 'fnp', canonical: 'feel no pain' },
  { alias: 'mortal', canonical: 'mortal wound' },
  { alias: 'mortals', canonical: 'mortal wound' },
  { alias: 'ap', canonical: 'armour penetration' },
  { alias: 'invuln', canonical: 'invulnerable' },
  { alias: 'obs sec', canonical: 'objective control' },
  { alias: 'ob sec', canonical: 'objective control' },
  { alias: 'obsec', canonical: 'objective control' },
]

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Detects all factions and an optional subfaction from query text.
 *
 * - Subfaction names (chapters, legions, craftworlds) map to their parent
 *   faction slug and also set the `subfaction` field.
 * - When "chaos space marine" matches, "space marine" is suppressed (the full
 *   matched text is consumed so the substring can't also match).
 */
export function detectFactions(query: string): { factions: string[]; subfaction?: string } {
  const lower = query.toLowerCase()
  const found = new Set<string>()
  let subfaction: string | undefined

  // Check subfaction keywords first — they imply a parent faction
  for (const [sf, parent] of Object.entries(SUBFACTION_TO_PARENT)) {
    if (lower.includes(sf)) {
      found.add(parent)
      subfaction = sf
      break // only one subfaction
    }
  }

  // Track consumed text ranges to prevent double-matching substrings
  // e.g. once "chaos space marine" matches, "space marine" should not.
  const consumed: Array<[number, number]> = []

  for (const { pattern, slug } of FACTION_PATTERNS) {
    // Use a word boundary at the start (to block false matches like "cork"
    // matching "ork"), but NOT at the end — patterns like "necron" must match
    // inside "necrons", "tyranid" inside "tyranids", etc.
    const startAnchor = /\w/.test(pattern[0]) ? '\\b' : ''
    const re = new RegExp(`${startAnchor}${escapeRegex(pattern)}`, 'gi')
    let m: RegExpExecArray | null
    let matched = false
    while ((m = re.exec(lower)) !== null) {
      const start = m.index
      const end = start + m[0].length
      // Skip if this range overlaps a previously consumed range
      const overlaps = consumed.some(([cs, ce]) => start < ce && end > cs)
      if (!overlaps) {
        consumed.push([start, end])
        matched = true
      }
    }
    if (matched) found.add(slug)
  }

  return { factions: [...found], subfaction }
}

// ── Query stripping ───────────────────────────────────────────────────────────

/**
 * Removes faction and subfaction names from query text so they don't pollute
 * semantic search. Uses the full FACTION_PATTERNS list (not a partial copy).
 *
 * @param query - original user query
 * @param detectedFactions - slug(s) returned by detectFactions
 */
export function stripFactionFromQuery(query: string, detectedFactions: string[]): string {
  if (detectedFactions.length === 0) return query

  let result = query

  // Build the set of patterns to remove: any pattern whose slug is detected
  const patternsToRemove = FACTION_PATTERNS
    .filter(({ slug }) => detectedFactions.includes(slug))
    .map(({ pattern }) => pattern)
    .sort((a, b) => b.length - a.length) // longest first to avoid partial removal

  // Also remove subfaction names that appear in SUBFACTION_TO_PARENT
  for (const [sf, parent] of Object.entries(SUBFACTION_TO_PARENT)) {
    if (detectedFactions.includes(parent)) {
      patternsToRemove.push(sf)
    }
  }

  for (const pattern of patternsToRemove) {
    // Remove "in <pattern>" phrases too, then bare pattern
    result = result.replace(new RegExp(`\\bin\\s+${escapeRegex(pattern)}`, 'gi'), '')
    result = result.replace(new RegExp(escapeRegex(pattern), 'gi'), '')
  }

  return result.replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Mechanic keyword extraction ───────────────────────────────────────────────

const MECHANIC_TERMS = [
  'sustained hits', 'lethal hits', 'devastating wounds', 'hazardous',
  'blast', 'torrent', 'twin-linked', 'rapid fire', 'pistol', 'melta',
  'lance', 'anti-', 'ignores cover', 'indirect fire',
  'feel no pain', 'deadly demise', 'deep strike', 'lone operative',
  'stealth', 'scouts', 'infiltrators', 'battle-shock', 'fights first',
  'overwatch', 'wound roll', 'hit roll', 'saving throw',
  'engagement range', 'coherency', 'visibility', 'cover',
  'advance', 'fall back', 'charge', 'mortal wound',
  'invulnerable', 'firing deck', 'transport', 'objective control',
  'armour penetration',
]

/**
 * Extract game mechanic keywords from a query, expanding aliases first.
 */
export function extractMechanicKeywords(query: string): string[] {
  let expanded = query.toLowerCase()
  for (const { alias, canonical } of MECHANIC_ALIASES) {
    if (expanded.includes(alias)) {
      expanded = expanded.replace(alias, canonical)
    }
  }
  return MECHANIC_TERMS.filter(m => expanded.includes(m))
}
