import { truncate } from '../filters'
import type { Node, Source } from '../model'
import { slugify } from '../slugify'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize smart/curly quotes and other typographic characters to ASCII equivalents.
 * Extracted text from PDFs often contains Unicode punctuation that breaks string matching.
 */
function normalizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02bc]/g, "'") // curly single quotes / apostrophe
    .replace(/[\u201c\u201d]/g, '"') // curly double quotes
    .replace(/\u2013/g, '-') // en dash
    .replace(/\u2014/g, '--') // em dash
}

function makeSummary(content: string): string {
  return truncate(content, 150)
}

function extractMissionKeywords(title: string, content: string, extra: string[] = []): string[] {
  const base = [title.toLowerCase(), ...extra]
  const combined = `${title} ${content}`.toLowerCase()

  const terms = ['objective', 'action', 'fixed', 'vp', 'deployment zone', "no man's land"]
  const found = terms.filter((t) => combined.includes(t))
  return [...new Set([...base, ...found])]
}

/**
 * Words that appear as noise between cards (VP totals, round indicators, body-text caps phrases).
 * These should NOT be part of card titles. Includes common English stop words AND
 * domain-specific body-text words that appear capitalised in the raw extracted text.
 */
const NOISE_WORDS = new Set([
  // VP / scoring noise
  'VP',
  'MAX',
  // Round / timing indicators
  'ROUND',
  'ONWARDS',
  'SECOND',
  'THIRD',
  'FOURTH',
  'FIFTH',
  // Filler / small function words unlikely in card names
  'BATTLE',
  'ANY',
  'AT',
  'BY',
  'FROM',
  'THAT',
  'ARE',
  'THIS',
  'FIRST',
  // Rule-text section headers (appear capitalised in PDF body)
  'STARTS',
  'UNITS',
  'COMPLETES',
  'WHEN',
  'IF',
  'EACH',
  'PLAYER',
  'WHOSE',
  'TURN',
  'IS',
  'SCORES',
  'FOLLOWING',
  'ACTION',
  'ATK',
  'DEF',
  // "FOR PLAYERS USING TACTICAL / FIXED MISSIONS" block in twist cards
  'PLAYERS',
  'USING',
  'TACTICAL',
  'MISSIONS',
  'MISSION',
  // Generic rule-text words
  'THEIR',
  'DRAWN',
  'ACTIVE',
])

/**
 * Small connector words that are valid WITHIN card names but can appear as noise too.
 * When we're already building a card name candidate, we allow these through.
 * But they can't START a card name (we don't let them be the first word accepted).
 */
const CONNECTOR_WORDS = new Set(['THE', 'AND', 'OR', 'OF', 'A', 'IN', 'TO', 'IT', 'FOR', 'ON', 'ALL'])

/**
 * Extract the card name from the text preceding a separator.
 * The card name is the LAST contiguous run of "clean" ALL-CAPS words before the separator.
 *
 * Strategy: tokenize on spaces, walk backward from the separator, collect words
 * that look like card name words, stop when we hit a noise word or number.
 * Connector words (THE, AND, OR, OF) are allowed in the middle of card names
 * but cannot start one.
 */
