/**
 * CLI: extract all 29 11e faction packs into structured JSON.
 *
 * Reads:
 *   C:/R/sync-data/tools/gw-sync/.local/gw/markdown/faction-pack-*.md
 *   C:/R/sync-data/tools/gw-sync/.local/gw/pdfs/faction-pack-*.pdf  (path only)
 *
 * Writes (gitignored, in `.local/`):
 *   apps/brain/server/.local/faction-pack-extracts/<faction>.json
 *   apps/brain/server/.local/faction-pack-extracts/index.json
 *
 * Run:
 *   pnpm -F brain-server exec tsx scripts/extract-faction-packs.ts
 *
 * Per CLAUDE.md Rule 4 (everything is a callable function), the parser itself
 * lives in `@tabletop-tools/game-content/src/adapters/faction-pack/parser.ts`
 * (moved from `apps/brain/server/src/lib/parsers/faction-pack-v2.ts` so
 * data-import can share it); this script is the orchestration wrapper.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type PackExtract,
  parseFactionPackV2,
} from '@tabletop-tools/game-content/src/adapters/faction-pack/parser'

/**
 * Rename the raw markdown-filename slug into the canonical faction slug
 * used by dim_faction / MFM / brain. The upstream gw-sync produces
 * `faction-pack-emperor-s-children.md` (apostrophe → hyphen); brain-side
 * writes are keyed by `emperors-children` (apostrophe dropped, letters
 * joined). Applying the rename here keeps this extractor's outputs and the
 * downstream brain shards on the same slug.
 *
 * See apps/brain/server/src/lib/faction-codes.ts LEGACY_FACTION_REWRITES
 * for the shared rewrite table — `adeptus-titanicus` → `titan-legions`
 * lands here through the same code path.
 */
const FILENAME_SLUG_REWRITES: Record<string, string> = {
  'emperor-s-children': 'emperors-children',
  't-au-empire': 'tau-empire',
  'adeptus-titanicus': 'titan-legions',
}

function canonicalizeFactionSlug(rawSlug: string): string {
  return FILENAME_SLUG_REWRITES[rawSlug] ?? rawSlug
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MARKDOWN_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
const PDF_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/pdfs'
const OUT_DIR = path.resolve(__dirname, '..', '.local', 'faction-pack-extracts')

interface IndexEntry {
  faction: string
  packVersion?: string
  effectiveDate?: string
  sourceCharCount: number
  extractedChars: number
  residueChars: number
  residuePercent: number
  counts: {
    detachments: number
    datasheets: number
    legendsDatasheets: number
    armyRules: number
    errata: number
    faqs: number
    extras: number
    unparsed: number
  }
}

function ensureOutDir(): void {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
}

function discoverPacks(): Array<{ faction: string; markdownPath: string; pdfPath: string }> {
  if (!fs.existsSync(MARKDOWN_DIR)) {
    throw new Error(`Markdown source dir does not exist: ${MARKDOWN_DIR}`)
  }
  const files = fs
    .readdirSync(MARKDOWN_DIR)
    .filter((f) => f.startsWith('faction-pack-') && f.endsWith('.md'))
    .sort()
  return files.map((f) => {
    const rawSlug = f.replace(/^faction-pack-/, '').replace(/\.md$/, '')
    const faction = canonicalizeFactionSlug(rawSlug)
    return {
      faction,
      markdownPath: path.join(MARKDOWN_DIR, f),
      pdfPath: path.join(PDF_DIR, f.replace(/\.md$/, '.pdf')),
    }
  })
}

function summarise(p: PackExtract): IndexEntry {
  return {
    faction: p.faction,
    packVersion: p.packVersion,
    effectiveDate: p.effectiveDate,
    sourceCharCount: p.source.sourceCharCount,
    extractedChars: p.coverage.extractedChars,
    residueChars: p.coverage.residueChars,
    residuePercent: Math.round(p.coverage.residuePercent * 100) / 100,
    counts: {
      detachments: p.detachments.length,
      datasheets: p.datasheets.length,
      legendsDatasheets: p.legendsDatasheets.length,
      armyRules: p.armyRules.length,
      errata: p.errata.length,
      faqs: p.faqs.length,
      extras: p.extras.length,
      unparsed: p.unparsed.length,
    },
  }
}

function main(): void {
  ensureOutDir()
  const packs = discoverPacks()
  console.log(`Found ${packs.length} faction packs`)

  const index: IndexEntry[] = []
  for (const { faction, markdownPath, pdfPath } of packs) {
    const markdown = fs.readFileSync(markdownPath, 'utf-8')
    const extract = parseFactionPackV2(markdown, { faction, markdownPath, pdfPath })

    const outPath = path.join(OUT_DIR, `${faction}.json`)
    fs.writeFileSync(outPath, JSON.stringify(extract, null, 2), 'utf-8')

    const summary = summarise(extract)
    index.push(summary)
    console.log(
      `[${faction}] ${summary.counts.detachments}D ${summary.counts.datasheets}DS ${summary.counts.legendsDatasheets}L ` +
        `${summary.counts.errata}E ${summary.counts.faqs}F ` +
        `→ residue ${summary.residuePercent.toFixed(2)}%`,
    )
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8')
  console.log(`\nWrote ${index.length} extracts + index.json to ${OUT_DIR}`)

  // Quick summary
  const overTwoPercent = index.filter((e) => e.residuePercent > 2)
  console.log(`\n${overTwoPercent.length} pack(s) over 2% residue:`)
  for (const e of overTwoPercent) {
    console.log(`  ${e.faction}: ${e.residuePercent.toFixed(2)}%`)
  }
}

main()
