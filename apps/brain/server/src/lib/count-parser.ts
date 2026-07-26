/**
 * count-parser — deterministic natural-language → CountQuery classifier.
 *
 * When a user asks a count-shape question ("how many detachments does DA
 * have", "table of every faction and their unit count", "list all stratagems
 * with sustained hits"), we parse the question into a structured CountQuery
 * that /count can serve directly. The LLM only writes prose afterwards.
 *
 * Design intent (Rule 6 corollary + Micah's "mostly deterministic"): the
 * NUMBERS come from the cube, not from the LLM. The LLM's role shrinks to
 * language framing.
 *
 * The parser is intentionally conservative — if it can't confidently
 * classify a question, it returns null and /ask falls back to normal RAG.
 */
import type { CountQuery, CountResult } from './count'

// ── Category vocabulary (natural word → NodeCategory) ─────────────────────
const CATEGORY_LEXICON: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\bdetachment(?:s|\s+combos?)?\b/i, category: 'detachment' },
  { pattern: /\bstratagem(?:s)?\b/i, category: 'stratagem' },
  { pattern: /\benhancement(?:s)?\b/i, category: 'enhancement' },
  { pattern: /\bdatasheet(?:s)?\b/i, category: 'datasheet' },
  { pattern: /\bunit(?:s)?\b/i, category: 'datasheet' },
  { pattern: /\bcharacter(?:s)?(?:\s+models?)?\b/i, category: 'datasheet' },
  { pattern: /\barmy\s+rule(?:s)?\b/i, category: 'army-rule' },
  { pattern: /\bfaction\s+abilit(?:y|ies)\b/i, category: 'faction-ability' },
  { pattern: /\babilit(?:y|ies)\b/i, category: 'unit-ability' },
  { pattern: /\bweapon(?:s)?\b/i, category: 'weapon' },
  { pattern: /\bmission(?:s)?\b/i, category: 'mission' },
]

// Ability keywords worth extracting from the query as a keyword= filter.
// Only tokens users commonly ask about; anything else lets /count pass no
// keyword and the LLM narrates the full pool.
const KEYWORD_TOKENS = [
  'sustained hits',
  'lethal hits',
  'devastating wounds',
  'deep strike',
  'scouts',
  'stealth',
  'lone operative',
  'infiltrators',
  'fights first',
  'oath of moment',
  'feel no pain',
  'deadly demise',
  'twin-linked',
  'anti-vehicle',
  'anti-infantry',
  'blast',
  'torrent',
  'heavy',
  'assault',
  'rapid fire',
  'psyker',
  'leader',
  'character',
]

// ── Count-shape detection ─────────────────────────────────────────────────
const COUNT_SHAPE_PATTERNS = [
  /^\s*how\s+many\b/i,
  /^\s*count\s+(?:of|the)\b/i,
  /^\s*number\s+of\b/i,
  /^\s*list\s+(?:all\s+of\s+the|all|every|each)\b/i,
  /^\s*table\s+of\b/i,
  /\bgive\s+me\s+a\s+(?:list|table|count|breakdown)\b/i,
  /\btable\s+that\s+lists?\b/i,
  /\bfor\s+(?:each|every)\s+faction\b/i,
  /\bper\s+faction\b/i,
  /\b(?:list|table)\s+every\b/i,
]

const EDITION_LEXICON: Record<string, string> = {
  '11th': '11th',
  '10th': '10th',
  '9th': '9th',
  eleventh: '11th',
  tenth: '10th',
  ninth: '9th',
}

const ALL_FACTIONS_SIGNAL =
  /\b(every\s+faction|each\s+faction|all\s+factions|per\s+faction|by\s+faction|across\s+factions)\b/i

/**
 * Parse a natural-language question into a CountQuery. Returns null when the
 * question isn't count-shaped OR when we can't identify at least a category
 * (nothing to count).
 *
 * `detectedFactions` and `askEdition` come from the /ask pipeline — reused so
 * we honour the caller's faction detection + edition filter.
 */
