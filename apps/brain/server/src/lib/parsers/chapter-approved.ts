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
  'IT',
  'IS',
  'SCORES',
  'FOLLOWING',
  'ACTION',
  'ATK',
  'DEF',
  // "FOR PLAYERS USING TACTICAL / FIXED MISSIONS" block in twist cards
  'FOR',
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
const CONNECTOR_WORDS = new Set(['THE', 'AND', 'OR', 'OF', 'A', 'IN', 'TO'])

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

  return nameTokens.join(' ').trim()
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
    const headerLine = isAsymmetric
      ? `${title} PRIMARY MISSION — ASYMMETRIC WAR`
      : `${title} PRIMARY MISSION`

    const content = [headerLine, body].join('\n\n').trim()
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
      keywords: extractMissionKeywords(title, content, ['primary mission']),
    })
  }

  return nodes
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

    const fixedLabel = isFixed ? ' (FIXED)' : ''
    const content = [`${title} SECONDARY MISSION${fixedLabel}`, body].join('\n\n').trim()
    const id = `ca:secondary:${sidePrefix}:${slugify(title)}`

    if (seenIds.has(id)) continue
    seenIds.add(id)

    const extraKeywords = ['secondary mission', ...(isFixed ? ['fixed'] : [])]

    nodes.push({
      id,
      layer: 'core',
      category: 'secondary-mission',
      title,
      content,
      summary: makeSummary(content),
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractMissionKeywords(title, content, extraKeywords),
    })
  }

  return nodes
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
