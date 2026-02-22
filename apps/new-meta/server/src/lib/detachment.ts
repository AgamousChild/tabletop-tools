// ============================================================
// detachment — best-effort detachment extraction from list text
//
// Army lists are pasted free-text (BattleScribe, New Recruit, etc.).
// Format varies. We look for common patterns.
//
// Patterns tried (in order):
//   1. "DETACHMENT: <name>"  (BattleScribe keyword block)
//   2. "+ DETACHMENT: <name>" (BattleScribe header)
//   3. "Detachment: <name>" (New Recruit)
//   4. "-- <name> Detachment --" (some BattleScribe variants)
//
// Returns null if no pattern matches.
// ============================================================

const DETACHMENT_PATTERNS: RegExp[] = [
  // "+ DETACHMENT: Gladius Task Force" or "DETACHMENT: Gladius Task Force"
  /^\+?\s*DETACHMENT:\s*(.+)$/im,
  // "Detachment: Gladius Task Force"
  /^Detachment:\s*(.+)$/im,
  // "-- Gladius Task Force Detachment --"
  /^--\s*(.+?)\s*Detachment\s*--$/im,
]

/**
 * Try to extract the detachment name from army list text.
 * Returns the trimmed detachment name, or null if not found.
 */
export function extractDetachment(listText: string): string | null {
  for (const pattern of DETACHMENT_PATTERNS) {
    const match = listText.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      if (name) return name
    }
  }
  return null
}