export function parseCountQueryFromQuestion(
  question: string,
  detectedFactions: string[],
  askEdition: string,
): CountQuery | null {
  // Is this a count-shape question at all?
  const isCountShape = COUNT_SHAPE_PATTERNS.some((p) => p.test(question))
  if (!isCountShape) return null

  // Category: pick the first match; return null if none identified.
  let category: string | undefined
  for (const { pattern, category: cat } of CATEGORY_LEXICON) {
    if (pattern.test(question)) {
      category = cat
      break
    }
  }
  if (!category) return null

  // Keyword filter (optional): scan for any known ability token.
  let keyword: string | undefined
  const lower = question.toLowerCase()
  for (const kw of KEYWORD_TOKENS) {
    if (lower.includes(kw)) {
      keyword = kw
      break
    }
  }

  // Edition: honour the caller's edition unless the question explicitly names
  // a different one.
  let edition: string | undefined
  const editionMatch = question.match(/\b(11th|10th|9th|eleventh|tenth|ninth)\b/i)
  if (editionMatch) edition = EDITION_LEXICON[editionMatch[1]!.toLowerCase()]
  else if (askEdition !== 'any') edition = askEdition

  // Faction: use the FIRST detected faction (chapter expansion is baked into
  // fact rows' factionIds, so DA already inherits SM automatically).
  //
  // When the question explicitly asks for every/each faction, DON'T set a
  // faction filter — instead group by faction so the response is per-faction.
  const isEveryFaction = ALL_FACTIONS_SIGNAL.test(question)
  const faction = !isEveryFaction && detectedFactions.length > 0 ? detectedFactions[0] : undefined
  const group: CountQuery['group'] = isEveryFaction ? 'faction' : undefined

  return {
    category,
    edition,
    faction,
    keyword,
    group,
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────

/**
 * Format a CountResult as prose the /ask LLM can consume without re-doing
 * arithmetic. The block is labelled loudly so the model prefers it over
 * whatever Vectorize returned.
 */
export function renderCubeContext(q: CountQuery, r: CountResult): string {
  const lines: string[] = []
  lines.push(`DETERMINISTIC CUBE ANSWER (cube v${r.cubeVersion})`)
  lines.push(
    `Query: category=${q.category ?? '(any)'}, faction=${q.faction ?? '(all)'}, edition=${q.edition ?? '(any)'}${q.keyword ? `, keyword="${q.keyword}"` : ''}${q.group ? `, group=${q.group}` : ''}`,
  )
  lines.push('')

  // Special case: detachment questions with DP rollup — this is the money
  // shot for "how many detachment combos". Show per-faction DP breakdown +
  // pre-computed Strike Force combo count so the LLM never guesses.
  if (r.dpRollup && r.dpRollup.length > 0) {
    if (r.dpRollup.length === 1) {
      const d = r.dpRollup[0]!
      lines.push(
        `${d.displayName}: ${d.total} accessible 11e detachments — ${d.dp1} × 1 DP, ${d.dp2} × 2 DP, ${d.dp3} × 3 DP.`,
      )
      lines.push(`Strike Force combos (3 DP budget, no repeats): ${d.combosStrikeForce}.`)
      lines.push(
        `Formula used: (#3pt) + (#2pt × #1pt) + C(#1pt, 3) = ${d.dp3} + (${d.dp2} × ${d.dp1}) + C(${d.dp1}, 3) = ${d.combosStrikeForce}.`,
      )
    } else {
      lines.push('Per-faction detachment breakdown (chapter → parent inheritance applied):')
      lines.push('')
      lines.push('| Faction | 1 DP | 2 DP | 3 DP | Total | Combos (3 DP) |')
      lines.push('|---|---:|---:|---:|---:|---:|')
      for (const d of [...r.dpRollup].sort((a, b) => a.displayName.localeCompare(b.displayName))) {
        lines.push(
          `| ${d.displayName}${d.isChapter ? ' *(chapter)*' : ''} | ${d.dp1} | ${d.dp2} | ${d.dp3} | ${d.total} | ${d.combosStrikeForce} |`,
        )
      }
    }
  } else if (r.groups && r.groups.length > 0) {
    lines.push(`Grouped result (${r.groups.length} groups, total count ${r.count}):`)
    lines.push('')
    const cols = Object.keys(r.groups[0]!)
    lines.push('| ' + cols.join(' | ') + ' |')
    lines.push('|' + cols.map(() => '---').join('|') + '|')
    for (const g of r.groups) {
      lines.push('| ' + cols.map((c) => String(g[c] ?? '')).join(' | ') + ' |')
    }
  } else {
    lines.push(`Count: ${r.count}`)
  }

  if (r.pool && r.pool.length > 0) {
    lines.push('')
    lines.push(`Pool (${r.pool.length} shown${r.pool.length === 200 ? ', capped' : ''}):`)
    for (const p of r.pool.slice(0, 50)) {
      const suffix = [p.factionId, p.dp != null ? `${p.dp} DP` : null].filter(Boolean).join(', ')
      lines.push(`- ${p.title}${suffix ? ` (${suffix})` : ''}`)
    }
    if (r.pool.length > 50)
      lines.push(`… (+${r.pool.length - 50} more, ask if you need the full list)`)
  }

  lines.push('')
  lines.push(
    'INSTRUCTION FOR THE ANSWERING MODEL: The numbers above are authoritative — do not re-count, do not re-derive combo counts, do not doubt them. Format the answer using these numbers verbatim.',
  )
  return lines.join('\n')
}
