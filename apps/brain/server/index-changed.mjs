/**
 * Trigger /index-vectors for each changed node file individually so that
 * the new 11e faction pack content lands in Vectorize. Sequential because
 * each call holds the Worker for ~30s; parallel would just queue.
 */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

// Index the 46 node files that we just uploaded — known up front.
const FILES = [
  'nodes/balance.json',
  'nodes/community.json',
  'nodes/community-recent.json',
  'nodes/core.json',
  'nodes/errata.json',
  'nodes/11e-40kdc-missions.json',
  'nodes/11e-space-marines-armageddon.json',
  'nodes/faction-unaligned.json',
  'nodes/faction-adepta-sororitas.json',
  'nodes/faction-adeptus-custodes.json',
  'nodes/faction-adeptus-mechanicus.json',
  'nodes/faction-adeptus-titanicus.json',
  'nodes/faction-aeldari.json',
  'nodes/faction-aoi.json',
  'nodes/faction-astra-militarum.json',
  'nodes/faction-black-templars.json',
  'nodes/faction-blood-angels.json',
  'nodes/faction-chaos-daemons.json',
  'nodes/faction-chaos-knights.json',
  'nodes/faction-chaos-space-marines.json',
  'nodes/faction-dark-angels.json',
  'nodes/faction-death-guard.json',
  'nodes/faction-deathwatch.json',
  'nodes/faction-dru.json',
  'nodes/faction-drukhari.json',
  'nodes/faction-emperor-s-children.json',
  'nodes/faction-emperors-children.json',
  'nodes/faction-gc.json',
  'nodes/faction-genestealer-cults.json',
  'nodes/faction-grey-knights.json',
  'nodes/faction-imperial-agents.json',
  'nodes/faction-imperial-knights.json',
  'nodes/faction-leagues-of-votann.json',
  'nodes/faction-necrons.json',
  'nodes/faction-orks.json',
  'nodes/faction-qi.json',
  'nodes/faction-qt.json',
  'nodes/faction-space-marines.json',
  'nodes/faction-space-wolves.json',
  'nodes/faction-t-au-empire.json',
  'nodes/faction-tau-empire.json',
  'nodes/faction-thousand-sons.json',
  'nodes/faction-tl.json',
  'nodes/faction-tyranids.json',
  'nodes/faction-un.json',
  'nodes/faction-unknown.json',
  'nodes/faction-world-eaters.json',
]

const BASE = 'https://tabletop-tools.net/brain/api/index-vectors'

let totalIndexed = 0
let totalErrors = 0
let i = 0
for (const file of FILES) {
  i++
  process.stdout.write(`[${i}/${FILES.length}] ${file}... `)
  try {
    const url = `${BASE}?file=${encodeURIComponent(file)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SYNC_SECRET}` },
      signal: AbortSignal.timeout(300000),
    })
    if (!res.ok) {
      console.log(`✗ HTTP ${res.status}`)
      totalErrors++
      continue
    }
    const j = await res.json()
    console.log(`indexed=${j.indexed} errors=${j.errors}`)
    totalIndexed += j.indexed
    totalErrors += j.errors
  } catch (err) {
    console.log(`✗ ${err.message.slice(0, 100)}`)
    totalErrors++
  }
}
console.log(`\n=== TOTAL: ${totalIndexed} vectors indexed, ${totalErrors} errors ===`)
