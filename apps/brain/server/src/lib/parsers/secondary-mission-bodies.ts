/**
 * Brain parser for the 11e Chapter Approved Secondary Mission body text.
 *
 * Source: a Canon-OCR-derived transcript of the secondary mission cards
 * (Micah's local PDF; staged into `.local/brain-input/cards/secondary-bodies.txt`
 * by `stage-card-sources.ts`).
 *
 * The transcript captured WHEN clauses, VP values, and effects across all 18
 * cards but didn't preserve card titles cleanly — the cards in the source PDF
 * are laid out in a grid and pdftotext interleaves columns. We split the input
 * on the WHEN-clause markers (`WHEN:`, `WHEN DRAWN:`, etc.) and bucket each
 * chunk into a slug using distinctive content fingerprints.
 *
 * Chunks that can't be matched are reported in `unmatched`; slugs that didn't
 * pick up any chunk are reported in `missing`. The output is a
 * `secondaryBodyBySlug` map that `parseMissionCards` consumes to override the
 * noisier per-side OCR.
 *
 * @see apps/brain/server/src/lib/parsers/mission-cards.ts
 */
import { existsSync, readFileSync } from 'node:fs'

import { SECONDARY_CARDS } from './mission-card-urls'

export interface SecondaryBodyParseResult {
  /** Slug → cleaned body text. Suitable for mission-cards' override option. */
  bodyBySlug: Map<string, string>
  /** Slugs that received body text from the input. */
  recognized: string[]
  /** Slugs from the canonical list that no chunk matched. */
  missing: string[]
  /** Number of text chunks that didn't fingerprint to any known slug. */
  unmatchedChunks: number
}

/**
 * Distinctive content fingerprints per secondary slug. Each pattern is chosen
 * to discriminate one card from the other 17. These are tokens unique to the
 * rules text or flavor — NOT the title (titles are unreliable in the source).
 *
 * Where the OCR mangles letters (`o`↔`0`, `l`↔`1`, `i`↔`1`, lowercase letters
 * with diacritic-like marks), the patterns are forgiving: `/o/i` matches both
 * `o` and `O`. We avoid relying on punctuation since the OCR drops it.
 */
const SECONDARY_FINGERPRINTS: Record<string, RegExp[]> = {
  // BEACON — "beacon unit" phrase is unique.
  beacon: [/\bbeacon unit\b/i, /beacon/i],
  // OUTFLANK — "battlefield edges", "opposite battlefield edges".
  outflank: [/opposite battlefield edges/i, /battlefield edges/i, /\boutflank\b/i],
  // DISPLAY OF MIGHT — "show of force" + "morale".
  'display-of-might': [/show of force/i, /\bmorale\b/i, /display of might/i],
  // PLUNDER — "PLUNDER" itself often survives; otherwise "plundered".
  plunder: [/\bplunder\b/i, /plundered/i],
  // OVERWHELMING FORCE — "started the turn within range" / "destroyed".
  // Allow OCR letter wobble on `unit/uniI` and newline between `the` and `turn`.
  'overwhelming-force': [/started the\s+turn within range of/i, /overwhelming force/i],
  // NO PRISONERS — "no mercy" / "Exterminate".
  'no-prisoners': [/no mercy/i, /exterminat/i, /no prisoners/i],
  // FORWARD POSITION — "forward position" (OCR'd as "forword"), "estoblish",
  // and the "home objective and/or each\nexpansion" combo from the rules text.
  'forward-position': [
    /forw[oa]rd position/i,
    /estoblish o forword/i,
    /home obj?e?ctive\s+and\/or each/i,
  ],
  // SECURE NO MAN'S LAND — "two or more obj? within No Man's Land".
  'secure-no-man-s-land': [
    /seize it before the enemy/i,
    /two or more obj?e?ctives\s+within No Man['’]?s Land/i,
    /secure no man/i,
  ],
  // ENGAGE ON ALL FRONTS — "presence in [N] table quarters".
  'engage-on-all-fronts': [
    /presence in (?:three|four|two|fu)?\s*table quar?t?ers/i,
    /\btable quarter\b/i,
    /engage on all fronts/i,
  ],
  // DEFEND STRONGHOLD — "defence of a critical objective" (OCR'd as
  // "defence of o criticol", may wrap across newlines).
  'defend-stronghold': [
    /chorged with the defen[cs]e/i,
    /defen[cs]e of\s+[oa]\s+criticol/i,
    /defen[cs]e of\s+a\s+critical/i,
    /defend stronghold/i,
    /You controi your home/i,
    /No enemy units are within\s+your[\s\S]{0,40}deployment zone/i,
  ],
  // A GRIEVOUS BLOW — "starting strength of 13+" (or OCR'd as "of13").
  'a-grievous-blow': [/starting strength of\s*1\s*3\+?/i, /a grievous blow/i],
  // CLEANSE — "cleansed", "Purif" (Purify, Purifu).
  cleanse: [/cleansed/i, /\bpurif/i, /\bcleanse\b/i],
  // BURDEN OF TRUST — "guard that objective" / "guarded by your army" /
  // "friendly unit ... to guard that objective".
  'burden-of-trust': [
    /that obj?e?ctive is guarded/i,
    /unit on the battlefield to\s+guard/i,
    /each obj?e?ctive guarded by/i,
    /guarded by your army/i,
    /burden of trust/i,
  ],
  // BRING IT DOWN — "W of 10 or more".
  'bring-it-down': [/W of\s*1\s*0 or more/i, /bring it down/i, /heavily armoured/i],
  // BEHIND ENEMY LINES — "wholly within your opponent's deployment zone".
  'behind-enemy-lines': [
    /wholly within your opponent['’]?s\s+deployment zone/i,
    /behind enemy lines/i,
    /cut off their escape routes/i,
  ],
  // CENTRE GROUND — "centre of the battlefield".
  'centre-ground': [
    /(?:heart|heort) of the (?:battlefield|bottlefield)/i,
    /centre of the (?:battlefield|bottlefield)/i,
    /centre ground/i,
  ],
  // A TEMPTING TARGET — "tempting target" / "valuable asset".
  'a-tempting-target': [/tempting (?:target|talget)/i, /v[oa]luable [oa]sset/i],
  // ASSASSINATION — "CHARACTER models".
  assassination: [/CHARACTER mod?e?ls?/i, /\bassassination\b/i],
}

/**
 * Strip the column-runs of OCR garbage that pdftotext extracts from the side
 * margins of the source PDF. We keep any line that contains at least 3 latin
 * letters in a row AND has at least 2 alphabetic word tokens. Pure punctuation
 * or single-letter junk lines drop out.
 */
function stripGarbage(raw: string): string {
  const out: string[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) {
      out.push('')
      continue
    }
    const words = line.match(/[A-Za-z]{2,}/g) ?? []
    // Allow lines like "5VP" with 1 word + a digit.
    if (words.length >= 2) {
      out.push(line)
    } else if (words.length >= 1 && /\d/.test(line) && line.length <= 30) {
      out.push(line)
    } else if (words.length === 1 && words[0]!.length >= 4) {
      out.push(line)
    }
  }
  return out.join('\n')
}

/**
 * Slug the input into per-card chunks. We do this by finding the FIRST
 * fingerprint hit for each known secondary slug and sorting those positions
 * in input order. Each card's chunk runs from its fingerprint position
 * (clamped back to the previous chunk boundary for flavor inclusion) to the
 * next card's position.
 *
 * This bypasses the unreliable WHEN-anchor boundary detection — chunks come
 * out reliably even when the source PDF has no explicit per-card markers.
 *
 * Returns an array of `{ slug, chunk }` in input order.
 */
function splitChunksBySlug(cleaned: string): Array<{ slug: string; chunk: string }> {
  // Find earliest hit for each slug across its fingerprint patterns.
  const hits: Array<{ slug: string; index: number }> = []
  for (const slug of SECONDARY_CARDS) {
    const fps = SECONDARY_FINGERPRINTS[slug]
    if (!fps) continue
    let bestIdx = -1
    for (const re of fps) {
      const reGlobal = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      reGlobal.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = reGlobal.exec(cleaned)) !== null) {
        if (bestIdx < 0 || m.index < bestIdx) bestIdx = m.index
        // Don't loop forever on zero-width matches.
        if (m.index === reGlobal.lastIndex) reGlobal.lastIndex++
      }
    }
    if (bestIdx >= 0) hits.push({ slug, index: bestIdx })
  }

  hits.sort((a, b) => a.index - b.index)

  const out: Array<{ slug: string; chunk: string }> = []
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!
    // Start each chunk at the END of the previous hit (or beginning of input)
    // — this lets the chunk capture the flavor paragraph that precedes the
    // fingerprint position.
    const start = i === 0 ? 0 : hits[i - 1]!.index + 1
    const end = i + 1 < hits.length ? hits[i + 1]!.index : cleaned.length
    const chunk = cleaned.slice(start, end).trim()
    if (chunk.length > 0) out.push({ slug: hit.slug, chunk })
  }
  return out
}

