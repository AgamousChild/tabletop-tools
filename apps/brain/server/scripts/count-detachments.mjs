/**
 * count-detachments.mjs
 *
 * Reads the built brain graph from .local/brain/nodes/ and reports:
 *   - Total 11e detachment nodes (per-faction, as stored in the graph)
 *   - Unique detachment titles (cross-faction, normalized) — this is the
 *     canonical "how many distinct detachments exist" metric. The MFM source
 *     has exactly 266 unique titles; the brain should match.
 *   - Count by faction
 *   - SM family analysis: shared vs chapter-unique titles
 *
 * Counting methodology:
 *   - "Per-faction node count": counts every stored 11e detachment node,
 *     including SM-shared detachments repeated for each chapter (blood-angels,
 *     dark-angels, etc.). This is by design — retrieval works per-factionId.
 *   - "Unique title count": normalizes titles (lower-case, strip non-alnum)
 *     and counts distinct values. This is the 266 metric.
 *
 * Node categories included:
 *   - category=detachment: merged MFM+pack (primary 11e entity) or MFM-only
 *   - category=detachment-rule: faction-focus / build11thEditionNodes entries
 *     that didn't merge with an MFM node (only 11e:det:* ids, not containers)
 *
 * Usage (from apps/brain/server/):
 *   node scripts/count-detachments.mjs
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NODES_DIR = join(import.meta.dirname, '..', '.local', 'brain', 'nodes')

let allNodes
try {
  const files = readdirSync(NODES_DIR).filter((f) => f.endsWith('.json'))
  allNodes = files.flatMap((f) => {
    const data = JSON.parse(readFileSync(join(NODES_DIR, f), 'utf-8'))
    return Array.isArray(data) ? data : [data]
  })
} catch (err) {
  console.error(`ERROR: could not read ${NODES_DIR}: ${err.message}`)
  console.error('Run build-graph.ts first: npx tsx src/build-graph.ts')
  process.exit(1)
}

const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '')

// 11e detachment nodes:
//   - category=detachment with id starting with '11e:' or 'mfm:' — primary entities
//   - category=detachment-rule with id starting with '11e:' — unmerged faction-focus entries
// EXCLUDE: category=detachment with id starting with 'detachment:' — these are container
//   nodes built by buildDetachmentNodes() wrapping a detachment-rule; they are structural
//   duplicates of the rule node, not additional distinct detachments.
const eleventh = allNodes.filter((n) => {
  if (n.edition !== '11th') return false
  if (n.category === 'detachment') {
    // Include 11e:det:* (merged pack+MFM) and mfm:det:* (MFM-only)
    // Exclude detachment:11e:det:* (containers built by buildDetachmentNodes)
    return n.id.startsWith('11e:det:') || n.id.startsWith('mfm:det:')
  }
  if (n.category === 'detachment-rule') {
    // Include 11e:det:* (from build11thEditionNodes, not yet merged with MFM)
    // These are valid 11e detachment representations when no MFM twin exists
    return n.id.startsWith('11e:det:')
  }
  return false
})

const tenth = allNodes.filter(
  (n) => (n.category === 'detachment' || n.category === 'detachment-rule') && n.edition === '10th',
)

// Per-faction node count
const byFaction = {}
for (const n of eleventh) {
  const f = n.factionId || '?'
  if (!byFaction[f]) byFaction[f] = []
  byFaction[f].push(n.title)
}

// Unique titles (normalized, cross-faction) — the canonical 266 metric
const uniqueTitlesNorm = new Set(eleventh.map((n) => normalize(n.title)))

// Duplicate title+faction combos (per-faction dedup check)
const seenByFaction = new Set()
const duplicatesByFaction = []
for (const n of eleventh) {
  const key = `${n.factionId ?? '?'}::${normalize(n.title)}`
  if (seenByFaction.has(key)) {
    duplicatesByFaction.push({ factionId: n.factionId, title: n.title, id: n.id })
  } else {
    seenByFaction.add(key)
  }
}

// SM family analysis
const SM_CHAPTER_SLUGS = new Set(['blood-angels', 'dark-angels', 'black-templars', 'space-wolves', 'deathwatch'])
const smNodes = eleventh.filter((n) => n.factionId === 'space-marines' || SM_CHAPTER_SLUGS.has(n.factionId))
const smSharedTitles = new Set(
  eleventh.filter((n) => n.factionId === 'space-marines').map((n) => normalize(n.title))
)
const chapterUniqueTitles = new Set(
  smNodes
    .filter((n) => SM_CHAPTER_SLUGS.has(n.factionId) && !smSharedTitles.has(normalize(n.title)))
    .map((n) => normalize(n.title))
)
const nonSmNodes = eleventh.filter((n) => n.factionId !== 'space-marines' && !SM_CHAPTER_SLUGS.has(n.factionId))
const nonSmUniqueTitles = new Set(nonSmNodes.map((n) => normalize(n.title)))

console.log('=== 11e Detachment Count ===')
console.log(`Total 11e detachment nodes (per-faction): ${eleventh.length}`)
console.log(`  category=detachment (11e:det:* + mfm:det:*): ${eleventh.filter((n) => n.category === 'detachment').length}`)
console.log(`  category=detachment-rule (11e:det:*, unmerged): ${eleventh.filter((n) => n.category === 'detachment-rule').length}`)
console.log(`Unique titles cross-faction (normalized): ${uniqueTitlesNorm.size}  ← target: 266`)
console.log(`10e detachment nodes: ${tenth.length}`)
console.log()

console.log('=== SM Family Analysis ===')
console.log(`SM shared detachments (space-marines slug): ${smSharedTitles.size}`)
console.log(`Chapter-unique detachments (in chapters, not in SM shared): ${chapterUniqueTitles.size}`)
console.log(`Non-SM unique titles: ${nonSmUniqueTitles.size}`)
console.log(`Sum: ${smSharedTitles.size} + ${chapterUniqueTitles.size} + ${nonSmUniqueTitles.size} = ${smSharedTitles.size + chapterUniqueTitles.size + nonSmUniqueTitles.size}`)
console.log()

console.log('=== By Faction (11e, per-faction node count) ===')
const sorted = Object.entries(byFaction).sort((a, b) => b[1].length - a[1].length)
for (const [faction, titles] of sorted) {
  console.log(`  ${faction}: ${titles.length}`)
}
console.log()

if (duplicatesByFaction.length > 0) {
  console.log(`=== Per-Faction Duplicates (${duplicatesByFaction.length}) ===`)
  console.log('(Same factionId+title appears twice — indicates merge or emit bug)')
  for (const d of duplicatesByFaction) {
    console.log(`  ${d.factionId} / ${d.title} — ${d.id}`)
  }
} else {
  console.log('No per-faction duplicate title+faction combos found.')
}
