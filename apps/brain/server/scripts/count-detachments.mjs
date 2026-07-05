/**
 * Detachment counts per faction across every source.
 * Applies the same slug normalization + canonical aliases as
 * count-factions.mjs so identical factions compare apples to apples.
 */
import { readdirSync, readFileSync } from 'node:fs'

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const CANONICAL_ALIAS = {
  'emperor-s-children': 'emperors-children',
  't-au-empire': 'tau-empire',
  'adeptus-titanicus': 'titan-legions',
}
const canonicalize = (s) => CANONICAL_ALIAS[s] ?? s

// ── Wahapedia detachments ─────────────────────────────────────────────
const wDet = JSON.parse(
  readFileSync('apps/data-import/client/public/wahapedia/detachments.json', 'utf8'),
)
const wCount = new Map()
for (const d of wDet) {
  const s = canonicalize(slug(d.factionId))
  wCount.set(s, (wCount.get(s) ?? 0) + 1)
}

// ── MFM detachments ────────────────────────────────────────────────────
const mfmDet = JSON.parse(
  readFileSync('apps/brain/server/.local/brain-input/mfm-detachments.json', 'utf8'),
)
const mfmCount = new Map()
for (const d of mfmDet) {
  if (!d.factionSlug) continue
  const s = canonicalize(d.factionSlug)
  mfmCount.set(s, (mfmCount.get(s) ?? 0) + 1)
}

// ── Faction pack extracts ─────────────────────────────────────────────
const packCount = new Map()
for (const f of readdirSync('apps/brain/server/.local/faction-pack-extracts')) {
  if (!f.endsWith('.json') || f === 'index.json') continue
  const factionSlug = canonicalize(f.replace('.json', ''))
  const p = JSON.parse(
    readFileSync(`apps/brain/server/.local/faction-pack-extracts/${f}`, 'utf8'),
  )
  packCount.set(factionSlug, (p.detachments || []).length)
}

// ── Brain built graph ─────────────────────────────────────────────────
// Count `detachment-rule` category nodes per faction.
const brainCount = new Map()
for (const f of readdirSync('apps/brain/server/.local/brain/nodes')) {
  if (!f.startsWith('faction-') || !f.endsWith('.json')) continue
  const factionSlug = f.replace('faction-', '').replace('.json', '')
  const o = JSON.parse(readFileSync(`apps/brain/server/.local/brain/nodes/${f}`, 'utf8'))
  const nodes = Array.isArray(o) ? o : o.nodes || []
  const n = nodes.filter((x) => x.category === 'detachment-rule').length
  brainCount.set(factionSlug, n)
}

// ── Union of factions ─────────────────────────────────────────────────
const allFactions = new Set([
  ...wCount.keys(),
  ...mfmCount.keys(),
  ...packCount.keys(),
  ...brainCount.keys(),
])

console.log('TOTALS:')
console.log('  Wahapedia detachments:', [...wCount.values()].reduce((a, b) => a + b, 0))
console.log('  MFM detachments:', [...mfmCount.values()].reduce((a, b) => a + b, 0))
console.log('  FactionPack detachments:', [...packCount.values()].reduce((a, b) => a + b, 0))
console.log('  Brain graph detachment-rule nodes:', [...brainCount.values()].reduce((a, b) => a + b, 0))

console.log('\nPER-FACTION MATRIX:')
console.log('faction\tWahapedia\tMFM\tFactionPack\tBrainGraph')
for (const f of [...allFactions].sort()) {
  console.log(
    [
      f,
      wCount.get(f) ?? 0,
      mfmCount.get(f) ?? 0,
      packCount.get(f) ?? 0,
      brainCount.get(f) ?? 0,
    ].join('\t'),
  )
}
