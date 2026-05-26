/**
 * Parse detachment restrictions from ability descriptions.
 *
 * Detachment abilities may contain a "RESTRICTIONS" section with
 * rules about which units can be included in the army. These are
 * displayed prominently in the list builder UI.
 *
 * Common patterns:
 *   - Chapter restrictions: "can include X units, cannot include Y from any other Chapter"
 *   - Points caps: "combined points cost of such units"
 *   - Keyword restrictions: "cannot select the KHORNE keyword for a Psyker unit"
 */

export interface DetachmentRestriction {
  /** The ability name containing the restriction */
  abilityName: string
  /** Raw restriction text (after the RESTRICTIONS header) */
  text: string
  /** Parsed chapter name if this is a chapter restriction, e.g. "Blood Angels" */
  chapterName: string | null
  /** Type of restriction detected */
  type: 'chapter' | 'points_cap' | 'keyword' | 'other'
}

/**
 * Extract the restriction text from a detachment ability description.
 * Returns null if no restrictions section is found.
 */
function extractRestrictionText(description: string): string | null {
  const idx = description.toLowerCase().indexOf('restriction')
  if (idx < 0) return null

  // Find the end of the "RESTRICTIONS" header line
  let startIdx = idx
  while (startIdx < description.length && description[startIdx] !== '\n') startIdx++
  startIdx++ // skip the newline

  const text = description.slice(startIdx).trim()
  return text.length > 0 ? text : null
}

/**
 * Parse a chapter restriction from restriction text.
 * Pattern: "Your army can include X units, but it cannot include any ADEPTUS ASTARTES units drawn from any other Chapter."
 */
function parseChapterName(text: string): string | null {
  // Pattern 1: "can include **X** **Y** units" with bold markers
  const boldMatch = text.match(
    /can include \*\*(\w[\w\s]*?)\*\*(?:\s+\*\*(\w[\w\s]*?)\*\*)?\s+units/i,
  )
  if (boldMatch) {
    const name = boldMatch[2] ? `${boldMatch[1]} ${boldMatch[2]}` : boldMatch[1]!
    return name.trim()
  }

  // Pattern 2: "can include X units" without bold markers
  const plainMatch = text.match(/can include ([\w\s]+?) units,\s+but/i)
  if (plainMatch) {
    return plainMatch[1]!.trim()
  }

  return null
}

/**
 * Classify the restriction type.
 */
function classifyRestriction(text: string): DetachmentRestriction['type'] {
  if (/cannot include.*(?:chapter|drawn from)/i.test(text)) return 'chapter'
  if (/combined points cost/i.test(text)) return 'points_cap'
  if (/cannot select.*keyword/i.test(text) || /can only.*if both units share/i.test(text))
    return 'keyword'
  return 'other'
}

/**
 * Parse detachment restrictions from an array of detachment abilities.
 *
 * @param abilities - Array of detachment abilities with description text
 * @returns Array of parsed restrictions (empty if no restrictions found)
 */
export function parseDetachmentRestrictions(
  abilities: Array<{ id: string; name: string; description: string }>,
): DetachmentRestriction[] {
  const restrictions: DetachmentRestriction[] = []

  for (const ability of abilities) {
    const text = extractRestrictionText(ability.description)
    if (!text) continue

    const type = classifyRestriction(text)
    const chapterName = type === 'chapter' ? parseChapterName(text) : null

    restrictions.push({
      abilityName: ability.name,
      text,
      chapterName,
      type,
    })
  }

  return restrictions
}

/**
 * Format restriction text for display, stripping markdown bold markers.
 */
export function formatRestrictionText(text: string): string {
  return text.replace(/\*\*/g, '')
}