function extractCardNameFromPrecedingText(text: string): string {
  // Split into tokens
  const tokens = text.trim().split(/\s+/)
  const nameTokens: string[] = []

  // Walk backward
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!
    // Strip trailing punctuation for checking
    const clean = token.replace(/[^A-Z\-']/g, '')

    // Stop if it contains lowercase (body text) or is empty
    if (!clean || /[a-z]/.test(token)) break

    // Stop if it's a number or VP amount like "5" or "(MAX"
    if (/^\d/.test(token) || /^\(/.test(token)) break

    // Stop if it's an arrow or symbol
    if (/^[↑↓+→←]/.test(token)) break

    // Connector words are allowed inside a card name (e.g. TAKE AND HOLD, LORDS OF WAR)
    // but only if we already have at least one real word
    if (CONNECTOR_WORDS.has(clean)) {
      if (nameTokens.length === 0) break // can't start a name with a connector
      nameTokens.unshift(token)
      continue
    }

    // Stop if it's a noise word (and not a connector already handled above)
    if (NOISE_WORDS.has(clean)) break

    nameTokens.unshift(token)
  }

  // Remove leading connectors that ended up at the front (e.g. if we hit a connector first)
  while (nameTokens.length > 0 && CONNECTOR_WORDS.has(nameTokens[0]!)) {
    nameTokens.shift()
  }

  let name = nameTokens.join(' ').trim()

  // Known multi-word card names where noise words appear in the middle
  // These can't be extracted by the backward walk because "BATTLE" etc. are noise
  const KNOWN_NAMES: Record<string, string> = {
    'ENEMY LINES': 'BEHIND ENEMY LINES',
    'LINES': 'EXTEND BATTLE LINES',
    'PRISONERS': 'NO PRISONERS',
  }
  if (KNOWN_NAMES[name]) name = KNOWN_NAMES[name]

  return name
}

/**
 * Split text on a separator pattern and return pairs of (precedingText, body).
 * Uses literal string matching on the separator rather than regex capture groups.
 */
function splitOnSeparator(
  text: string,
  separatorPattern: RegExp,
): Array<{ preceding: string; separator: string; body: string }> {
  const results: Array<{ preceding: string; separator: string; body: string }> = []
  const matches = [...text.matchAll(separatorPattern)]

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    const matchStart = match.index!
    const matchEnd = matchStart + match[0].length

    // Text before this separator (from end of previous separator or start)
    const prevEnd = i === 0 ? 0 : matches[i - 1]!.index! + matches[i - 1]![0].length
    const preceding = text.slice(prevEnd, matchStart)

    // Text after this separator (up to next separator)
    const nextStart = i + 1 < matches.length ? matches[i + 1]!.index! : text.length
    const body = text.slice(matchEnd, nextStart).trim()

    results.push({ preceding, separator: match[0], body })
  }

  return results
}

// ── Primary Missions ──────────────────────────────────────────────────────────

/**
 * Parse primary mission markdown into brain nodes.
 *
 * Card boundary: "PRIMARY MISSION" or "PRIMARY MISSION - ASYMMETRIC WAR".
 * The card name is the last contiguous ALL-CAPS phrase before the separator.
 */
export function parsePrimaryMissions(markdown: string, retrievedAt: string): Node[] {
  const text = normalizeText(markdown)
  const source: Source = {
    type: 'pdf',
    title: 'Chapter Approved Primary Missions',
    retrievedAt,
  }

  // Split on PRIMARY MISSION (optionally followed by - ASYMMETRIC WAR)
  const separatorPattern = /PRIMARY MISSION(?:\s*-\s*ASYMMETRIC WAR)?/g
  const splits = splitOnSeparator(text, separatorPattern)

  const nodes: Node[] = []
  const seenIds = new Set<string>()

  for (const { preceding, separator, body } of splits) {
    const title = extractCardNameFromPrecedingText(preceding)
    if (!title || title.length < 2) continue

    const isAsymmetric = separator.includes('ASYMMETRIC WAR')
    const fullTitle = isAsymmetric ? `${title} - ASYMMETRIC WAR` : title

    // Parse structured fields from the body
    const structured = parseMissionContent(body)
    const content = formatMissionContent(fullTitle, 'PRIMARY', structured)

    const id = `ca:primary:${slugify(title)}`

    if (seenIds.has(id)) continue
    seenIds.add(id)

    nodes.push({
      id,
      layer: 'core',
      category: 'primary-mission',
      title: fullTitle,
      content,
      summary: makeSummary(content),
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractMissionKeywords(title, content, [
        'primary mission',
        ...(isAsymmetric ? ['asymmetric war'] : []),
        ...(structured.hasAction ? ['action'] : []),
      ]),
    })
  }

  return nodes
}

/**
 * Scoring bar pattern — the brown/teal bars that separate scoring sections on cards.
 * Examples: "SECOND BATTLE ROUND ONWARDS VP", "ANY BATTLE ROUND VP",
 * "ANY BATTLE ROUND - TACTICAL VP", "ANY BATTLE ROUND - FIXED VP",
 * "SECOND BATTLE ROUND ONWARDS (DEF) VP", "ANY TIME (ATTACKER) VP"
 */
const SCORING_BAR_RE = /(?:SECOND BATTLE ROUND ONWARDS|ANY BATTLE ROUND|ANY TIME)(?:\s*[-–]\s*(?:TACTICAL|FIXED))?(?:\s*\([^)]*\))?\s*VP/g

