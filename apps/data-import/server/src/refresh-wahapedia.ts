/**
 * Refresh Wahapedia data — fetch latest CSVs and save as JSON.
 * Run: cd apps/data-import/server && npx tsx src/refresh-wahapedia.ts
 *
 * @see docs/etl-scripts.md — ETL diagram and function reference
 * @see docs/etl-data-pipelines.md — data-import pipeline details
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { fetchAndProcessWahapedia } from './lib/sources/wahapedia'

const OUTPUT_DIR = '../client/public/wahapedia'

async function main() {
  console.log('Fetching latest Wahapedia data...\n')

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  const result = await fetchAndProcessWahapedia() // no previousLastUpdate = force fetch

  if (result.skipped) {
    console.log('Data unchanged (skipped)')
    return
  }

  console.log(`Last update: ${result.lastUpdate}`)
  console.log(`Files: ${Object.keys(result.data).length}\n`)

  for (const [name, rows] of Object.entries(result.data)) {
    const filename = `${name}.json`
    const json = JSON.stringify(rows)
    writeFileSync(join(OUTPUT_DIR, filename), json)
    console.log(
      `  ${filename}: ${(rows as unknown[]).length} records (${(json.length / 1024).toFixed(0)} KB)`,
    )
  }

  console.log('\nDone!')
}

main().catch(console.error)
