import { findSentenceBoundaries, splitAtHeadings } from './patterns'

/** Normalize smart quotes and dashes to ASCII equivalents. */
function normalizeUnicode(text: string): string {
  return text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, ' - ')
    .replace(/\u2026/g, '...')
}

/** Format stratagem keyword lines (WHEN:, TARGET:, EFFECT:, COST:). */
function formatStratagemLines(text: string): string {
  return text.replace(/\b(WHEN|TARGET|EFFECT|COST):\s*/g, '\n**$1:** ')
}

/** Insert line breaks at sentence boundaries within a block of text. */
function addSentenceBreaks(text: string): string {
  const boundaries = findSentenceBoundaries(text)
  if (boundaries.length === 0) return text

  const parts: string[] = []
  let prev = 0
  for (const boundary of boundaries) {
    parts.push(text.slice(prev, boundary).trim())
    prev = boundary
  }
  parts.push(text.slice(prev).trim())

  return parts.filter(Boolean).join('\n')
}

/**
 * Normalize a wall-of-text GW PDF markdown into structured markdown.
 *
 * - Inserts line breaks at sentence boundaries
 * - Detects ALL-CAPS headings and converts to ## markdown headings
 * - Formats stratagem WHEN/TARGET/EFFECT blocks
 * - Normalizes Unicode smart quotes to ASCII
 * - Preserves all original content verbatim (structure only, not content)
 */
export function normalizeMarkdown(input: string): string {
  if (!input.trim()) return ''

  let text = normalizeUnicode(input)

  // If the text already has reasonable line breaks (>10 lines), just clean up
  const existingLines = text.split('\n').filter(Boolean)
  if (existingLines.length > 10) {
    return text.replace(/\n{4,}/g, '\n\n\n')
  }

  // Split into sections at ALL-CAPS headings
  const sections = splitAtHeadings(text)

  if (sections.length === 0) {
    // No headings found — just add sentence breaks and stratagem formatting
    text = formatStratagemLines(text)
    return addSentenceBreaks(text)
  }

  // Get any text before the first heading
  const firstMatch = text.indexOf(sections[0]!.heading)
  const preamble = text.slice(0, firstMatch).trim()

  const parts: string[] = []

  if (preamble) {
    parts.push(addSentenceBreaks(preamble))
  }

  for (const section of sections) {
    parts.push(`\n## ${section.heading}\n`)
    let body = section.body
    body = formatStratagemLines(body)
    body = addSentenceBreaks(body)
    parts.push(body)
  }

  return parts
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}
