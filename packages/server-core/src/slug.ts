export interface SlugifyOptions {
  /**
   * Characters matched by this regex are removed BEFORE hyphenation
   * (rather than being collapsed into a hyphen). Used to fold
   * apostrophes/smart quotes so "Emperor's Children" -> "emperors-children"
   * instead of "emperor-s-children". Must be a global regex.
   */
  stripChars?: RegExp
  /** Truncate the final slug to this many characters. No truncation by default. */
  maxLength?: number
}

/**
 * Canonical slug: lowercase, strip `stripChars` (if given), collapse
 * remaining non-alphanumeric runs to a single hyphen, trim leading/trailing
 * hyphens, then truncate to `maxLength` (if given).
 *
 * Consolidates seven call sites (D2-07 items 1-2,
 * wargame/w2/95-consolidation-roadmap.md Phase 2):
 *   - default options: content-ingestor nodes.ts / commit.ts /
 *     commit-process-queue.ts / drafts/store.ts
 *   - `{ stripChars: /[’ʼ'‘"”“]/g, maxLength: 60 }`: data-import
 *     sync.ts's `contentEntitySlug` / content-producer.ts's `slug`
 *   - `{ stripChars: /['‘’′"'"]/g }`: data-import faction-pack.ts's
 *     `slug` — deliberately does NOT strip curly double quotes, a
 *     verified divergence from contentEntitySlug's strip set. Preserve
 *     as-is; do not merge the two strip sets.
 */
export function slugify(input: string, options: SlugifyOptions = {}): string {
  let s = input.toLowerCase()
  if (options.stripChars) {
    s = s.replace(options.stripChars, '')
  }
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (options.maxLength !== undefined) {
    s = s.slice(0, options.maxLength)
  }
  return s
}
