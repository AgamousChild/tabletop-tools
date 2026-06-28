/**
 * Edition selector — picks which game edition's content the brain client
 * requests from the Worker. Default is `11th` per Rule 5 (11e is the target
 * edition). `any` is an explicit opt-in to show legacy 10e/9e alongside 11e.
 *
 * The selected edition lives in `window.location.hash` as `edition=<value>`
 * so it survives reload + share. The Worker reads `?edition=` on every
 * retrieval endpoint; see `apps/brain/CLAUDE.md` → "Switchable edition filter".
 */

export type Edition = '11th' | '10th' | '9th' | 'any'

export const DEFAULT_EDITION: Edition = '11th'

export const EDITION_OPTIONS: ReadonlyArray<{ value: Edition; label: string }> = [
  { value: '11th', label: '11th' },
  { value: '10th', label: '10th' },
  { value: '9th', label: '9th' },
  { value: 'any', label: 'Any' },
]

const HASH_KEY = 'edition'

export function isEdition(v: string | null | undefined): v is Edition {
  return v === '11th' || v === '10th' || v === '9th' || v === 'any'
}

/**
 * Read the edition from `window.location.hash`. Returns `DEFAULT_EDITION`
 * if the hash is missing/malformed.
 *
 * Accepts hashes like `#edition=11th`, `#edition=10th&foo=bar`, `#foo=bar&edition=9th`.
 */
export function parseEditionFromHash(hash: string): Edition {
  // Hash may or may not have leading `#`
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash
  if (!cleaned) return DEFAULT_EDITION
  const params = new URLSearchParams(cleaned)
  const value = params.get(HASH_KEY)
  return isEdition(value) ? value : DEFAULT_EDITION
}

/**
 * Merge a new edition value into the existing hash string, preserving any
 * other params. Returns the new hash (without leading `#`).
 */
export function writeEditionToHash(hash: string, edition: Edition): string {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(cleaned)
  params.set(HASH_KEY, edition)
  return params.toString()
}