/**
 * Parse structured scoring data from raw mission body text.
 *
 * Strategy: split the body on scoring bar patterns (the brown/teal bars on the cards).
 * Each bar delimits a scoring section. Within each section, extract WHEN + condition→VP pairs.
 * The text BEFORE the first bar is the description + optional action block.
 */
function parseMissionContent(body: string): {
  description: string
  scoringBlocks: Array<{ timing: string; when: string; conditions: Array<{ condition: string; vp: string; connector?: string }> }>
  action?: { name: string; starts: string; units: string; completes: string; ifCompleted: string }
  maxVp?: string
  hasAction: boolean
} {
  const scoringBlocks: Array<{ timing: string; when: string; conditions: Array<{ condition: string; vp: string; connector?: string }> }> = []
  let action: { name: string; starts: string; units: string; completes: string; ifCompleted: string } | undefined
  let maxVp: string | undefined

  // Extract max VP from anywhere in the body
  const maxMatch = body.match(/\(MAX\s+(\d+\s*VP)\)/i)
  if (maxMatch) maxVp = maxMatch[1]!.replace(/\s+/g, '')

  // Extract action block (appears before scoring bars)
  const actionNameMatch = body.match(/([A-Z][A-Z\s]+)\(ACTION\)/)
  if (actionNameMatch) {
    // Action block text is from (ACTION) to the first scoring bar
    const actionStart = body.indexOf(actionNameMatch[0])
    const firstBarMatch = SCORING_BAR_RE.exec(body)
    SCORING_BAR_RE.lastIndex = 0 // reset
    const actionEnd = firstBarMatch ? firstBarMatch.index! : body.length
    const actionBlock = body.slice(actionStart, actionEnd)

    const extract = (label: string) => {
      const m = actionBlock.match(new RegExp(`${label}:\\s*(.+?)(?=(?:STARTS|UNITS|COMPLETES|IF COMPLETED):|$)`, 'is'))
      return m?.[1]?.trim().replace(/\s+/g, ' ') || ''
    }

    action = {
      name: actionNameMatch[1]!.trim(),
      starts: extract('STARTS'),
      units: extract('UNITS'),
      completes: extract('COMPLETES'),
      ifCompleted: extract('IF COMPLETED'),
    }
  }

  // Split body on scoring bars
  const barMatches = [...body.matchAll(SCORING_BAR_RE)]

  for (let i = 0; i < barMatches.length; i++) {
    const barMatch = barMatches[i]!
    const timing = barMatch[0].replace(/\s*VP\s*$/, '').trim()

    // Section text = from end of this bar to start of next bar (or end of body)
    const sectionStart = barMatch.index! + barMatch[0].length
    const sectionEnd = i + 1 < barMatches.length ? barMatches[i + 1]!.index! : body.length
    const section = body.slice(sectionStart, sectionEnd).trim()

    // Extract WHEN
    const whenMatch = section.match(/^WHEN:\s*(.+?)(?=\n|(?:[A-Z][a-z]))/s)
    const when = whenMatch?.[1]?.trim().replace(/\s+/g, ' ') || ''

    // Extract condition→VP pairs
    // VP values appear as "N VP" (possibly with "(MAX NVP)") at the end of a condition
    const conditions: Array<{ condition: string; vp: string; connector?: string }> = []

    // Split section into segments on AND/OR connectors
    const segments = section.split(/\b(AND|OR)\b/).map(s => s.trim())

    for (let j = 0; j < segments.length; j++) {
      const seg = segments[j]!
      if (seg === 'AND' || seg === 'OR') continue

      // Find VP value in this segment
      const vpMatch = seg.match(/(\+?\d+\s*VP)(?:\s*\((?:MAX\s*\d+VP|FIXED|TACTICAL)\))?/i)
      if (vpMatch) {
        // Condition is everything before the VP value, minus WHEN prefix and noise
        let condition = seg.slice(0, seg.indexOf(vpMatch[0])).trim()
        condition = condition.replace(/^WHEN:[^.]+\.\s*/i, '').trim()
        // Clean up noise words at the start
        condition = condition.replace(/^(?:The player whose turn it is\s*(?:scores)?:?\s*|Each player scores:?\s*)/i, '').trim()
        if (!condition) condition = seg.replace(vpMatch[0], '').replace(/^WHEN:[^.]+\.\s*/i, '').trim()

        // Determine connector with next condition
        const nextSeg = segments[j + 1]
        const connector = (nextSeg === 'AND' || nextSeg === 'OR') ? nextSeg as 'AND' | 'OR' : undefined

        // Extract full VP string including max
        const fullVpMatch = seg.match(/(\+?\d+\s*VP(?:\s*\([^)]*\))?)/)
        const vp = fullVpMatch?.[1]?.trim() || vpMatch[1]!.trim()

        if (condition.length > 3 || conditions.length === 0) {
          conditions.push({ condition: condition || 'See card text', vp, connector })
        }
      }
    }

    if (conditions.length > 0 || when) {
      scoringBlocks.push({ timing, when, conditions })
    }
  }

  // Description = text before the first scoring bar or action block
  let descEnd = body.length
  if (barMatches.length > 0) descEnd = Math.min(descEnd, barMatches[0]!.index!)
  if (actionNameMatch) {
    const actionIdx = body.indexOf(actionNameMatch[0])
    if (actionIdx >= 0) descEnd = Math.min(descEnd, actionIdx)
  }
  // Also stop at WHEN DRAWN: — it's part of the description
  let description = body.slice(0, descEnd).trim()
  // Clean up description — remove trailing noise
  description = description.replace(/\s+/g, ' ').trim()

  return { description, scoringBlocks, action, maxVp, hasAction: !!action }
}

