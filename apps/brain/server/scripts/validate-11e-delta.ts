/**
 * CLI: run the 11e validation delta pass across every faction-pack-*.md and
 * the brain's local R2 cache. Writes:
 *
 *   - apps/brain/server/.local/brain-input/validation-11e-deltas.json
 *   - docs/reports/2026-06-29-11e-delta-validation.md (per-faction summary)
 *
 * Per Rule 4 the work is exposed as `runValidationDelta()` /
 * `summarizeByFaction()` in `src/lib/validation-delta.ts`. This script is
 * a thin wrapper that wires the production faction-codes loader and
 * MFM detachment lookup before delegating.
 *
 * **Prerequisites:**
 *   1. `npx tsx src/build-graph.ts` has been run at least once — this
 *      populates `.local/brain/nodes/*.json` (the destination side of the
 *      delta).
 *   2. `.local/dev.db` carries the `dim_faction` and `dim_faction_alias`
 *      tables (the data-import flow normally seeds these; without them, the
 *      script aborts with a clear error).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDb } from '@tabletop-tools/db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import { loadFactionCodes, normalizeFactionId } from '../src/lib/faction-codes'
import type { FactionPackMfmLookup } from '../src/lib/parsers/faction-pack-v2-to-nodes'
import { slugify } from '../src/lib/slugify'
import {
  runValidationDelta,
  summarizeByFaction,
  type ValidationDelta,
} from '../src/lib/validation-delta'

const PACK_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
const BRAIN_NODES_DIR = resolve(__dirname, '..', '.local', 'brain', 'nodes')
const OUT_JSON = resolve(__dirname, '..', '.local', 'brain-input', 'validation-11e-deltas.json')
const OUT_MD = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'reports',
  '2026-06-29-11e-delta-validation.md',
)
const MFM_DETACHMENTS_PATH = resolve(
  __dirname,
  '..',
  '.local',
  'brain-input',
  'mfm-detachments.json',
)

function loadMfmLookup(): FactionPackMfmLookup {
  const lookup = new Map<string, { dp?: number; forceDisposition?: string }>()
  if (!existsSync(MFM_DETACHMENTS_PATH)) return lookup
  try {
    const raw = JSON.parse(readFileSync(MFM_DETACHMENTS_PATH, 'utf-8')) as Array<{
      factionSlug?: string
      name?: string
      dp?: number | null
      objective?: string | null
    }>
    for (const row of raw) {
      if (!row?.factionSlug || !row?.name) continue
      const key = `${normalizeFactionId(row.factionSlug)}::${slugify(row.name)}`
      lookup.set(key, {
        ...(typeof row.dp === 'number' ? { dp: row.dp } : {}),
        ...(row.objective ? { forceDisposition: row.objective } : {}),
      })
    }
  } catch (err) {
    console.warn(`MFM lookup load failed, continuing without: ${(err as Error).message}`)
  }
  return lookup
}

function writeMarkdownReport(
  deltas: ValidationDelta[],
  outPath: string,
  brainNodesDir: string,
): void {
  const summary = summarizeByFaction(deltas)
  const total = deltas.length
  const changed = deltas.filter((d) => d.deltaFields.length > 0).length

  const lines: string[] = []
  lines.push('# 11e → 10e Delta Validation (2026-06-29)')
  lines.push('')
  lines.push('Parser-driven audit: every `faction-pack-*.md` is re-parsed as')
  lines.push('11th-edition; each emitted node is matched against the brain R2')
  lines.push('cache for a 10e node with the same `(factionId, category,')
  lines.push('slugify(title))`. The `deltaFields` list reports which structured')
  lines.push('fields differ between editions.')
  lines.push('')
  lines.push(`- Source pack dir: \`${PACK_DIR}\``)
  lines.push(`- Brain nodes dir: \`${brainNodesDir}\``)
  lines.push(`- Matched pairs (10e ↔ 11e): **${total}**`)
  lines.push(`- Pairs with at least one field delta: **${changed}**`)
  lines.push('')
  lines.push('## Per-faction summary')
  lines.push('')
  lines.push('| factionId | matched | with delta |')
  lines.push('|---|---|---|')
  for (const row of summary) {
    lines.push(`| \`${row.factionId}\` | ${row.totalMatched} | ${row.changedNodes} |`)
  }
  lines.push('')
  lines.push('## Method')
  lines.push('')
  lines.push('The parser runs with `edition="11th"` forced — independent of the')
  lines.push('URL-prefix heuristic in `detectFactionPackEdition`. This makes')
  lines.push('the report a forward-looking view ("if every faction pack')
  lines.push('shipped as 11e tomorrow, here are the deltas").')
  lines.push('')
  lines.push('Use `pnpm tsx scripts/validate-11e-delta.ts` from')
  lines.push('`apps/brain/server` to regenerate. Requires the brain R2 cache to')
  lines.push('exist locally — run `npx tsx src/build-graph.ts` first if not.')

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, lines.join('\n') + '\n')
}

async function main(): Promise<void> {
  // Production faction-codes loader needs a Db connection.
  const db = createDb({
    url: process.env.TURSO_DB_URL ?? 'file:.local/dev.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  await loadFactionCodes(db)

  const mfmLookup = loadMfmLookup()

  mkdirSync(dirname(OUT_JSON), { recursive: true })

  const deltas = runValidationDelta({
    packDir: PACK_DIR,
    brainNodesDir: BRAIN_NODES_DIR,
    mfmLookup,
    outputPath: OUT_JSON,
  })

  writeMarkdownReport(deltas, OUT_MD, BRAIN_NODES_DIR)

  const summary = summarizeByFaction(deltas)
  console.log(`Wrote ${deltas.length} deltas to ${OUT_JSON}`)
  console.log(`Wrote markdown summary to ${OUT_MD}`)
  console.log('Per-faction:')
  for (const row of summary) {
    console.log(`  ${row.factionId}: ${row.totalMatched} matched, ${row.changedNodes} with delta`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
