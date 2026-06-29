/**
 * Brain parser for the 11e Chapter Approved Twist cards.
 *
 * Source: a single PDF with the 6 twist cards laid out in a 2x3 grid (Micah's
 * local-only copy at `C:/R/twists.pdf`). The text-layer extraction (via
 * `pdftotext -raw`) preserves the body copy but mangles the graphic-art card
 * titles, so we identify each card by content cues rather than parsed titles
 * and join slugs to the known list of 11e twists.
 *
 * @see apps/brain/server/scripts/stage-card-sources.ts — copies the PDF into
 *   `.local/brain-input/cards/twists.pdf` for the build to pick up.
 * @see apps/brain/server/src/lib/parsers/twists.test.ts — synthetic fixture
 *   tests; the real GW twist text is NOT reproduced in this repo.
 */
import { existsSync, readFileSync } from 'node:fs'

import type { Node, Source } from '../model'

export interface TwistParseResult {
  nodes: Node[]
  /** Slugs the parser identified in the input. */
  recognized: string[]
  /** Slugs from the canonical list that the parser could NOT find. */
  missing: string[]
}

/**
 * Canonical 11e Twist deck (6 cards). These are the public card names.
 * Order matches Chapter Approved 2026 release; the parser does not assume
 * any specific ordering in the input file.
 */
export const TWIST_SLUGS = [
  'ruinscape',
  'scrambled-communications',
  'night-fighting',
  'mirrored-world',
  'nowhere-to-hide',
  'martial-pride',
] as const
export type TwistSlug = (typeof TWIST_SLUGS)[number]

/**
 * Display names for each twist. Kept here (not in the database per Rule 6) only
 * because they're parser-side metadata about a known fixed-size deck — six card
 * names with no data lifecycle. The names live in source files Micah keeps
 * locally; we DON'T extract them via OCR (graphic-art titles are unreadable),
 * so the names have to come from somewhere the build can see. Same pattern as
 * `mission-card-urls.ts`.
 */
export const TWIST_TITLES: Record<TwistSlug, string> = {
  ruinscape: 'Ruinscape',
  'scrambled-communications': 'Scrambled Communications',
  'night-fighting': 'Night Fighting',
  'mirrored-world': 'Mirrored World',
  'nowhere-to-hide': 'Nowhere to Hide',
  'martial-pride': 'Martial Pride',
}

/**
 * Tokens unique enough to identify each twist card by content. Used to match
 * extracted text chunks to slugs when the PDF title text is unreadable.
 *
 * The tokens are drawn from the rules text and flavor (NOT the title) and
 * each has been chosen to be discriminating across the other 5 twists —
 * "MOBILE keyword" only appears in Ruinscape, "BATTLELINE" advance+shoot only
 * in Martial Pride, etc.
 */
const TWIST_FINGERPRINTS: Record<TwistSlug, RegExp[]> = {
  ruinscape: [/\bMOBILE\b\s+keyword/i, /skeletal remnants/i, /half-destroyed/i],
  'scrambled-communications': [
    /exchange their Primary Mission cards/i,
    /Scrambled communications/i,
    /vox-channels/i,
  ],
  'night-fighting': [
    /shroud of\s*darkness/i,
    /\bINDIRECT FIRE\b/i,
    /not visible to enemy models\s+unless they are within 18/i,
  ],
  'mirrored-world': [
    /both replace their Primary\s+Mission card with the same/i,
    /rival warlords/i,
    /parallel paths/i,
  ],
  'nowhere-to-hide': [
    /illusion of\s*cover/i,
    /do not have the\s*Solid rule/i,
    /any gap in a\s+terrain feature/i,
  ],
  'martial-pride': [
    /\bBATTLELINE\b[\s\S]{0,80}can\s+start an\s+action[\s\S]{0,80}advance move/i,
    /\bBATTLELINE\b[\s\S]{0,80}can shoot in a turn in[\s\S]{0,40}started an action/i,
    /punishing rate of fire/i,
  ],
}

