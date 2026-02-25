import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CSV_FILES, WAHAPEDIA_BASE_URL } from './types'
import type { CsvFileName, LastUpdate } from './types'
import { parsePipeCsv } from './csv-parser'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const EXCEL_URL = 'https://wahapedia.ru/wh40k10ed/Export%20Data%20Specs.xlsx'

export interface FetchResult {
  fileName: CsvFileName
  content: string
  rowCount: number
}

/**
 * Fetch a single CSV from Wahapedia.
 */
export async function fetchCsv(
  fileName: CsvFileName,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const url = `${WAHAPEDIA_BASE_URL}/${fileName}.csv`
  const response = await fetchFn(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

/**
 * Fetch the Last_update CSV and extract the update timestamp.
 */
export async function fetchLastUpdate(
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const content = await fetchCsv('Last_update', fetchFn)
  const rows = parsePipeCsv<LastUpdate>(content)
  if (rows.length === 0 || !rows[0].last_update) {
    throw new Error('Last_update.csv is empty or malformed')
  }
  return rows[0].last_update
}

/**
 * Download all CSV files to disk.
 */
export async function downloadAllCsvs(
  outputDir: string,
  fetchFn: typeof fetch = fetch,
): Promise<FetchResult[]> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const results: FetchResult[] = []

  for (const fileName of CSV_FILES) {
    const content = await fetchCsv(fileName, fetchFn)
    const filePath = join(outputDir, `${fileName}.csv`)
    writeFileSync(filePath, content, 'utf-8')

    const rows = parsePipeCsv(content)
    results.push({ fileName, content, rowCount: rows.length })
    console.log(`  Downloaded ${fileName}.csv (${rows.length} rows)`)
  }

  return results
}

/**
 * Download the Excel spec file.
 */
export async function downloadExcelSpec(
  outputDir: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const response = await fetchFn(EXCEL_URL, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    console.warn(`  Warning: Could not download Excel spec: ${response.status}`)
    return
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(join(outputDir, 'Export Data Specs.xlsx'), buffer)
  console.log('  Downloaded Export Data Specs.xlsx')
}
