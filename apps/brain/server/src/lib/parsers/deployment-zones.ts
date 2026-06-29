/**
 * Brain parser for the 11e Chapter Approved Deployment Zone cards.
 *
 * Source:
 *   - Names: Canon-OCR sidecar (`IMG_0001.txt`) of the deployment-zone
 *     reference sheet. The OCR captured the six zone names cleanly enough to
 *     match against the canonical slug list.
 *   - Body: NOT yet available in clean form. The reference sheet's body text
 *     is unreadable from the current image source — Tesseract garbles it the
 *     same way it garbles the twist card titles. Until a cleaner source is
 *     available, the parser emits nodes with `content` set to a short
 *     "body text not yet ingested" placeholder so the brain still has the
 *     names + IDs as graph anchors. The PR body surfaces this gap.
 *
 * @see apps/brain/server/scripts/stage-card-sources.ts — copies sources into
 *   `.local/brain-input/cards/deployment-zones.txt`.
 */
import { existsSync, readFileSync } from 'node:fs'

import type { Node, Source } from '../model'

export interface DeploymentZoneParseResult {
  nodes: Node[]
  /** Slugs the parser identified in the input. */
  recognized: string[]
  /** Slugs the parser could not find in the input. */
  missing: string[]
  /**
   * `true` when at least one node was emitted with placeholder body text
   * (no clean body source available). Surfaced to build-graph callers.
   */
  bodyPlaceholderUsed: boolean
}

/** Canonical 11e deployment-zone slug list — 6 zones. */
export const DEPLOYMENT_ZONE_SLUGS = [
  'hammer-and-anvil',
  'tipping-point',
  'sweeping-engagement',
  'dawn-of-war',
  'search-and-destroy',
  'crucible-of-battle',
] as const
export type DeploymentZoneSlug = (typeof DEPLOYMENT_ZONE_SLUGS)[number]

/**
 * Display titles. Per Rule 6, this is parser-side metadata about a fixed-size
 * deck (6 zones, names won't change without a new GW publication). Same
 * pattern as TWIST_TITLES / mission-card-urls.
 */
export const DEPLOYMENT_ZONE_TITLES: Record<DeploymentZoneSlug, string> = {
  'hammer-and-anvil': 'Hammer and Anvil',
  'tipping-point': 'Tipping Point',
  'sweeping-engagement': 'Sweeping Engagement',
  'dawn-of-war': 'Dawn of War',
  'search-and-destroy': 'Search and Destroy',
  'crucible-of-battle': 'Crucible of Battle',
}

/**
 * Normalize an input line to a canonical lowercase form for fuzzy matching:
 * uppercase letters → lowercase, non-alpha collapsed to single space.
 * The OCR sidecar produces things like `HAMMER AND ANVIT`, `TIPPING PtIINT`,
 * `CRUCIBTE ()F BATTTE` — we tolerate OCR mis-recognitions of T/L/I, etc.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Levenshtein distance — small implementation, enough for short words.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!)
      prev = tmp
    }
  }
  return dp[b.length]!
}

/**
 * Word-level fuzzy match. Two normalized strings match if they have the same
 * word count AND each word pair is "close enough" by EITHER:
 *  - Levenshtein distance under a length-aware budget, OR
 *  - shared first letter + letter-multiset overlap >= 70%.
 *
 * The second clause catches OCR noise where multiple chars get conflated into
 * an incorrect-but-different-length glyph cluster (e.g. `ptiint` ≈ `point`,
 * where the edit distance is high but the letter overlap is strong).
 */
function wordsFuzzyMatch(a: string, b: string): boolean {
  const aw = a.split(' ').filter(Boolean)
  const bw = b.split(' ').filter(Boolean)
  if (aw.length !== bw.length) return false
  for (let i = 0; i < aw.length; i++) {
    const x = aw[i]!
    const y = bw[i]!
    if (x === y) continue
    const maxLen = Math.max(x.length, y.length)
    // Edit-distance budget: ~50% of the longer word, capped at 4.
    const budget = Math.min(4, Math.max(1, Math.floor(maxLen * 0.5)))
    if (editDistance(x, y) <= budget) continue
    // Fallback: letter-multiset overlap. Same first letter + >= 70% shared
    // letters tends to catch glyph-cluster OCR errors.
    if (x[0] !== y[0]) return false
    const cnt = (s: string) => {
      const c: Record<string, number> = {}
      for (const ch of s) c[ch] = (c[ch] ?? 0) + 1
      return c
    }
    const cx = cnt(x)
    const cy = cnt(y)
    let shared = 0
    for (const ch in cx) shared += Math.min(cx[ch]!, cy[ch] ?? 0)
    if (shared / maxLen < 0.7) return false
  }
  return true
}