/**
 * The 11e twists PDF renders card titles as graphic art; pdftotext extracts
 * them as character soup (`z:`, `C,`, `:e`, `:c`, `m`, ...) interleaved with
 * the real body text. We use these garbage lines as card-boundary markers:
 * a run of 3+ consecutive garbage lines (or one garbage line + adjacent
 * blank lines) marks a card boundary, which we replace with a paragraph
 * break (`\n\n`). Real card body lines remain untouched.
 */
function stripGarbageLines(raw: string): string {
  const lines = raw.split(/\r?\n/)
  const isGarbage = (rawLine: string): boolean => {
    const line = rawLine.trim()
    if (line.length === 0) return false // blank lines aren't garbage themselves
    const words = line.match(/[A-Za-z]{2,}/g) ?? []
    if (words.length >= 2) return false
    if (words.length === 1 && /^[A-Za-z]+/.test(line) && line.length >= 4) return false
    return true
  }

  // Find runs of garbage lines. A run of length >= 3 becomes a paragraph
  // break; shorter runs are just dropped.
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (isGarbage(line)) {
      let runLen = 0
      while (i < lines.length && (isGarbage(lines[i]!) || lines[i]!.trim().length === 0)) {
        if (isGarbage(lines[i]!)) runLen++
        i++
      }
      if (runLen >= 3) {
        // Insert a paragraph marker so downstream splitters see a clear boundary.
        out.push('', '<<<TWIST-BOUNDARY>>>', '')
      }
    } else {
      out.push(line)
      i++
    }
  }
  return out.join('\n')
}

/** Boundary marker injected by stripGarbageLines between cards. */
const TWIST_BOUNDARY = '<<<TWIST-BOUNDARY>>>'

/**
 * Find the end-of-Designer's-Note position. The Note runs from its start to
 * the FIRST line ending in `.` (a sentence terminator) that occurs at line
 * 2 or later of the Note. This is reliable for the 11e twist deck where
 * every Designer's Note ends with a clear period before the next card's
 * flavor begins.
 */
function findDesignerNoteEnd(input: string, dnStart: number): number {
  // Walk forward line by line. Start at the line containing dnStart.
  let pos = dnStart
  let lineIdx = 0
  while (pos < input.length) {
    // Find end of current line (or end of input).
    const nl = input.indexOf('\n', pos)
    const lineEnd = nl < 0 ? input.length : nl
    const line = input.slice(pos, lineEnd).trim()
    // Sentence terminator at end of line, and we're past line 0.
    if (lineIdx >= 1 && /[.!?][)'"]?\s*$/.test(line)) {
      return lineEnd
    }
    if (nl < 0) return input.length
    pos = nl + 1
    lineIdx++
  }
  return input.length
}

/**
 * Find the body text for each twist by combining two signals:
 *   1. Card-boundary markers (`<<<TWIST-BOUNDARY>>>`) injected by
 *      stripGarbageLines wherever a long run of graphic-art garbage lines
 *      appeared in the source PDF. These reliably split the deck into
 *      "super-blocks" of 1-2 consecutive cards.
 *   2. Inside each super-block, we fingerprint each twist against the
 *      block. If multiple twists fingerprint, we split the block at the
 *      midpoint between fingerprint hits, then trim each side to the
 *      Designer's Note boundary so the next card's flavor stays on its
 *      own side.
 */
