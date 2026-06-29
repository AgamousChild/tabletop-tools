/**
 * Brain parser for the 11e Chapter Approved mission cards.
 *
 * Pipeline:
 *   1. download-mission-cards.ts → .local/brain-input/mission-cards/11th/*.png
 *   2. ocr-mission-cards.ts → .local/brain-input/mission-cards/11th/ocr.json
 *   3. (this module) build-graph reads ocr.json, emits brain nodes.
 *
 * We deliberately do NOT parse VP-scoring formulas into structured fields
 * here — OCR error rates on the 11e card art are still meaningful (see PR
 * body for accuracy notes). Keeping rules text as clean strings means a bad
 * OCR run produces a noticeably-wrong-but-still-usable node, not a
 * silently-broken structured field.
 *
 * @see apps/brain/server/src/lib/parsers/mission-card-urls.ts — URL inventory
 * @see apps/brain/server/src/lib/parsers/mission-card-ocr.ts — OCR module
 * @see apps/brain/server/src/build-graph.ts — wiring
 */
import { existsSync, readFileSync } from 'node:fs'

import type { Node, Source } from '../model'

/**
 * One entry in `ocr.json`. The OCR driver writes one of these per card image
 * it processed (whether successful or not — failures have empty text).
 */
export interface MissionCardOcrEntry {
  /** Card slug from URL (e.g. `take-and-hold`, `assassination`). */
  slug: string
  /** `primary | secondary | force-disposition` */
  kind: 'primary' | 'secondary' | 'force-disposition'
  /** Deck name for primary, side (`attacker`/`defender`) for secondary. */
  group: string
  /** `true` for `*-back.png` images. */
  back: boolean
  /** OCR'd title text. May be empty if the OCR couldn't isolate one. */
  title: string
  /** OCR'd body text. */
  body: string
  /** Source URL on gdmissions.app */
  sourceUrl: string
  /** ISO timestamp this card was OCR'd. */
  ocrAt: string
  /** Path on disk relative to the input root (informational). */
  relPath: string
}

export interface MissionCardOcrManifest {
  /** ISO timestamp of the OCR batch run. */
  generatedAt: string
  cards: MissionCardOcrEntry[]
}

export interface ParseMissionCardsResult {
  nodes: Node[]
  /** Number of primary card nodes emitted. */
  primaries: number
  /** Number of secondary card nodes emitted. */
  secondaries: number
  /** Number of OCR entries skipped (empty body, no title, etc.). */
  skipped: number
}

/**
 * Title-case a kebab-cased card slug: `secure-no-man-s-land` → `Secure No Man S Land`.
 * (We don't try to reconstruct apostrophes — the slug shape loses them.)
 */
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ')
}

function makeSummary(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > 150 ? flat.slice(0, 147) + '...' : flat
}

/**
 * Try to load the OCR manifest from a path. Returns `null` if the file
 * doesn't exist — callers should handle this gracefully (the build is
 * resilient to missing OCR data; mission cards just don't get ingested).
 */
export function loadMissionCardOcr(path: string): MissionCardOcrManifest | null {
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf-8')
  return JSON.parse(text) as MissionCardOcrManifest
}

/**
 * Parse an OCR manifest into brain nodes.
 *
 * Card backs (`back: true`) don't get their own node — instead the back's
 * body text is appended onto the front card's content as a separate
 * `**Back:**` block. This keeps the brain's record-per-card invariant
 * (one logical card == one node) intact.
 */
export function parseMissionCards(manifest: MissionCardOcrManifest): ParseMissionCardsResult {
  const nodes: Node[] = []
  let skipped = 0
  let primaries = 0
  let secondaries = 0

  // Bucket back-of-card text by front-card id so we can attach it after the
  // first pass without depending on iteration order.
  const backsById = new Map<string, string>()

  // First pass: collect back-of-card text.
  for (const entry of manifest.cards) {
    if (!entry.back) continue
    const body = entry.body?.trim()
    if (!body) continue
    if (entry.kind === 'primary') {
      backsById.set(`ca11:primary:${entry.group}:${entry.slug}`, body)
    } else if (entry.kind === 'secondary') {
      backsById.set(`ca11:secondary:${entry.group}:${entry.slug}`, body)
    }
  }

  // Second pass: emit front-card nodes, attach backs.
  for (const entry of manifest.cards) {
    if (entry.back) continue
    if (entry.kind === 'force-disposition') {
      // Icons — no text content worth ingesting.
      skipped++
      continue
    }

    const body = entry.body?.trim() ?? ''
    if (!body) {
      // Empty OCR — surface in counts but don't emit a node.
      skipped++
      continue
    }

    // Title preference: OCR'd title if it looks reasonable, otherwise the
    // pretty-printed slug. The slug fallback is always present so we never
    // emit a node with an empty `title`.
    const titleFromOcr = entry.title?.trim() ?? ''
    const titleFromSlug = slugToTitle(entry.slug).toUpperCase()
    const title =
      titleFromOcr.length >= 2 && titleFromOcr.length <= 60 ? titleFromOcr : titleFromSlug

    const source: Source = {
      type: 'community',
      title: 'gdmissions.app (community-cached image of GW Chapter Approved 11e mission deck)',
      url: entry.sourceUrl,
      retrievedAt: entry.ocrAt,
    }

    if (entry.kind === 'primary') {
      const id = `ca11:primary:${entry.group}:${entry.slug}`
      const backText = backsById.get(id)
      const contentBlocks = [body]
      if (backText) contentBlocks.push(`**Back:**\n${backText}`)
      const content = contentBlocks.join('\n\n')

      nodes.push({
        id,
        layer: 'core',
        category: 'primary-mission',
        title,
        // `subfaction` is reused as the deck name per task spec — this lets
        // the existing browse filters slice by deck without adding a new field.
        subfaction: entry.group,
        edition: '11th',
        content,
        summary: makeSummary(body),
        sources: [source],
        refs: [],
        version: 1,
        keywords: [
          'primary mission',
          '11th edition',
          entry.slug.replace(/-/g, ' '),
          entry.group.replace(/-/g, ' '),
        ],
      })
      primaries++
    } else {
      // secondary
      const id = `ca11:secondary:${entry.group}:${entry.slug}`
      const backText = backsById.get(id)
      const contentBlocks = [body]
      if (backText) contentBlocks.push(`**Back:**\n${backText}`)
      const content = contentBlocks.join('\n\n')

      nodes.push({
        id,
        layer: 'core',
        category: 'secondary-mission',
        title,
        edition: '11th',
        content,
        summary: makeSummary(body),
        sources: [source],
        refs: [],
        version: 1,
        keywords: [
          'secondary mission',
          '11th edition',
          entry.group, // 'attacker' | 'defender'
          entry.slug.replace(/-/g, ' '),
        ],
      })
      secondaries++
    }
  }

  return { nodes, primaries, secondaries, skipped }
}
