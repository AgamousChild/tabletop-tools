/**
 * Convert a detachment name to a slug: lowercase, spaces to hyphens, strip parentheticals.
 */
function toSlug(name: string): string {
  return name
    .replace(/\s*\(.*?\)\s*/g, '') // strip parenthetical content
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

/** Known battle size keywords that appear in GW App format lists. */
const BATTLE_SIZE_KEYWORDS = [
  'incursion',
  'strike force',
  'onslaught',
  'combat patrol',
]

function isBattleSizeLine(line: string): boolean {
  const lower = line.toLowerCase()
  return BATTLE_SIZE_KEYWORDS.some((kw) => lower.startsWith(kw))
}

/**
 * Extract detachment name from army list text.
 *
 * Strategy 1: BattleScribe structured format — `+ DETACHMENT: Name (Optional) +`
 * Strategy 2: GW App format — detachment appears on line 2 or 3 (before battle size line)
 */
export function extractDetachment(
  listText: string,
  _factionSlug: string,
): string | null {
  if (!listText.trim()) return null

  // Strategy 1: BattleScribe DETACHMENT line
  const detachmentMatch = listText.match(/DETACHMENT:\s*(.+)/i)
  if (detachmentMatch) {
    const raw = detachmentMatch[1]!.replace(/\s*\+\s*$/, '').trim()
    return toSlug(raw)
  }

  // Strategy 2: GW App format — lines 2 and 3 are candidates
  const lines = listText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length < 3) return null

  // Check line 2 (index 1) — if line 3 is a battle size, line 2 is the detachment
  if (isBattleSizeLine(lines[2]!)) {
    return toSlug(lines[1]!)
  }

  // Check line 3 (index 2) — if line 4 is a battle size, line 3 is the detachment
  if (lines.length >= 4 && isBattleSizeLine(lines[3]!)) {
    return toSlug(lines[2]!)
  }

  return null
}