function findCardChunks(input: string): Map<TwistSlug, string> {
  const blocks = input
    .split(TWIST_BOUNDARY)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  const chunks = new Map<TwistSlug, string>()

  for (const block of blocks) {
    // Score each slug's fingerprint hits in this block.
    const hitsInBlock: Array<{ slug: TwistSlug; index: number; score: number }> = []
    for (const slug of TWIST_SLUGS) {
      let bestIdx = -1
      let score = 0
      for (const re of TWIST_FINGERPRINTS[slug]) {
        const m = re.exec(block)
        if (m) {
          score++
          if (bestIdx < 0 || m.index < bestIdx) bestIdx = m.index
        }
      }
      if (score > 0) hitsInBlock.push({ slug, index: bestIdx, score })
    }

    if (hitsInBlock.length === 0) continue

    if (hitsInBlock.length === 1) {
      const slug = hitsInBlock[0]!.slug
      const prior = chunks.get(slug)
      if (!prior || block.length > prior.length) chunks.set(slug, block)
      continue
    }

    // Multiple cards in this super-block. Sort by fingerprint position and
    // carve the block at Designer's-Note boundaries.
    hitsInBlock.sort((a, b) => a.index - b.index)
    for (let i = 0; i < hitsInBlock.length; i++) {
      const hit = hitsInBlock[i]!
      // Find this card's Designer's Note start (first DN at or after hit).
      const dnRe = /Designer['’]?s\s*Note\s*:/gi
      dnRe.lastIndex = hit.index
      const dnMatch = dnRe.exec(block)
      const cardEnd = dnMatch ? findDesignerNoteEnd(block, dnMatch.index) : block.length

      // Cap at the next card's fingerprint position too.
      const nextHitIdx = i + 1 < hitsInBlock.length ? hitsInBlock[i + 1]!.index : block.length
      const end = Math.min(cardEnd, nextHitIdx)

      // Start at the END of the previous card's Designer's Note (or block start).
      let start = 0
      if (i > 0) {
        const prevHit = hitsInBlock[i - 1]!
        const prevDnRe = /Designer['’]?s\s*Note\s*:/gi
        prevDnRe.lastIndex = prevHit.index
        const prevDnMatch = prevDnRe.exec(block)
        if (prevDnMatch) {
          start = findDesignerNoteEnd(block, prevDnMatch.index)
        } else {
          start = Math.floor((prevHit.index + hit.index) / 2)
        }
      }

      const chunk = block.slice(start, end).trim()
      const prior = chunks.get(hit.slug)
      if (!prior || chunk.length > prior.length) chunks.set(hit.slug, chunk)
    }
  }

  return chunks
}

/**
 * Split a card chunk into `{ flavor, body, designerNote }`. The boundaries:
 *
 * - `designerNote`: everything from "Designer's Note:" to the end of the chunk.
 *   GW writes one Designer's Note per card; the regex is forgiving of the OCR-
 *   style spelling variants we've seen.
 * - `flavor`: the first paragraph(s) of narrative text, ending where the rules
 *   text begins. We detect the rules boundary heuristically — the first
 *   sentence that contains a known rules marker token (an ALL-CAPS keyword in
 *   brackets, a known structural noun like "BATTLELINE", or an imperative
 *   verb at sentence start like "Each unit", "The players", "When a unit",
 *   "Terrain features", "A BATTLELINE", "A unit").
 *
 * If the rules-boundary detection fails, returns `flavor: undefined` and puts
 * the whole pre-Designer's-Note text into `body`. That keeps the card usable
 * even when the heuristic misses.
 */
export function splitDesignerNote(chunk: string): {
  flavor?: string
  body: string
  designerNote?: string
} {
  // Designer's Note split — GW writes it as "Designer's Note:" (with curly
  // apostrophe in print, ASCII in OCR). Be forgiving.
  const dnMatch = /Designer['’]?s\s*Note\s*:/i.exec(chunk)
  let designerNote: string | undefined
  let main = chunk
  if (dnMatch) {
    main = chunk.slice(0, dnMatch.index).trim()
    designerNote = chunk.slice(dnMatch.index + dnMatch[0].length).trim()
  }

  // Now split `main` into flavor + body using the rules-boundary heuristic.
  // We look for the start of a sentence/line that signals rules text.
  const rulesMarkers: RegExp[] = [
    /\bA\s+BATTLELINE\b/i,
    /\bBATTLELINE\b/i,
    /\bMOBILE\b\s+keyword/i,
    /\[INDIRECT FIRE\]/i,
    /Terrain features\s+do not have/i,
    /The players\s+(?:both\s+)?(?:exchange|replace)/i,
    /Each unit is not visible/i,
    /When a unit makes a normal or advance/i,
    /\bSolid rule\b/i,
  ]
  let boundaryIdx = -1
  for (const re of rulesMarkers) {
    const m = re.exec(main)
    if (m && (boundaryIdx < 0 || m.index < boundaryIdx)) {
      boundaryIdx = m.index
    }
  }

  if (boundaryIdx < 0) {
    return { body: main, designerNote }
  }

  // Walk back to the previous sentence boundary so flavor doesn't get cut
  // mid-sentence. We look for the nearest preceding `.`, `?`, or `!` and split
  // there; if none is found, fall back to the boundary itself.
  let cut = boundaryIdx
  for (let i = boundaryIdx - 1; i >= 0; i--) {
    const ch = main[i]
    if (ch === '.' || ch === '?' || ch === '!') {
      cut = i + 1
      break
    }
  }
  const flavor = main.slice(0, cut).trim()
  const body = main.slice(cut).trim()
  if (flavor.length === 0) return { body: main, designerNote }
  return { flavor, body, designerNote }
}

function makeSummary(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > 150 ? flat.slice(0, 147) + '...' : flat
}

export interface ParseTwistsOptions {
  retrievedAt?: string
  /** Override the source attribution title (test seam). */
  sourceTitle?: string
}

/**
 * Parse the raw extracted twists-PDF text into brain nodes.
 *
 * Returns one node per twist that we successfully matched against a slug.
 * Slugs whose fingerprints didn't match are reported in `missing` so callers
 * can surface them in build-graph output.
 */
export function parseTwists(rawText: string, opts: ParseTwistsOptions = {}): TwistParseResult {
  const cleaned = stripGarbageLines(rawText)
  const chunks = findCardChunks(cleaned)

  const retrievedAt = opts.retrievedAt ?? new Date().toISOString()
  const sourceTitle =
    opts.sourceTitle ?? 'GW Chapter Approved Twists deck (Micah local PDF transcript)'

  const nodes: Node[] = []
  const recognized: string[] = []

  for (const slug of TWIST_SLUGS) {
    const chunk = chunks.get(slug)
    if (!chunk) continue

    const { flavor, body, designerNote } = splitDesignerNote(chunk)
    if (!body || body.length < 8) {
      // Not enough text to be a meaningful node — skip.
      continue
    }

    const title = TWIST_TITLES[slug]
    const contentParts: string[] = []
    if (flavor) contentParts.push(`*${flavor}*`)
    contentParts.push(body)
    if (designerNote) contentParts.push(`*Designer's Note: ${designerNote}*`)
    const content = contentParts.join('\n\n')

    const source: Source = {
      type: 'community',
      title: sourceTitle,
      retrievedAt,
    }

    nodes.push({
      id: `ca11:twist:${slug}`,
      layer: 'core',
      category: 'twist',
      title,
      edition: '11th',
      content,
      summary: makeSummary(body),
      sources: [source],
      refs: [],
      version: 1,
      keywords: ['twist', '11th edition', 'chapter approved', slug.replace(/-/g, ' ')],
    })
    recognized.push(slug)
  }

  const missing = TWIST_SLUGS.filter((s) => !recognized.includes(s))
  return { nodes, recognized, missing }
}

/**
 * Load + parse twists from a local file. Returns `null` if the file doesn't
 * exist — callers handle the silent-skip pattern (matches the mission-cards
 * parser convention).
 */
export function loadTwistsFromFile(
  path: string,
  opts: ParseTwistsOptions = {},
): TwistParseResult | null {
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf-8')
  return parseTwists(raw, opts)
}