/**
 * Format parsed mission data into structured markdown content.
 */
function formatMissionContent(
  title: string,
  type: 'PRIMARY' | 'SECONDARY',
  parsed: ReturnType<typeof parseMissionContent>,
): string {
  const lines: string[] = []

  if (parsed.description) {
    lines.push(parsed.description)
    lines.push('')
  }

  if (parsed.action) {
    lines.push(`**ACTION: ${parsed.action.name}**`)
    if (parsed.action.starts) lines.push(`- **Starts:** ${parsed.action.starts}`)
    if (parsed.action.units) lines.push(`- **Units:** ${parsed.action.units}`)
    if (parsed.action.completes) lines.push(`- **Completes:** ${parsed.action.completes}`)
    if (parsed.action.ifCompleted) lines.push(`- **If Completed:** ${parsed.action.ifCompleted}`)
    lines.push('')
  }

  for (const block of parsed.scoringBlocks) {
    lines.push(`**${block.timing}**`)
    if (block.when) lines.push(`**WHEN:** ${block.when}`)
    for (const cond of block.conditions) {
      const conn = cond.connector ? ` *(${cond.connector})*` : ''
      lines.push(`- ${cond.condition} → **${cond.vp}**${conn}`)
    }
    lines.push('')
  }

  if (parsed.maxVp) {
    lines.push(`**Max VP:** ${parsed.maxVp}`)
  }

  return lines.join('\n').trim()
}

// ── Secondary Missions ────────────────────────────────────────────────────────

/**
 * Parse secondary mission markdown into brain nodes.
 *
 * Card boundary: "FIXED - SECONDARY MISSION" or "SECONDARY MISSION".
 * Fixed appears as a prefix before the separator text.
 */
