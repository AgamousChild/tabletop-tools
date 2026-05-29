/**
 * Manual validation tool for the canonical content-id scheme (Phase 1.1).
 * Fetches the live Wahapedia import and reports the real reference-resolution
 * rate — the gate for "every content entity resolves to one stable id."
 *
 * Run: pnpm exec tsx scripts/validate-canonical-ids.mts
 */
import { rekeyAllWahapediaFiles, validateContentIds } from '../src/lib/id-mapping'
import { fetchAndProcessWahapedia } from '../src/lib/sources/wahapedia'

const res = await fetchAndProcessWahapedia()
const data = res.data
const count = (f: string) => data[f]?.length ?? 0

console.log('Wahapedia last_update:', res.lastUpdate)
console.log('\nentity / reference counts:')
for (const f of [
  'datasheets',
  'abilities',
  'stratagems',
  'enhancements',
  'detachment_abilities',
  'unit_abilities',
  'datasheet_stratagems',
  'datasheet_enhancements',
  'datasheet_detachment_abilities',
]) {
  console.log(`  ${f.padEnd(32)} ${count(f)}`)
}

const before = validateContentIds(data)
console.log('\nreference resolution (raw import):')
console.log(`  matched=${before.matched} unmatched=${before.unmatched}`)
for (const [type, c] of Object.entries(before.byType)) {
  const total = c.matched + c.unmatched
  const pct = total ? ((c.matched / total) * 100).toFixed(2) : '—'
  console.log(`  ${type.padEnd(20)} ${c.matched}/${total} (${pct}%)`)
}

const rekeyed = rekeyAllWahapediaFiles(data, new Map(), new Map())
const after = validateContentIds(rekeyed)
console.log('\nafter canonical-id pass (additive): matched=' + after.matched, 'unmatched=' + after.unmatched)
const ab = rekeyed['abilities']?.[0] as Record<string, unknown> | undefined
const st = rekeyed['stratagems']?.[0] as Record<string, unknown> | undefined
console.log('  sample ability  id/canonicalId/wahapediaId:', ab?.['id'], ab?.['canonicalId'], ab?.['wahapediaId'])
console.log('  sample stratagem id/canonicalId/wahapediaId:', st?.['id'], st?.['canonicalId'], st?.['wahapediaId'])
