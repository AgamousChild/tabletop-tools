/**
 * Compute faction slug sets across every source. Print the raw sets + the
 * pairwise "in X but not Y" differences so we can annotate each with a reason.
 */
import { readdirSync, readFileSync } from 'node:fs'

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// ── Wahapedia ────────────────────────────────────────────────────────────
const wFac = JSON.parse(
  readFileSync('apps/data-import/client/public/wahapedia/factions.json', 'utf8'),
)
const wSlugs = new Set(wFac.map((f) => slug(f.name)))

// ── BSData ───────────────────────────────────────────────────────────────
const bs = JSON.parse(
  readFileSync('apps/brain/server/.local/brain-input/bsdata-units.json', 'utf8'),
)
const bsRaw = new Set(bs.map((u) => u.faction).filter(Boolean))
const bsSlugs = new Set()
const bsSubgroups = new Set()
for (const f of bsRaw) {
  if (/library/i.test(f)) continue
  const parent = f.split(' - ')[0].trim()
  bsSlugs.add(slug(parent))
  if (f.includes(' - ')) bsSubgroups.add(f)
}

// ── MFM ──────────────────────────────────────────────────────────────────
const mfmC = JSON.parse(
  readFileSync('apps/brain/server/.local/brain-input/mfm-unit-costing.json', 'utf8'),
)
const mfmD = JSON.parse(
  readFileSync('apps/brain/server/.local/brain-input/mfm-detachments.json', 'utf8'),
)
const mfmSlugs = new Set(
  [...mfmC.map((r) => r.factionSlug), ...mfmD.map((r) => r.factionSlug)]
    .filter(Boolean)
    .map(slug),
)

// ── Faction packs ────────────────────────────────────────────────────────
const packSlugs = new Set(
  readdirSync('apps/brain/server/.local/faction-pack-extracts')
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => f.replace('.json', '')),
)

// ── Brain built graph ────────────────────────────────────────────────────
const brainSlugs = new Set(
  readdirSync('apps/brain/server/.local/brain/nodes')
    .filter((f) => f.startsWith('faction-') && f.endsWith('.json'))
    .map((f) => f.replace('faction-', '').replace('.json', '')),
)

// ── Brain dim_faction (prod snapshot) ────────────────────────────────────
// 36-entry set after the 2026-07-05 First Founding chapter promotion:
//   - added `imperial-fists`, `iron-hands`, `raven-guard`, `salamanders`,
//     `ultramarines`, `white-scars` — the six First Founding chapters that
//     already had dim_subfaction rows but weren't yet their own dim_faction
//     rows. Chapter-specific characters (Marneus Calgar, Vulkan He'stan,
//     Kayvaan Shrike, etc.) now route to `factionId=<chapter-slug>` and
//     appear in their own faction shard. Shared SM datasheets stay under
//     `space-marines` and reach chapter queries via the dim_subfaction
//     parent walk in `expandFactionForRetrieval`.
// Previous 28-entry set (2026-07-05 faction-model cleanup) dropped:
//   - `adeptus-titanicus` (merged into `titan-legions`)
//   - `unaligned-forces` (not a real faction — scenery/objectives
//     that Wahapedia files under an umbrella)
//   - `unbound-adversaries` (Wahapedia-only wrapper faction)
//   - `unknown` sentinel (weapons whose parent datasheet is gone
//     are now filtered out at ingestion instead of falling into a shard)
const dimSlugs = new Set([
  'adepta-sororitas',
  'adeptus-custodes',
  'adeptus-mechanicus',
  'aeldari',
  'astra-militarum',
  'black-templars',
  'blood-angels',
  'chaos-daemons',
  'chaos-knights',
  'chaos-space-marines',
  'chaos-titan-legions',
  'dark-angels',
  'death-guard',
  'deathwatch',
  'drukhari',
  'emperors-children',
  'genestealer-cults',
  'grey-knights',
  'imperial-agents',
  'imperial-fists',
  'imperial-knights',
  'iron-hands',
  'leagues-of-votann',
  'necrons',
  'orks',
  'raven-guard',
  'salamanders',
  'space-marines',
  'space-wolves',
  'tau-empire',
  'thousand-sons',
  'titan-legions',
  'tyranids',
  'ultramarines',
  'white-scars',
  'world-eaters',
])

// ── Report ───────────────────────────────────────────────────────────────
const sources = {
  Wahapedia: wSlugs,
  BSData: bsSlugs,
  MFM: mfmSlugs,
  FactionPack: packSlugs,
  BrainGraph: brainSlugs,
  DimFaction: dimSlugs,
}

console.log('COUNTS:')
for (const [name, set] of Object.entries(sources)) {
  console.log(`  ${name}: ${set.size}`)
}

const union = new Set()
for (const s of Object.values(sources)) for (const x of s) union.add(x)
const sorted = [...union].sort()

console.log(`\nUNION: ${sorted.length}\n`)

console.log('SLUG × SOURCE MATRIX:')
const header = ['slug', ...Object.keys(sources)]
console.log(header.join('\t'))
for (const s of sorted) {
  console.log([s, ...Object.values(sources).map((set) => (set.has(s) ? '1' : '0'))].join('\t'))
}

console.log('\nPAIRWISE DIFFERENCES (present in row, absent from col):')
const names = Object.keys(sources)
for (const a of names) {
  for (const b of names) {
    if (a === b) continue
    const only = [...sources[a]].filter((x) => !sources[b].has(x)).sort()
    if (only.length > 0) console.log(`  ${a} \\ ${b} (${only.length}): ${only.join(', ')}`)
  }
}

console.log(`\nBSData subgroups (${bsSubgroups.size}):`)
for (const g of [...bsSubgroups].sort()) console.log(`  ${g}`)
