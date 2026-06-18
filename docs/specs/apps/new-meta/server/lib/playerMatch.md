# apps/new-meta/server/src/lib/playerMatch.ts

> Resolve import name strings to platform user accounts — case-insensitive exact match only.

## Prompt

Write player name matching functions. Intentionally conservative — exact match only, no fuzzy matching.

### Types

**`UserRow`**: `{ id, username: string | null, displayUsername: string | null }`

### Functions

**`matchPlayerName(name, users): string | null`** — Try matching in order:
1. Exact match on `authUsers.username` (case-insensitive)
2. Exact match on `authUsers.displayUsername` (case-insensitive)
3. Return null (caller creates anonymous entry)

Trim + lowercase the input name before matching.

**`batchMatchPlayerNames(names, users): Map<string, string | null>`** — Run `matchPlayerName` for each name. Returns a Map.

### Why no fuzzy matching

False positives in name matching would corrupt rating data. Better to have unmatched anonymous entries that an admin links manually than to auto-link "John Smith" to the wrong "John Smith". This is a deliberate design decision.

## Dependencies

None — pure string comparison.
