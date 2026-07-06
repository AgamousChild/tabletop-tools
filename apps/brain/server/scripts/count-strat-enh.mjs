/**
 * Per-detachment stratagem + enhancement count across all sources.
 * Ground truth: 11e faction packs + MFM. Wahapedia is 10e legacy.
 * Brain graph is the current build output.
 */
import { readdirSync, readFileSync } from 'node:fs'

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

const CANONICAL = {
  'emperor-s-children': 'emperors-children',
  't-au-empire': 'tau-empire',
  'adeptus-titanicus': 'titan-legions',
}
const factionSlug = (s) => CANONICAL[slug(s)] ?? slug(s)

// ── Wahapedia stratagems ──────────────────────────────────────────────
const wStrat = JSON.parse(
  readFileSync('apps/data-import/client/public/wahapedia/stratagems.json', 'utf-8'),
)
// group by (factionId, detachmentId)
const wStratByDet = new Map() // det-wahapedia-id → { faction, name, stratagems: [] }
const wStratByDetName = new Map() // `${factionSlug}::${detNorm}` → count
const wStratByFactionOnly = new Map() // stratagems with detachmentId=''
for (const s of wStrat) {
  const fSlug = factionSlug(s.factionId)
  if (!s.detachmentId) {
    if (!wStratByFactionOnly.has(fSlug)) wStratByFactionOnly.set(fSlug, [])
    wStratByFactionOnly.get(fSlug).push(s.name)
    continue
  }
  const key = `${fSlug}::${s.detachmentId}`
  if (!wStratByDet.has(key)) wStratByDet.set(key, [])
  wStratByDet.get(key).push(s.name)
}

// Map Wahapedia detachmentId → detachment name
const wDetIdToName = new Map()
const wDet = JSON.parse(
  readFileSync('apps/data-import/client/public/wahapedia/detachments.json', 'utf-8'),
)
for (const d of wDet) {
  wDetIdToName.set(`${factionSlug(d.factionId)}::${d.id}`, d.name)
}

// ── Wahapedia enhancements ────────────────────────────────────────────
const wEnh = JSON.parse(
  readFileSync('apps/data-import/client/public/wahapedia/enhancements.json', 'utf-8'),
)
const wEnhByDet = new Map()
for (const e of wEnh) {
  if (!e.detachmentId) continue
  const key = `${factionSlug(e.factionId)}::${e.detachmentId}`
  if (!wEnhByDet.has(key)) wEnhByDet.set(key, [])
  wEnhByDet.get(key).push(e.name)
}

// ── MFM detachments + enhancements ────────────────────────────────────
const mfm = JSON.parse(
  readFileSync('apps/brain/server/.local/brain-input/mfm-detachments.json', 'utf-8'),
)
const mfmEnhByDet = new Map() // `${faction}::${normDetName}` → [{name, points}]
for (const d of mfm) {
  if (!d.factionSlug || !d.name || !Array.isArray(d.enhancements)) continue
  const key = `${factionSlug(d.factionSlug)}::${norm(d.name)}`
  mfmEnhByDet.set(
    key,
    d.enhancements.map((e) => ({
      name: e.name,
      points: e.points,
      isUpgrade: /\(upgrade\)/i.test(e.name),
    })),
  )
}

// ── Brain graph nodes per detachment ──────────────────────────────────
// Group category='stratagem' and category='enhancement' by detachmentId + factionId
// factionId is the destination shard; detachmentId is a slug string
const brainStratByDet = new Map()
const brainEnhByDet = new Map()
const brainDetByShard = new Map() // shard → [{title, slugId}]
for (const f of readdirSync('apps/brain/server/.local/brain/nodes')) {
  if (!f.startsWith('faction-') || !f.endsWith('.json')) continue
  const shard = f.replace('faction-', '').replace('.json', '')
  const raw = JSON.parse(readFileSync(`apps/brain/server/.local/brain/nodes/${f}`, 'utf-8'))
  const nodes = Array.isArray(raw) ? raw : raw.nodes || []
  const detsInShard = []
  for (const n of nodes) {
    if (n.category === 'detachment' && n.edition === '11th')
      detsInShard.push({ title: n.title, id: n.id, dpId: n.detachmentId })
    if (!n.detachmentId || n.edition !== '11th') continue
    // detachmentId is the slug (e.g. 'hand-of-the-dynasty'); shard is n.factionId
    const key = n.detachmentId // match /browse/detachment/:id join (by detachmentId only)
    if (n.category === 'stratagem') {
      if (!brainStratByDet.has(key)) brainStratByDet.set(key, [])
      brainStratByDet.get(key).push(n.title)
    }
    if (n.category === 'enhancement') {
      if (!brainEnhByDet.has(key)) brainEnhByDet.set(key, [])
      brainEnhByDet.get(key).push({
        title: n.title,
        cost: n.cost,
        leaderTo: n.leaderTo,
      })
    }
  }
  brainDetByShard.set(shard, detsInShard)
}

// ── Print per-detachment matrix ───────────────────────────────────────
console.log('=== PER-DETACHMENT STRAT + ENH COUNT ===\n')
console.log(
  ['shard', 'detachment', 'brain-strats', 'brain-enhs', 'brain-upgrades', 'mfm-enhs', 'mfm-upgrades'].join('\t'),
)

const shards = [...brainDetByShard.keys()].sort()
let brainStratMissing = 0
let brainEnhMissing = 0
let brainEnhCostMissing = 0
for (const shard of shards) {
  const dets = brainDetByShard.get(shard)
  for (const det of dets) {
    const key = det.dpId // match endpoint join
    const mfmKey = `${shard}::${norm(det.title)}`
    const brainStrats = brainStratByDet.get(key) || []
    const brainEnhs = brainEnhByDet.get(key) || []
    const brainUpgrades = brainEnhs.filter((e) => /\(upgrade\)/i.test(e.title))
    const mfmEnhs = mfmEnhByDet.get(mfmKey) || []
    const mfmUpgrades = mfmEnhs.filter((e) => e.isUpgrade)
    // Also count enhancements with missing cost
    for (const e of brainEnhs) if (e.cost === undefined || e.cost === null) brainEnhCostMissing++
    if (brainStrats.length === 0) brainStratMissing++
    if (brainEnhs.length === 0) brainEnhMissing++
    console.log(
      [
        shard,
        det.title,
        brainStrats.length,
        brainEnhs.length,
        brainUpgrades.length,
        mfmEnhs.length,
        mfmUpgrades.length,
      ].join('\t'),
    )
  }
}
console.log(`\n=== SUMMARY ===`)
let totalDets = 0
for (const dets of brainDetByShard.values()) totalDets += dets.length
console.log(`  Total 11e detachments: ${totalDets}`)
console.log(`  Detachments with 0 brain stratagems: ${brainStratMissing}`)
console.log(`  Detachments with 0 brain enhancements: ${brainEnhMissing}`)
console.log(`  Brain enhancement nodes with missing cost: ${brainEnhCostMissing}`)