export function parseSecondaryMissions(
  markdown: string,
  side: 'attacker' | 'defender',
  retrievedAt: string,
): Node[] {
  const text = normalizeText(markdown)
  const sideLabel = side === 'attacker' ? 'Attacker' : 'Defender'
  const sidePrefix = side === 'attacker' ? 'atk' : 'def'
  const source: Source = {
    type: 'pdf',
    title: `Chapter Approved Secondary Missions ${sideLabel}`,
    retrievedAt,
  }

  // Split on SECONDARY MISSION (optionally preceded by "FIXED - ")
  // We capture the full separator including optional FIXED prefix
  const separatorPattern = /(?:FIXED\s*-\s*)?SECONDARY MISSION/g
  const splits = splitOnSeparator(text, separatorPattern)

  const nodes: Node[] = []
  const seenIds = new Set<string>()

  for (const { preceding, separator, body } of splits) {
    const isFixed = separator.startsWith('FIXED')

    // For fixed cards, the card name comes before "FIXED" in the preceding text.
    // The "FIXED" itself is part of the separator, not the title.
    const title = extractCardNameFromPrecedingText(preceding)
    if (!title || title.length < 2) continue

    // Clean up body text into structured markdown
    const content = formatSecondaryContent(title, body, isFixed)
    const maxMatch = body.match(/\(MAX\s+(\d+\s*VP)\)/i)
    const maxVp = maxMatch ? maxMatch[1]!.replace(/\s+/g, '') : undefined
    const hasAction = /\(ACTION\)/i.test(body)
    const id = `ca:secondary:${sidePrefix}:${slugify(title)}`

    if (seenIds.has(id)) continue
    seenIds.add(id)

    const extraKeywords = ['secondary mission', ...(isFixed ? ['fixed'] : []), ...(hasAction ? ['action'] : [])]

    nodes.push({
      id,
      layer: 'core',
      category: 'secondary-mission',
      title,
      content,
      summary: `${title}${isFixed ? ' (Fixed)' : ''} — Secondary Mission (${sideLabel})${maxVp ? ` (max ${maxVp})` : ''}`,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractMissionKeywords(title, content, extraKeywords),
    })
  }

  return nodes
}

/**
 * Format secondary mission body into structured markdown.
 * Secondary cards have: optional WHEN DRAWN, optional ACTION block,
 * then scoring sections separated by timing bars or WHEN labels.
 * VP values appear as "N VP" paired with preceding condition text.
 */
function formatSecondaryContent(title: string, body: string, isFixed: boolean): string {
  const lines: string[] = []

  // Extract WHEN DRAWN
  const whenDrawnMatch = body.match(/^WHEN DRAWN:\s*(.+?)(?=(?:ANY BATTLE|SECOND BATTLE|WHEN:|STARTS:|\([A-Z]+\)))/is)
  if (whenDrawnMatch) {
    lines.push(`**WHEN DRAWN:** ${whenDrawnMatch[1]!.trim().replace(/\s+/g, ' ')}`)
    lines.push('')
  }

  // Extract action block
  const actionMatch = body.match(/([A-Z][A-Z\s]+)\(ACTION\)\s*(.*?)(?=(?:ANY BATTLE|SECOND BATTLE|$))/is)
  if (actionMatch) {
    const actionName = actionMatch[1]!.trim()
    const actionBody = actionMatch[2]!.trim()
    lines.push(`**ACTION: ${actionName}**`)

    const extract = (label: string) => {
      const m = actionBody.match(new RegExp(`${label}:\\s*(.+?)(?=(?:STARTS|UNITS|COMPLETES|IF COMPLETED):|$)`, 'is'))
      return m?.[1]?.trim().replace(/\s+/g, ' ') || ''
    }
    const starts = extract('STARTS')
    const units = extract('UNITS')
    const completes = extract('COMPLETES')
    const ifCompleted = extract('IF COMPLETED')
    if (starts) lines.push(`- **Starts:** ${starts}`)
    if (units) lines.push(`- **Units:** ${units}`)
    if (completes) lines.push(`- **Completes:** ${completes}`)
    if (ifCompleted) lines.push(`- **If Completed:** ${ifCompleted}`)
    lines.push('')
  }

  // Remove action block and WHEN DRAWN from body for scoring extraction
  let scoringText = body
  if (whenDrawnMatch) scoringText = scoringText.replace(whenDrawnMatch[0], '')
  if (actionMatch) scoringText = scoringText.replace(actionMatch[0], '')

  // Strategy: the PDF text extraction puts all conditions first, then all VP values.
  // Split into: condition sentences (everything that's not VP/noise) and VP values.
  // Then pair them positionally.

  // Remove scoring bar noise from text
  let cleanText = scoringText
    .replace(/(?:SECOND BATTLE ROUND ONWARDS|ANY BATTLE ROUND|ANY TIME)(?:\s*[-–]\s*(?:TACTICAL|FIXED))?(?:\s*\([^)]*\))?\s*VP/gi, '')
    .replace(/[↑↓]+(?:OR|AND)?/g, ' ')
    .trim()

  // Extract all VP values in order
  const vpValues = [...cleanText.matchAll(/\+?(\d+\s*VP)(?:\s*\(([^)]*)\))?/gi)]
    .map(m => m[2] ? `${m[1]!.trim()} (${m[2].trim()})` : m[1]!.trim())

  // Remove VP values from text to get just conditions
  let condText = cleanText.replace(/\+?\d+\s*VP(?:\s*\([^)]*\))?/gi, '').trim()

  // Split on WHEN: to get scoring sections
  const whenSections = condText.split(/(?=WHEN:)/i).filter(s => s.trim().length > 0)

  // For each WHEN section, extract the timing and conditions
  let vpIndex = 0
  for (const section of whenSections) {
    const whenMatch = section.match(/^WHEN:\s*([^.]+\.)/i)
    if (whenMatch) {
      lines.push(`**WHEN:** ${whenMatch[1]!.trim()}`)
      // Get condition sentences after the WHEN line
      const afterWhen = section.slice(whenMatch[0].length).trim()
      // Split into sentences (conditions)
      const sentences = afterWhen
        .split(/(?<=\.)\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 5 && !/^(?:AND|OR)$/i.test(s))

      for (const sent of sentences) {
        if (vpIndex < vpValues.length) {
          lines.push(`- ${sent} → **${vpValues[vpIndex]}**`)
          vpIndex++
        } else {
          lines.push(`- ${sent}`)
        }
      }
      lines.push('')
    }
  }

  // If there are remaining VP values not paired, list them
  if (vpIndex < vpValues.length) {
    const remaining = vpValues.slice(vpIndex)
    for (const vp of remaining) {
      lines.push(`- → **${vp}**`)
    }
  }

  // Max VP
  const maxMatch = body.match(/\(MAX\s+(\d+\s*VP)\)/i)
  if (maxMatch) {
    lines.push('')
    lines.push(`**Max VP:** ${maxMatch[1]!.replace(/\s+/g, '')}`)
  }

  // Clean up: remove leaked next-card titles from the last line
  // These appear as ALL-CAPS words at the end (e.g., "CULL THE HORDE", "BRING IT DOWN")
  if (lines.length > 0) {
    const lastIdx = lines.length - 1
    // Remove trailing ALL-CAPS phrases that are likely next-card names
    lines[lastIdx] = lines[lastIdx]!.replace(/\s+[A-Z][A-Z\s]{3,}$/, '').trim()
    // Remove empty lines at end
    while (lines.length > 0 && !lines[lines.length - 1]!.trim()) lines.pop()
  }

  // If nothing was extracted, fall back to cleaned raw text
  if (lines.length === 0) {
    return body.replace(/\s+/g, ' ').trim()
  }

  return lines.join('\n').trim()
}

