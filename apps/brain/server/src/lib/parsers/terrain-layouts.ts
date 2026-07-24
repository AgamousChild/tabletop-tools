/**
 * Brain emitter for the 11e Warhammer Event Companion terrain layouts.
 *
 * The 45 layouts sit on pages 9-53 of the July 2026 Warhammer Event Companion
 * PDF (`eng_22-07_warhammer_40,000_event_companion.pdf`). Each page is a
 * single visual layout — objective marker placements, deployment-zone splits,
 * and terrain footprint distances (labelled AB / CD / EF / GH). The rules
 * content lives in the image; we ingest image-only nodes.
 *
 * Pipeline:
 *   1. PyMuPDF renders pages 9-53 into
 *      `.local/brain-input/cards/terrain-layout-images/page-{1..45}.png`.
 *   2. Wrangler uploads each PNG to R2 under
 *      `pages/ca11-terrain-layouts/page-{1..45}.png`.
 *   3. Tesseract.js OCRs the top-45% label region of each PNG and produces
 *      `.local/brain-input/cards/terrain-layouts-labels.json` with the
 *      attacker/defender disposition, mission, and layout letter for each page.
 *   4. `buildTerrainLayoutNodes()` (this file) reads that label map and emits
 *      45 image-only nodes with descriptive titles/content; falls back to a
 *      generic "TERRAIN LAYOUT N" title when the label map is absent.
 *
 * Source title stays literal `CA11 Terrain Layouts` — the client slugifies
 * that to `ca11-terrain-layouts`, which the worker's `/pages/:pdfName/page-:n.png`
 * endpoint routes to the R2 prefix above.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Node } from '../model'

/** Number of terrain-layout pages extracted from the Event Companion PDF. */
export const TERRAIN_LAYOUT_COUNT = 45

/** Shape of a single entry in `terrain-layouts-labels.json`. */
interface TerrainLayoutLabel {
  attacker_disposition: string | null
  defender_disposition: string | null
  attacker_mission: string | null
  defender_mission: string | null
  layout: string | null
}

const LABEL_PATH = resolve('.local/brain-input/cards/terrain-layouts-labels.json')

/**
 * Load the OCR'd label mapping (page number → structured label) if present.
 * Returns null when the file is missing — the caller falls back to generic
 * titles.
 */
function loadTerrainLayoutLabels(): Map<number, TerrainLayoutLabel> | null {
  if (!existsSync(LABEL_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(LABEL_PATH, 'utf-8')) as Record<string, TerrainLayoutLabel>
    const map = new Map<number, TerrainLayoutLabel>()
    for (const [k, v] of Object.entries(raw)) {
      map.set(Number(k), v)
    }
    return map
  } catch {
    return null
  }
}

/**
 * Format a display title for a terrain layout. Symmetric matchups collapse
 * to a single disposition; asymmetric ones show both sides.
 */
function formatTitle(label: TerrainLayoutLabel, page: number): string {
  const a = label.attacker_disposition
  const d = label.defender_disposition
  const l = label.layout
  if (!a || !l) return `TERRAIN LAYOUT ${page}`
  const disp = a === d ? a : `${a} vs ${d}`
  return `${disp} — LAYOUT ${l}`
}

export interface BuildTerrainLayoutNodesOptions {
  retrievedAt?: string
  /**
   * Override for the source-attribution title. The client slugifies this to
   * derive the `pdfName` used in the `/pages/:pdfName/page-:n.png` URL, so
   * this string MUST slugify to `ca11-terrain-layouts` (the R2 prefix where
   * `upload-terrain-layout-images.ts` puts the PNGs).
   */
  sourceTitle?: string
  /** Override for the source `publishedAt` date. */
  publishedAt?: string
}

/**
 * Emit the 40 11e Warhammer Event Companion terrain-layout nodes. No external
 * input — the layout count is fixed and the images live in R2.
 */
export function buildTerrainLayoutNodes(opts: BuildTerrainLayoutNodesOptions = {}): Node[] {
  const retrievedAt = opts.retrievedAt ?? new Date().toISOString()
  const sourceTitle = opts.sourceTitle ?? 'CA11 Terrain Layouts'
  const publishedAt = opts.publishedAt
  const labels = loadTerrainLayoutLabels()

  const nodes: Node[] = []
  for (let i = 1; i <= TERRAIN_LAYOUT_COUNT; i++) {
    const label = labels?.get(i)
    const title = label ? formatTitle(label, i) : `TERRAIN LAYOUT ${i}`

    // Build a descriptive body when the OCR label is present. Includes both
    // sides' disposition + primary mission so search + LLM retrieval have
    // handles for "what layouts are used for Purge the Foe vs Take and Hold".
    const contentLines: string[] = []
    if (label?.attacker_disposition && label.defender_disposition) {
      contentLines.push(
        `**Attacker force disposition:** ${label.attacker_disposition}` +
          (label.attacker_mission ? ` — mission: ${label.attacker_mission}` : ''),
      )
      contentLines.push(
        `**Defender force disposition:** ${label.defender_disposition}` +
          (label.defender_mission ? ` — mission: ${label.defender_mission}` : ''),
      )
      if (label.layout) contentLines.push(`**Layout:** ${label.layout}`)
      contentLines.push('')
    }
    contentLines.push(
      `Warhammer Event Companion (July 2026) terrain layout ${i} of ${TERRAIN_LAYOUT_COUNT}. ` +
        `Objective markers labelled AB, CD, EF, GH with placement distances; ` +
        `see the layout card image for the specific configuration.`,
    )

    const keywords: string[] = ['terrain', 'terrain layout', '11th edition', `layout ${i}`]
    if (label?.attacker_disposition) {
      keywords.push(label.attacker_disposition.toLowerCase())
      if (label.attacker_mission) keywords.push(label.attacker_mission.toLowerCase())
    }
    if (label?.defender_disposition && label.defender_disposition !== label.attacker_disposition) {
      keywords.push(label.defender_disposition.toLowerCase())
    }
    if (label?.defender_mission && label.defender_mission !== label.attacker_mission) {
      keywords.push(label.defender_mission.toLowerCase())
    }
    if (label?.layout) keywords.push(`layout ${label.layout.toLowerCase()}`)

    nodes.push({
      id: `ca11:terrain-layout:${i}`,
      layer: 'core',
      category: 'terrain-layout',
      title,
      edition: '11th',
      content: contentLines.join('\n'),
      summary: label ? title : `11e terrain layout ${i}`,
      sources: [
        {
          type: 'pdf',
          title: sourceTitle,
          page: i,
          retrievedAt,
          ...(publishedAt ? { publishedAt } : {}),
        },
      ],
      refs: [],
      version: 1,
      keywords: Array.from(new Set(keywords)),
    })
  }
  return nodes
}
