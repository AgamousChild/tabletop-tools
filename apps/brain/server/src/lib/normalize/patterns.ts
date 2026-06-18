/** Check if text is an ALL-CAPS section heading (2+ words). */
export function isSectionHeading(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  // Allow optional leading number (e.g. "1 COMMAND PHASE")
  const pattern = /^(\d+\s+)?[A-Z][A-Z\s]+$/
  if (!pattern.test(trimmed)) return false
  // Must have at least 2 ALL-CAPS words (excluding leading number)
  const withoutNumber = trimmed.replace(/^\d+\s+/, '')
  const words = withoutNumber.split(/\s+/).filter(Boolean)
  return words.length >= 2
}

/** Check if text matches a page reference pattern like (PG 5-9). */
export function isPageReference(text: string): boolean {
  return /^\(PG\s+\d+(?:-\d+)?\)$/i.test(text.trim())
}

/** Check if text starts with a stratagem keyword (WHEN:, TARGET:, EFFECT:, COST:). */
export function isStratagemBlock(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  return /^(WHEN|TARGET|EFFECT|COST):\s/i.test(trimmed)
}

// Common abbreviations that should NOT be treated as sentence endings
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'pg', 'p'])

/**
 * Find character indices where sentence boundaries occur.
 * Returns indices pointing to the first character of the next sentence.
 */
export function findSentenceBoundaries(text: string): number[] {
  const boundaries: number[] = []
  // Match period/question/exclamation followed by space(s) and an uppercase letter or quote
  const pattern = /([.!?])(\s+)(?=[A-Z\u201C"])/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const matchIndex = match.index
    // Check if this looks like an abbreviation
    const beforeSlice = text.slice(Math.max(0, matchIndex - 10), matchIndex)
    const wordBefore = beforeSlice.split(/\s/).pop() || ''
    const candidate = (wordBefore + match[1]!).toLowerCase().replace(/\.$/, '')
    if (ABBREVIATIONS.has(candidate)) continue

    // Check for page number pattern (p.10)
    if (/p$/i.test(text.slice(Math.max(0, matchIndex - 1), matchIndex + 1))) continue

    boundaries.push(matchIndex + match[0].length)
  }

  return boundaries
}

export interface Section {
  heading: string // the ALL-CAPS heading text
  body: string // everything between this heading and the next
}

/**
 * Split a wall-of-text into sections based on ALL-CAPS headings.
 * Handles inline headings (headings embedded in flowing text without line breaks).
 */
export function splitAtHeadings(text: string): Section[] {
  if (!text.trim()) return []

  const sections: Section[] = []
  // Match ALL-CAPS headings that are 2+ words
  // Use word boundary detection: uppercase sequences preceded by start/space
  const headingPattern = /(?:^|(?<=\s))(\d+\s+)?([A-Z][A-Z]+(?:\s+[A-Z]+)+)(?=\s|$)/g
  const matches: Array<{ heading: string; index: number; length: number }> = []

  let m: RegExpExecArray | null
  while ((m = headingPattern.exec(text)) !== null) {
    const heading = m[0]!.trim()
    // Filter: must have at least 2 ALL-CAPS words
    const withoutNumber = heading.replace(/^\d+\s+/, '')
    const words = withoutNumber.split(/\s+/).filter(Boolean)
    if (words.length < 2) continue
    matches.push({ heading, index: m.index, length: m[0]!.length })
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!
    const bodyStart = current.index + current.length
    const bodyEnd = i + 1 < matches.length ? matches[i + 1]!.index : text.length
    const body = text.slice(bodyStart, bodyEnd).trim()
    sections.push({ heading: current.heading, body })
  }

  return sections
}