/**
 * Find which slug (if any) a line matches. The matcher is tolerant of common
 * OCR substitutions: T↔L, T↔I, I↔l, etc. We compute a normalized form of the
 * input line and a normalized form of each zone title, then accept a match if
 * (a) either is a substring of the other, OR (b) they word-fuzzy match modulo
 * common OCR letter swaps in trailing characters.
 *
 * The candidate string is also tried with single-letter "noise tokens" dropped
 * — OCR sometimes shatters a glyph like `]F` into two short tokens (`t`, `f`)
 * that break naive word-by-word alignment.
 */
export function matchZoneSlug(line: string): DeploymentZoneSlug | null {
  const norm = normalizeForMatch(line)
  if (norm.length === 0) return null

  // Variants of the candidate to try: as-is, and with single-letter tokens
  // dropped (those are usually OCR noise). Skip the dropped variant if it
  // ends up empty — a 0-length candidate would otherwise be a substring of
  // every title.
  const dropSingles = norm
    .split(' ')
    .filter((w) => w.length >= 2)
    .join(' ')
  const variants = norm === dropSingles || dropSingles.length === 0 ? [norm] : [norm, dropSingles]

  for (const slug of DEPLOYMENT_ZONE_SLUGS) {
    const title = normalizeForMatch(DEPLOYMENT_ZONE_TITLES[slug])
    for (const v of variants) {
      // Substring match requires the candidate to be non-trivial.
      if (v.length >= 4 && (v.includes(title) || title.includes(v))) return slug
      if (wordsFuzzyMatch(v, title)) return slug
    }
    // Fallback: every "significant" title word (>= 3 chars) appears as a
    // substring of the candidate, in order. Catches things like
    // `dawn t]f war` ≈ `dawn of war` (OCR shattered `of`).
    const titleWords = title.split(' ')
    const significant = titleWords.filter((w) => w.length >= 3)
    if (significant.length > 0) {
      let cursor = 0
      let allFound = true
      for (const tw of significant) {
        const idx = norm.indexOf(tw, cursor)
        if (idx < 0) {
          allFound = false
          break
        }
        cursor = idx + tw.length
      }
      if (allFound) return slug
    }
  }
  return null
}

function makeSummary(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > 150 ? flat.slice(0, 147) + '...' : flat
}

export interface ParseDeploymentZonesOptions {
  retrievedAt?: string
  /**
   * Optional per-slug body text. When provided, the parser will use it as the
   * node's `content`. When absent, the node is emitted with a placeholder
   * marker that downstream consumers can detect.
   */
  bodyBySlug?: Map<string, string>
  /** Override the source attribution title (test seam). */
  sourceTitle?: string
}

const BODY_PLACEHOLDER =
  '_(Body text for this Deployment Zone card has not yet been ingested. Names + IDs are present so the brain can link to this card; rules text will land when a cleaner source is available.)_'

/**
 * Parse a name list (one name per line, OCR-noise tolerated) into deployment-
 * zone nodes. Lines that don't match a known slug are ignored.
 */
export function parseDeploymentZones(
  rawText: string,
  opts: ParseDeploymentZonesOptions = {},
): DeploymentZoneParseResult {
  const retrievedAt = opts.retrievedAt ?? new Date().toISOString()
  const sourceTitle =
    opts.sourceTitle ?? 'GW Chapter Approved Deployment Zones (Micah local OCR sidecar)'
  const bodyBySlug = opts.bodyBySlug ?? new Map<string, string>()

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const recognized = new Set<DeploymentZoneSlug>()
  for (const line of lines) {
    const slug = matchZoneSlug(line)
    if (slug) recognized.add(slug)
  }

  const nodes: Node[] = []
  let bodyPlaceholderUsed = false

  for (const slug of DEPLOYMENT_ZONE_SLUGS) {
    if (!recognized.has(slug)) continue
    const title = DEPLOYMENT_ZONE_TITLES[slug]
    const userBody = bodyBySlug.get(slug)?.trim()
    let content: string
    if (userBody && userBody.length > 0) {
      content = userBody
    } else {
      content = `${title}\n\n${BODY_PLACEHOLDER}`
      bodyPlaceholderUsed = true
    }

    const source: Source = {
      type: 'community',
      title: sourceTitle,
      retrievedAt,
    }

    nodes.push({
      id: `ca11:deployment-zone:${slug}`,
      layer: 'core',
      category: 'deployment-zone',
      title,
      edition: '11th',
      content,
      summary: userBody ? makeSummary(userBody) : `${title} — 11e deployment zone (body pending)`,
      sources: [source],
      refs: [],
      version: 1,
      keywords: ['deployment zone', '11th edition', 'chapter approved', slug.replace(/-/g, ' ')],
    })
  }

  const missing = DEPLOYMENT_ZONE_SLUGS.filter((s) => !recognized.has(s))
  return { nodes, recognized: [...recognized], missing, bodyPlaceholderUsed }
}

/**
 * Load + parse a deployment-zone name file. Returns `null` if the file doesn't
 * exist.
 */
export function loadDeploymentZonesFromFile(
  path: string,
  opts: ParseDeploymentZonesOptions = {},
): DeploymentZoneParseResult | null {
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf-8')
  return parseDeploymentZones(raw, opts)
}
