// ============================================================
// playerMatch — resolve import name strings to platform accounts
//
// Matching order:
//   1. Exact match on authUsers.username (case-insensitive)
//   2. Exact match on authUsers.displayUsername (case-insensitive)
//   3. No match → return null (caller creates anonymous entry)
// ============================================================

export interface UserRow {
  id: string
  username: string | null
  displayUsername: string | null
}

/**
 * Try to match an import name string to a platform user account.
 * Returns the matched userId, or null if no match found.
 *
 * Case-insensitive exact match only — fuzzy matching is intentionally
 * excluded to avoid false positives. Admin can manually link unmatched
 * entries via admin.linkPlayer.
 */
export function matchPlayerName(name: string, users: UserRow[]): string | null {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return null

  for (const user of users) {
    if (user.username && user.username.toLowerCase() === normalized) {
      return user.id
    }
    if (user.displayUsername && user.displayUsername.toLowerCase() === normalized) {
      return user.id
    }
  }

  return null
}

/**
 * Resolve a list of player names against the user list.
 * Returns a map from name → userId (or null for anonymous).
 */
export function batchMatchPlayerNames(
  names: string[],
  users: UserRow[],
): Map<string, string | null> {
  const result = new Map<string, string | null>()
  for (const name of names) {
    result.set(name, matchPlayerName(name, users))
  }
  return result
}
