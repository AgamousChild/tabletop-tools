/**
 * Extract detachment information from army list text and output
 * a JSON file mapping (event_id, player_name) → detachment_slug.
 *
 * Uses two strategies:
 * 1. Structured pattern matching (BattleScribe "Detachment:" line, New Recruit format)
 * 2. Substring matching against known Wahapedia detachment names
 *
 * Output: .local/meta/detachment-map.json
 *
 * Run: npx tsx src/meta/extract-detachments.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BCP_FACTION_TO_SLUG, SUBFACTION_PARENT } from './seed-dimensions.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BCP_DIR = '.local/ingest/bcp'
const WAHAPEDIA_PATH = path.resolve(__dirname, '../../../data-import/client/public/wahapedia/detachments.json')
const OUTPUT_PATH = '.local/meta/detachment-map.json'

interface WahapediaDetachment {
  id: string
  factionId: string
  name: string
}

// Wahapedia faction ID → our slug
const WH_FACTION_MAP: Record<string, string> = {
  AC: 'adeptus-custodes', AE: 'aeldari', AM: 'astra-militarum', AS: 'adepta-sororitas',
  AdM: 'adeptus-mechanicus', AoI: 'imperial-agents', CD: 'chaos-daemons', CSM: 'chaos-space-marines',
  DG: 'death-guard', DRU: 'drukhari', EC: 'emperors-children', GC: 'genestealer-cults',
  GK: 'grey-knights', LoV: 'leagues-of-votann', NEC: 'necrons', ORK: 'orks',
  QI: 'imperial-knights', QT: 'chaos-knights', SM: 'space-marines', TAU: 'tau-empire',
  TS: 'thousand-sons', TYR: 'tyranids', WE: 'world-eaters',
}

// Structured patterns (high confidence)
const STRUCTURED_PATTERNS: RegExp[] = [
  /^\+?\s*DETACHMENT:\s*(.+)$/im,
  /^Detachment:\s*(.+)$/im,
  /^Detachment\s*[-–]\s*(.+)$/im,
  /^--\s*(.+?)\s*Detachment\s*--$/im,
]

function slugify(name: string, factionSlug: string): string {
  return `${factionSlug}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
}

interface DetachmentMatch {
  eventId: string
  playerName: string
  detachmentSlug: string
  detachmentName: string
  factionSlug: string
  method: 'structured' | 'substring'
}

function main() {
  // Load Wahapedia detachments
  const wahapedia: WahapediaDetachment[] = JSON.parse(readFileSync(WAHAPEDIA_PATH, 'utf-8'))

  // Build lookup: detachment name (lowercase) → { name, factionSlug, slug }
  const detByName = new Map<string, { name: string; factionSlug: string; slug: string }[]>()
  for (const d of wahapedia) {
    const fs = WH_FACTION_MAP[d.factionId]
    if (!fs) continue
    const key = d.name.toLowerCase()
    if (!detByName.has(key)) detByName.set(key, [])
    detByName.get(key)!.push({ name: d.name, factionSlug: fs, slug: slugify(d.name, fs) })
  }

  // Sort detachment names by length descending (match longest first to avoid partial matches)
  const sortedDetNames = [...detByName.keys()].filter(n => n.length > 5).sort((a, b) => b.length - a.length)

  console.log(`${wahapedia.length} detachments loaded, ${sortedDetNames.length} searchable names\n`)

  const files = readdirSync(BCP_DIR).filter(f => f.startsWith('pairings-') && f.endsWith('.json'))
  const results: DetachmentMatch[] = []
  let total = 0
  let structured = 0
  let substring = 0
  let noMatch = 0

  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(BCP_DIR, file), 'utf-8'))
    const event = data.event
    const records = data.records as Record<string, { faction: string; listText?: string }>

    if (!records) continue

    for (const [playerName, rec] of Object.entries(records)) {
      if (!rec.listText) continue
      total++

      const bcpFaction = rec.faction
      const rawSlug = BCP_FACTION_TO_SLUG[bcpFaction]
      if (!rawSlug) continue
      const parentSlug = SUBFACTION_PARENT[rawSlug]
      const factionSlug = parentSlug || rawSlug

      const text = rec.listText

      // Strategy 1: structured pattern
      let matched = false
      for (const pat of STRUCTURED_PATTERNS) {
        const m = text.match(pat)
        if (m && m[1]) {
          const detName = m[1].trim()
          // Clean up common suffixes
          const cleaned = detName.replace(/\s*\(.*\)$/, '').replace(/\s*[-–].*$/, '').trim()
          const key = cleaned.toLowerCase()
          const candidates = detByName.get(key)
          if (candidates) {
            // Prefer same-faction match
            const sameFaction = candidates.find(c => c.factionSlug === factionSlug)
            const match = sameFaction || candidates[0]!
            results.push({
              eventId: event.id,
              playerName,
              detachmentSlug: match.slug,
              detachmentName: match.name,
              factionSlug,
              method: 'structured',
            })
            structured++
            matched = true
            break
          }
        }
      }

      if (matched) continue

      // Strategy 2: substring match against known names (longest first)
      const textLower = text.toLowerCase()
      for (const detNameLower of sortedDetNames) {
        if (textLower.includes(detNameLower)) {
          const candidates = detByName.get(detNameLower)!
          // Prefer same-faction match
          const sameFaction = candidates.find(c => c.factionSlug === factionSlug)
          if (sameFaction) {
            results.push({
              eventId: event.id,
              playerName,
              detachmentSlug: sameFaction.slug,
              detachmentName: sameFaction.name,
              factionSlug,
              method: 'substring',
            })
            substring++
            matched = true
            break
          }
          // Cross-faction match only if no same-faction option
          // (skip — likely a false positive like "Shield" matching "Shield Host")
        }
      }

      if (!matched) noMatch++
    }
  }

  console.log(`Total players with list text: ${total}`)
  console.log(`Structured match: ${structured} (${(structured / total * 100).toFixed(1)}%)`)
  console.log(`Substring match: ${substring} (${(substring / total * 100).toFixed(1)}%)`)
  console.log(`Total matched: ${structured + substring} (${((structured + substring) / total * 100).toFixed(1)}%)`)
  console.log(`No match: ${noMatch}`)

  // Top detachments
  const detCounts = new Map<string, number>()
  for (const r of results) detCounts.set(r.detachmentName, (detCounts.get(r.detachmentName) || 0) + 1)
  console.log('\nTop 20 detachments:')
  ;[...detCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([n, c]) => {
    console.log(`  ${c.toString().padStart(5)}  ${n}`)
  })

  // Save results
  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2))
  console.log(`\nSaved ${results.length} matches to ${OUTPUT_PATH}`)
}

main()