// ── Twist Cards ───────────────────────────────────────────────────────────────

/**
 * Parse twist card markdown into brain nodes.
 *
 * Card boundary: "TWIST" (word boundary). Card name precedes it.
 */
export function parseTwistCards(markdown: string, retrievedAt: string): Node[] {
  const text = normalizeText(markdown)
  const source: Source = {
    type: 'pdf',
    title: 'Chapter Approved Twist Cards',
    retrievedAt,
  }

  // Split on TWIST (as a whole word)
  const separatorPattern = /\bTWIST\b/g
  const splits = splitOnSeparator(text, separatorPattern)

  const nodes: Node[] = []
  const seenIds = new Set<string>()

  for (const { preceding, body } of splits) {
    const title = extractCardNameFromPrecedingText(preceding)
    if (!title || title.length < 2) continue

    // Skip "TWIST" if it appears within card body text (e.g., "FOR PLAYERS USING TACTICAL")
    // We check that the preceding text ends with an all-caps phrase (the card name itself)
    // extractCardNameFromPrecedingText already handles this — if it returns noise, skip.

    const content = [`${title} TWIST`, body].join('\n\n').trim()
    const id = `ca:twist:${slugify(title)}`

    if (seenIds.has(id)) continue
    seenIds.add(id)

    nodes.push({
      id,
      layer: 'core',
      category: 'twist',
      title,
      content,
      summary: makeSummary(content),
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractMissionKeywords(title, content, ['twist']),
    })
  }

  return nodes
}

// ── Challenger Cards ──────────────────────────────────────────────────────────

