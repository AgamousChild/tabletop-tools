import { resolve } from 'node:path'
import { scrapePdfLinks } from './scraper'
import { downloadPdf } from './downloader'
import { safeFileName } from './downloader'
import { parsePdfToMarkdown, generateIndex } from './parser'
import { loadMetadata, saveMetadata, needsUpdate, updatePdfEntry } from './metadata'
import type { PdfMetadata } from './types'

const ROOT_DIR = resolve(process.cwd(), '.local', 'gw')
const PDF_DIR = resolve(ROOT_DIR, 'pdfs')
const MD_DIR = resolve(ROOT_DIR, 'markdown')
const META_PATH = resolve(ROOT_DIR, 'metadata.json')

async function main() {
  console.log('GW Downloads Sync')
  console.log('==================')
  console.log()

  // 1. Scrape PDF links from the GW downloads page
  console.log('Scraping GW downloads page...')
  const entries = await scrapePdfLinks()
  console.log(`  Found ${entries.length} PDFs`)
  console.log()

  if (entries.length === 0) {
    console.log('No PDFs found. The page structure may have changed.')
    console.log('Check the selectors in src/types.ts.')
    return
  }

  // 2. Load existing metadata
  let metadata = loadMetadata(META_PATH)

  // 3. Download and parse each PDF
  let downloaded = 0
  let skipped = 0
  let parsed = 0

  const indexEntries: { title: string; mdFileName: string; category: string }[] = []

  for (const entry of entries) {
    const existingHash = metadata.pdfs[entry.url]?.sha256
    const mdFileName = `${safeFileName(entry.title)}.md`

    console.log(`  Processing: ${entry.title}`)

    try {
      // Download
      const result = await downloadPdf(entry, PDF_DIR, existingHash)

      if (!result.changed && !needsUpdate(metadata, entry.url, result.sha256)) {
        console.log(`    Skipped (unchanged)`)
        skipped++
        indexEntries.push({ title: entry.title, mdFileName, category: entry.category })
        continue
      }

      downloaded++

      // Parse PDF to markdown
      console.log(`    Parsing PDF to markdown...`)
      const parseResult = await parsePdfToMarkdown(
        result.filePath,
        entry.title,
        MD_DIR,
        mdFileName,
      )
      parsed++
      console.log(`    Generated ${(parseResult.charCount / 1024).toFixed(1)} KB markdown`)

      // Update metadata
      const pdfMeta: PdfMetadata = {
        title: entry.title,
        url: entry.url,
        category: entry.category,
        sha256: result.sha256,
        downloadedAt: new Date().toISOString(),
        markdownFile: mdFileName,
      }
      metadata = updatePdfEntry(metadata, entry.url, pdfMeta)

      indexEntries.push({ title: entry.title, mdFileName, category: entry.category })
    } catch (err) {
      console.error(`    Error: ${err instanceof Error ? err.message : err}`)
    }
  }

  // 4. Generate index
  console.log()
  console.log('Generating INDEX.md...')
  generateIndex(MD_DIR, indexEntries)

  // 5. Save metadata
  metadata.lastScrapedAt = new Date().toISOString()
  saveMetadata(META_PATH, metadata)

  // Summary
  console.log()
  console.log('Sync complete!')
  console.log(`  Downloaded: ${downloaded}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Parsed to markdown: ${parsed}`)
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
