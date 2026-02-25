import { resolve } from 'node:path'
import { parsePipeCsv } from './csv-parser'
import { loadMetadata, saveMetadata, hasChanged } from './metadata'
import { fetchLastUpdate, downloadAllCsvs, downloadExcelSpec } from './fetcher'
import { createTables, importData } from './db'
import { generateAllMarkdown } from './markdown'
import type { ParsedData } from './types'

const ROOT_DIR = resolve(process.cwd(), '.local', 'wahapedia')
const CSV_DIR = resolve(ROOT_DIR, 'csv')
const MD_DIR = resolve(ROOT_DIR, 'markdown')
const DB_PATH = resolve(ROOT_DIR, 'data.db')
const META_PATH = resolve(ROOT_DIR, 'metadata.json')

async function main() {
  console.log('Wahapedia Sync')
  console.log('==============')
  console.log()

  // 1. Check for updates
  console.log('Checking for updates...')
  const metadata = loadMetadata(META_PATH)
  const remoteLastUpdate = await fetchLastUpdate()
  console.log(`  Remote last_update: ${remoteLastUpdate}`)
  console.log(`  Stored last_update: ${metadata.lastUpdate ?? '(none)'}`)

  if (!hasChanged(metadata, remoteLastUpdate)) {
    console.log()
    console.log('No changes detected. Skipping sync.')
    return
  }

  console.log('  Changes detected — syncing...')
  console.log()

  // 2. Download all CSVs
  console.log('Downloading CSVs...')
  const results = await downloadAllCsvs(CSV_DIR)
  console.log()

  // 3. Download Excel spec (non-critical)
  console.log('Downloading Excel spec...')
  await downloadExcelSpec(CSV_DIR)
  console.log()

  // 4. Parse CSVs into typed data
  console.log('Parsing CSV data...')
  const data: ParsedData = {
    factions: [],
    datasheets: [],
    datasheetModels: [],
    datasheetAbilities: [],
    datasheetUnitComposition: [],
    datasheetWargear: [],
    abilities: [],
    stratagems: [],
    detachmentAbilities: [],
    enhancements: [],
    wargearList: [],
    sources: [],
  }

  for (const result of results) {
    const rows = parsePipeCsv(result.content)
    switch (result.fileName) {
      case 'Factions': data.factions = rows as any; break
      case 'Datasheets': data.datasheets = rows as any; break
      case 'Datasheets_models': data.datasheetModels = rows as any; break
      case 'Datasheets_abilities': data.datasheetAbilities = rows as any; break
      case 'Datasheets_unit_composition': data.datasheetUnitComposition = rows as any; break
      case 'Datasheets_wargear': data.datasheetWargear = rows as any; break
      case 'Abilities': data.abilities = rows as any; break
      case 'Stratagems': data.stratagems = rows as any; break
      case 'Detachment_abilities': data.detachmentAbilities = rows as any; break
      case 'Enhancements': data.enhancements = rows as any; break
      case 'Wargear_list': data.wargearList = rows as any; break
      case 'Source': data.sources = rows as any; break
    }
  }
  console.log('  Parsed all CSV files')
  console.log()

  // 5. Import into SQLite
  console.log('Importing into SQLite...')
  createTables(DB_PATH)
  importData(DB_PATH, data)
  console.log(`  Database: ${DB_PATH}`)
  console.log()

  // 6. Generate markdown
  console.log('Generating markdown...')
  const mdResult = generateAllMarkdown(DB_PATH, MD_DIR)
  console.log(`  Generated ${mdResult.fileCount} files for ${mdResult.factionCount} factions`)
  console.log()

  // 7. Save metadata
  const csvFiles: Record<string, { downloadedAt: string; rowCount: number }> = {}
  for (const r of results) {
    csvFiles[r.fileName] = { downloadedAt: new Date().toISOString(), rowCount: r.rowCount }
  }
  saveMetadata(META_PATH, {
    lastUpdate: remoteLastUpdate,
    lastSyncedAt: new Date().toISOString(),
    csvFiles,
  })
  console.log('Sync complete!')
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