/**
 * Stratagem names paired with challenger missions (from the challenger cards file).
 * Each challenger card has a mission name and a paired stratagem name — both ALL CAPS.
 * The text before "CHALLENGER MISSION" contains both: MISSION_NAME STRATAGEM_NAME.
 */
const KNOWN_CHALLENGER_STRATAGEMS = [
  'PIVOTAL MOMENT',
  'HARBORED POWER',
  'RENEWED FOCUS',
  'BURST OF SPEED',
  'GREAT HASTE',
  'FORCE A BREACH',
  'ALL IN',
  'OPPORTUNISTIC STRIKE',
  'STRATEGIC RETREAT',
]

/**
 * Split "MISSION_NAME STRATAGEM_NAME" into the two parts.
 * The stratagem name is always the last N words that match a known stratagem.
 * Falls back to taking the last 2 words if no match.
 */
function splitMissionAndStratagem(text: string): { missionName: string; stratagemName: string } {
  const normalized = text.trim()

  // Try known stratagem names (longest first to avoid partial matches).
  // We only accept a match if the stratagem is at the VERY END of the text
  // (optionally followed by whitespace), meaning it's the immediate predecessor
  // of CHALLENGER MISSION. This prevents false-positives from body content.
  const sorted = [...KNOWN_CHALLENGER_STRATAGEMS].sort((a, b) => b.length - a.length)
  for (const stratagem of sorted) {
    if (normalized.endsWith(stratagem)) {
      const missionRaw = normalized.slice(0, normalized.length - stratagem.length).trim()
      const missionExtracted = extractCardNameFromPrecedingText(missionRaw)
      return {
        missionName: missionExtracted || missionRaw,
        stratagemName: stratagem,
      }
    }
  }

  // No stratagem found at end — the entire tail of the preceding text is just the mission name.
  // Extract it using the backward walk.
  const missionName = extractCardNameFromPrecedingText(normalized)
  return { missionName, stratagemName: '' }
}

/**
 * Parse challenger card markdown into brain nodes.
 *
 * Each challenger card has:
 * 1. A mission name (VP conditions)
 * 2. A paired stratagem name + type + CP cost
 *
 * Card boundary: "CHALLENGER MISSION". Before it: mission name + stratagem name.
 */
export function parseChallengerCards(markdown: string, retrievedAt: string): Node[] {
  const text = normalizeText(markdown)
  const source: Source = {
    type: 'pdf',
    title: 'Chapter Approved Challenger Cards',
    retrievedAt,
  }

  const separatorPattern = /CHALLENGER MISSION/g
  const splits = splitOnSeparator(text, separatorPattern)

  const nodes: Node[] = []
  const seenIds = new Set<string>()

  for (const { preceding, body } of splits) {
    const trimmedPreceding = preceding.trim()
    if (!trimmedPreceding) continue

    // Extract both parts from the preceding text
    const { missionName, stratagemName } = splitMissionAndStratagem(trimmedPreceding)
    if (!missionName || missionName.length < 2) continue

    // Extract stratagem type and CP from body
    const stratagemTypeMatch = body.match(
      /^(STRATEGIC PLOY|BATTLE TACTIC|WARGEAR|EPIC DEED)\s+(\d+)\s+CP/,
    )
    const stratagemType = stratagemTypeMatch ? stratagemTypeMatch[1]! : ''
    const cpCost = stratagemTypeMatch ? stratagemTypeMatch[2]! : '0'

    const headerParts = [`${missionName} CHALLENGER MISSION`]
    if (stratagemName) {
      headerParts.push(
        `Paired Stratagem: ${stratagemName}${stratagemType ? ` (${stratagemType}, ${cpCost} CP)` : ''}`,
      )
    }

    const content = [...headerParts, body].join('\n\n').trim()
    const id = `ca:challenger:${slugify(missionName)}`

    if (seenIds.has(id)) continue
    seenIds.add(id)

    const extraKeywords = ['challenger', ...(stratagemName ? [stratagemName.toLowerCase()] : [])]

    nodes.push({
      id,
      layer: 'core',
      category: 'challenger',
      title: missionName,
      content,
      summary: makeSummary(content),
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractMissionKeywords(missionName, content, extraKeywords),
    })
  }

  return nodes
}