/**
 * Match a chunk to a secondary slug using the fingerprint table. Returns the
 * first slug whose fingerprints hit; `null` if no fingerprints match. We try
 * every fingerprint and keep the slug with the most matches — the most
 * specific pattern wins when multiple fingerprints overlap.
 */
export function matchChunkToSecondarySlug(chunk: string): string | null {
  let bestSlug: string | null = null
  let bestScore = 0
  for (const slug of SECONDARY_CARDS) {
    const fps = SECONDARY_FINGERPRINTS[slug]
    if (!fps) continue
    let score = 0
    for (const fp of fps) {
      if (fp.test(chunk)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestSlug = slug
    }
  }
  return bestScore > 0 ? bestSlug : null
}

export interface ParseSecondaryBodiesOptions {
  /** Override the canonical secondary slug list (test seam). */
  slugs?: readonly string[]
}

/**
 * Parse the raw secondary-mission body transcript into a per-slug body map.
 * Body text is the raw chunk with light whitespace cleanup; we don't try to
 * restructure VP tables since the OCR alignment of value columns is
 * unreliable.
 */
export function parseSecondaryBodies(
  rawText: string,
  opts: ParseSecondaryBodiesOptions = {},
): SecondaryBodyParseResult {
  const cleaned = stripGarbage(rawText)
  const slugList = opts.slugs ?? SECONDARY_CARDS

  const slugChunks = splitChunksBySlug(cleaned)
  const bodyBySlug = new Map<string, string>()
  let unmatchedChunks = 0

  for (const { slug, chunk } of slugChunks) {
    if (!slugList.includes(slug)) {
      unmatchedChunks++
      continue
    }
    const prior = bodyBySlug.get(slug)
    if (!prior || chunk.length > prior.length) {
      bodyBySlug.set(slug, chunk.replace(/\s+/g, ' ').trim())
    }
  }

  const recognized = [...bodyBySlug.keys()]
  const missing = slugList.filter((s) => !bodyBySlug.has(s))
  return { bodyBySlug, recognized, missing, unmatchedChunks }
}

/** Load + parse a secondary-mission body file. Returns `null` if absent. */
export function loadSecondaryBodiesFromFile(
  path: string,
  opts: ParseSecondaryBodiesOptions = {},
): SecondaryBodyParseResult | null {
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf-8')
  return parseSecondaryBodies(raw, opts)
}
