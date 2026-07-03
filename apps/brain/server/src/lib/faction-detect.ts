/**
 * faction-detect.ts — Single source of truth for faction/chapter detection,
 * query stripping, and mechanic alias expansion.
 *
 * CRITICAL: FACTION_PATTERNS order matters — more specific patterns (e.g.,
 * "chaos space marine") must appear before their substrings ("space marine").
 */

// ── Faction patterns ──────────────────────────────────────────────────────────

// FACTION_PATTERNS maps text patterns to TOP-LEVEL faction slugs only.
// SM chapters (blood angels, dark angels, space wolves, etc.) live in
// SUBFACTION_TO_PARENT (they're chapter aliases → parent SM faction).
// Do NOT add them here.
export const FACTION_PATTERNS: Array<{ pattern: string; slug: string }> = [
  { pattern: 'chaos space marine', slug: 'chaos-space-marines' },
  { pattern: 'space marine', slug: 'space-marines' },
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
  { pattern: 'chaos daemon', slug: 'chaos-daemons' },
  // Common abbreviations
  { pattern: 'csm', slug: 'chaos-space-marines' },
  { pattern: 'gk', slug: 'grey-knights' },
  { pattern: 'dg', slug: 'death-guard' },
  { pattern: 'ts', slug: 'thousand-sons' },
  { pattern: 'we', slug: 'world-eaters' },
  { pattern: 'gsc', slug: 'genestealer-cults' },
  { pattern: 'admech', slug: 'adeptus-mechanicus' },
]

// Abbreviation → chapter-name mappings (resolved via SUBFACTION_TO_PARENT)
export const ABBREVIATION_TO_SUBFACTION: Record<string, string> = {
  ba: 'blood angels',
  da: 'dark angels',
  sw: 'space wolves',
  bt: 'black templars',
  dw: 'deathwatch',
  sm: '', // plain Space Marines, no chapter
}

// ── Chapter → parent faction mapping ──────────────────────────────────────────

/**
 * Maps chapter/legion/craftworld names (lowercase) to their parent faction
 * slug. Chapters resolve to 'space-marines', daemon legions to 'chaos-daemons',
 * etc. Used to seed the `dim_subfaction` expansion at retrieval time.
 */
export const SUBFACTION_TO_PARENT: Record<string, string> = {
  // Space Marines chapters
  'blood angels': 'space-marines',
  'dark angels': 'space-marines',
  'space wolves': 'space-marines',
  'black templars': 'space-marines',
  deathwatch: 'space-marines',
  'iron hands': 'space-marines',
  ultramarines: 'space-marines',
  salamanders: 'space-marines',
  'raven guard': 'space-marines',
  'imperial fists': 'space-marines',
  'white scars': 'space-marines',
  'crimson fists': 'space-marines',
  'blood ravens': 'space-marines',
  // Aeldari subfactions
  ynnari: 'aeldari',
  harlequins: 'aeldari',
  asuryani: 'aeldari',
  // Chaos Daemons legions
  'plague legions': 'chaos-daemons',
  'scintillating legions': 'chaos-daemons',
  'legions of excess': 'chaos-daemons',
  'blood legions': 'chaos-daemons',
  // Chaos Space Marines
  damned: 'chaos-space-marines',
}

// ── Mechanic aliases ──────────────────────────────────────────────────────────

