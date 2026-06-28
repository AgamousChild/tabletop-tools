/**
 * Central brain-client → brain Worker fetch helper.
 *
 * Every retrieval/browse call in the brain client goes through this so the
 * selected edition (`?edition=11th|10th|9th|any`) is appended uniformly.
 * One change here propagates to search, ask, graph-data, browse, etc.
 *
 * See `apps/brain/CLAUDE.md` → "Switchable edition filter" for the Worker side.
 */

import type { Edition } from './edition'

const API_BASE = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'

export function getApiBase(): string {
  return API_BASE
}

/**
 * Append `?edition=` to a path. The path may already have a query string —
 * we use URLSearchParams so we don't clobber existing params.
 *
 * Pass `edition: undefined` to skip the append entirely (used by endpoints
 * that don't honor the param, e.g. `/version`).
 */
export function withEdition(path: string, edition: Edition | undefined): string {
  if (!edition) return path
  const [base, query = ''] = path.split('?', 2)
  const params = new URLSearchParams(query)
  params.set('edition', edition)
  return `${base}?${params.toString()}`
}

export interface BrainFetchInit extends RequestInit {
  edition?: Edition
}

/**
 * fetch wrapper that resolves relative paths against `API_BASE` and threads
 * the selected edition into the URL.
 *
 * Returns the raw Response so callers can inspect headers (notably
 * `X-Available-Editions` on 404).
 *
 * Forwards the `init` object to `fetch` only when it contains anything (so a
 * bare `brainFetch('/foo')` calls `fetch(url)` and stays compatible with
 * tests that assert on a single-argument call signature).
 */
export function brainFetch(path: string, init: BrainFetchInit = {}): Promise<Response> {
  const { edition, ...rest } = init
  const fullPath = path.startsWith('http') ? path : `${API_BASE}${path}`
  const withQuery = withEdition(fullPath, edition)
  if (Object.keys(rest).length === 0) {
    return fetch(withQuery)
  }
  return fetch(withQuery, rest)
}

/** Parse the `X-Available-Editions` header into an Edition[] (or empty). */
export function parseAvailableEditions(headerValue: string | null): Edition[] {
  if (!headerValue) return []
  return headerValue
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Edition => s === '11th' || s === '10th' || s === '9th' || s === 'any')
}