export const MECHANIC_ALIASES: Array<{ alias: string; canonical: string }> = [
  { alias: 'dev wounds', canonical: 'devastating wounds' },
  { alias: 'devs', canonical: 'devastating wounds' },
  { alias: 'critical wound', canonical: 'devastating wounds' },
  { alias: 'crit', canonical: 'devastating wounds' },
  { alias: 'sus hits', canonical: 'sustained hits' },
  { alias: 'sustained', canonical: 'sustained hits' },
  { alias: 'exploding 6s', canonical: 'sustained hits' },
  { alias: 'exploding 6', canonical: 'sustained hits' },
  { alias: 'critical hit', canonical: 'sustained hits' },
  { alias: 'auto wound', canonical: 'lethal hits' },
  { alias: 'fnp', canonical: 'feel no pain' },
  { alias: 'mortal', canonical: 'mortal wound' },
  { alias: 'mortals', canonical: 'mortal wound' },
  { alias: 'ap', canonical: 'armour penetration' },
  { alias: 'invuln', canonical: 'invulnerable' },
  { alias: 'obs sec', canonical: 'objective control' },
  { alias: 'ob sec', canonical: 'objective control' },
  { alias: 'obsec', canonical: 'objective control' },
  { alias: 'oc', canonical: 'objective control' },
  // Army rule abbreviations
  { alias: 'ftgg', canonical: 'for the greater good' },
  { alias: 'bok', canonical: 'blessings of khorne' },
  { alias: 'oath', canonical: 'oath of moment' },
]

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Detects all factions from query text.
 *
 * - Chapter/legion/craftworld names map to their parent faction slug via
 *   `SUBFACTION_TO_PARENT`, and the chapter slug itself is also added so
 *   retrieval walks `dim_subfaction` to union the parent faction's shared
 *   pool.
 * - When "chaos space marine" matches, "space marine" is suppressed (the full
 *   matched text is consumed so the substring can't also match).
 *
 * Ordering (PR F, 2026-07-03-scalar-to-ref-refactor):
 *   1. Parent factions the user EXPLICITLY named (e.g. "Space Marines" in
 *      "How does the Space Marines Rhino work?") come first — they're the
 *      broader scope the user asked for, and `factions[0]` drives the browse /
 *      Ask auto-filter chip.
 *   2. Chapter slugs come next (e.g. "Blood Angels" in "Blood Angels tactics").
 *   3. Implied parents (added only because a chapter word was found) come last.
 *
 * All matching is whole-word (word-boundary `\b`) to prevent chapter aliases
 * like "damned" or "salamanders" from firing on substrings inside unrelated
 * text.
 */
export function detectFactions(query: string): { factions: string[] } {
  const lower = query.toLowerCase()

  // Track consumed text ranges to prevent double-matching substrings
  const consumed: Array<[number, number]> = []

  // Slugs matched by category, so we can order the final list per the rules
  // in the docstring above.
  const explicitParents = new Set<string>()
  const chapters = new Set<string>()
  const impliedParents = new Set<string>()

  let chapterMatched = false

  // Check chapter abbreviations first (e.g., "BA" → "blood angels").
  for (const [abbr, sf] of Object.entries(ABBREVIATION_TO_SUBFACTION)) {
    const re = new RegExp(`\\b${abbr}\\b`, 'i')
    const m = re.exec(lower)
    if (m) {
      if (sf) {
        // Chapter abbreviation (e.g., BA → blood angels)
        const parent = SUBFACTION_TO_PARENT[sf]
        if (parent) {
          chapters.add(subfactionSlug(sf))
          impliedParents.add(parent)
          chapterMatched = true
          consumed.push([m.index, m.index + m[0].length])
        }
      } else {
        // Plain faction abbreviation (e.g., SM → space-marines)
        explicitParents.add('space-marines')
        consumed.push([m.index, m.index + m[0].length])
      }
      break
    }
  }

  // Check chapter/legion keywords — they imply a parent faction.
  // WHOLE-WORD matching only: "damned" must appear as a token, not as a
  // substring of "damnedly" or "goddamned". Same for shorter aliases like
  // "asuryani" or "salamanders" if they ever grew a substring collision.
  if (!chapterMatched) {
    for (const [sf, parent] of Object.entries(SUBFACTION_TO_PARENT)) {
      // Whole-word match only. SUBFACTION_TO_PARENT keys are already listed
      // in their canonical form (e.g. "blood angels", not "blood angel"), so
      // no trailing-plural allowance is needed here.
      const re = new RegExp(`\\b${escapeRegex(sf)}\\b`, 'i')
      const m = re.exec(lower)
      if (m) {
        chapters.add(subfactionSlug(sf))
        impliedParents.add(parent)
        consumed.push([m.index, m.index + m[0].length])
        break // only one chapter
      }
    }
  }

  for (const { pattern, slug } of FACTION_PATTERNS) {
    const startAnchor = /\w/.test(pattern[0]!) ? '\\b' : ''
    // End boundary: allow optional trailing 's' (plurals) then require word boundary
    const endAnchor = /\w/.test(pattern[pattern.length - 1]!) ? 's?\\b' : ''
    const re = new RegExp(`${startAnchor}${escapeRegex(pattern)}${endAnchor}`, 'gi')
    let m: RegExpExecArray | null
    let matched = false
    while ((m = re.exec(lower)) !== null) {
      const start = m.index
      const end = start + m[0].length
      const overlaps = consumed.some(([cs, ce]) => start < ce && end > cs)
      if (!overlaps) {
        consumed.push([start, end])
        matched = true
      }
    }
    if (matched) explicitParents.add(slug)
  }

  // Assemble the final ordered list:
  //   explicit parents → chapters → implied parents (dedup preserved).
  // Rationale: when a user says "Space Marines Rhino" they want SM scope. When
  // they say "Blood Angels tactics" they want BA (chapter) scope, with the SM
  // shared pool folded in via dim_subfaction downstream.
  const factions: string[] = []
  const seen = new Set<string>()
  const push = (slug: string) => {
    if (seen.has(slug)) return
    seen.add(slug)
    factions.push(slug)
  }
  for (const slug of explicitParents) push(slug)
  for (const slug of chapters) push(slug)
  for (const slug of impliedParents) push(slug)

  return { factions }
}

// ── Query stripping ───────────────────────────────────────────────────────────

/**
 * Removes faction and chapter names from query text so they don't pollute
 * semantic search. Uses the full FACTION_PATTERNS list (not a partial copy).
 *
 * @param query - original user query
 * @param detectedFactions - slug(s) returned by detectFactions
 */
export function stripFactionFromQuery(query: string, detectedFactions: string[]): string {
  if (detectedFactions.length === 0) return query

  let result = query

  // Build the set of patterns to remove: any pattern whose slug is detected
  const patternsToRemove = FACTION_PATTERNS.filter(({ slug }) =>
    detectedFactions.includes(slug),
  ).map(({ pattern }) => pattern)

  // Also remove chapter names that appear in SUBFACTION_TO_PARENT
  for (const [sf, parent] of Object.entries(SUBFACTION_TO_PARENT)) {
    if (detectedFactions.includes(parent)) {
      patternsToRemove.push(sf)
    }
  }

  // Sort longest first — "blood angels" before "blood angel" to avoid leaving trailing "s"
  patternsToRemove.sort((a, b) => b.length - a.length)

  for (const pattern of patternsToRemove) {
    // Remove "in <pattern>" phrases too, then bare pattern
    // Use word boundary + optional trailing 's' to catch plurals
    result = result.replace(new RegExp(`\\bin\\s+${escapeRegex(pattern)}s?\\b`, 'gi'), '')
    result = result.replace(new RegExp(`${escapeRegex(pattern)}s?\\b`, 'gi'), '')
  }

  return result
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Convert a chapter-name key (e.g. "blood angels") to its kebab-case slug
 * ("blood-angels"). Matches dim_subfaction.id values so retrieve can walk the
 * expansion helper.
 */
function subfactionSlug(name: string): string {
  return name.replace(/\s+/g, '-')
}

// ── Mechanic keyword extraction ───────────────────────────────────────────────

const MECHANIC_TERMS = [
  'sustained hits',
  'lethal hits',
  'devastating wounds',
  'hazardous',
  'blast',
  'torrent',
  'twin-linked',
  'rapid fire',
  'pistol',
  'melta',
  'lance',
  'anti-',
  'ignores cover',
  'indirect fire',
  'feel no pain',
  'deadly demise',
  'deep strike',
  'lone operative',
  'stealth',
  'scouts',
  'infiltrators',
  'battle-shock',
  'fights first',
  'overwatch',
  'wound roll',
  'hit roll',
  'saving throw',
  'engagement range',
  'coherency',
  'visibility',
  'cover',
  'advance',
  'fall back',
  'charge',
  'mortal wound',
  'invulnerable',
  'firing deck',
  'transport',
  'objective control',
  'armour penetration',
  // Army rules (matched via aliases like ftgg, oath, bok)
  'for the greater good',
  'blessings of khorne',
  'oath of moment',
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
  return MECHANIC_TERMS.filter((m) => expanded.includes(m))
}
