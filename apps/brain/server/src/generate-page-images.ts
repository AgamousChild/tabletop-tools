/**
 * Convert GW PDF files to PNG page images for serving as core rules references.
 *
 * Usage:
 *   cd apps/brain/server
 *   npx tsx src/generate-page-images.ts
 *
 * Reads all PDFs from the gw-sync local directory and converts each page to a
 * PNG at 3x scale (~300 DPI equivalent). Saves to .local/brain/pages/<pdf-name>/page-<N>.png
 *
 * After generating, upload to R2:
 *   npx tsx src/generate-page-images.ts --upload
 */

import { pdf } from 'pdf-to-img'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join, basename } from 'path'
import { execSync } from 'child_process'

const PDF_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/pdfs'
const OUTPUT_DIR = '.local/brain/pages'
const BUCKET = 'tabletop-tools-brain'
const SCALE = 3 // ~300 DPI (PDFs are typically 96-100 DPI base)

async function generateImages() {
  if (!existsSync(PDF_DIR)) {
    console.error(`PDF directory not found: ${PDF_DIR}`)
    process.exit(1)
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const allFiles = await fs.readdir(PDF_DIR)
  const pdfFiles = allFiles.filter(f => f.endsWith('.pdf'))

  if (pdfFiles.length === 0) {
    console.log('No PDF files found.')
    return
  }

  console.log(`Found ${pdfFiles.length} PDF files\n`)

  let totalPages = 0
  let totalSkipped = 0
  let errors = 0

  for (const pdfFile of pdfFiles) {
    const pdfName = basename(pdfFile, '.pdf')
    const pdfPath = join(PDF_DIR, pdfFile)
    const outDir = join(OUTPUT_DIR, pdfName)

    await fs.mkdir(outDir, { recursive: true })

    console.log(`Processing: ${pdfFile}`)

    let doc
    try {
      doc = await pdf(pdfPath, { scale: SCALE })
    } catch (err) {
      console.error(`  ✗ Failed to open: ${err instanceof Error ? err.message : err}`)
      errors++
      continue
    }

    let pageNum = 1
    for await (const pageImage of doc) {
      const outPath = join(outDir, `page-${pageNum}.png`)

      // Skip if already exists (allow resuming interrupted runs)
      if (existsSync(outPath)) {
        totalSkipped++
        pageNum++
        continue
      }

      try {
        await fs.writeFile(outPath, pageImage)
        totalPages++
        process.stdout.write(`  page ${pageNum}/${doc.length}\r`)
      } catch (err) {
        console.error(`  ✗ page ${pageNum}: ${err instanceof Error ? err.message : err}`)
        errors++
      }

      pageNum++
    }

    console.log(`  ✓ ${doc.length} pages → ${outDir}`)
  }

  console.log(`\nDone: ${totalPages} pages written, ${totalSkipped} skipped (already exist), ${errors} errors`)
}

async function uploadToR2() {
  if (!existsSync(OUTPUT_DIR)) {
    console.error(`No generated pages found at ${OUTPUT_DIR}. Run without --upload first.`)
    process.exit(1)
  }

  console.log('\nUploading page images to R2...\n')

  const pdfDirs = await fs.readdir(OUTPUT_DIR)
  let uploaded = 0
  let failed = 0

  for (const pdfName of pdfDirs) {
    const dirPath = join(OUTPUT_DIR, pdfName)
    const stat = await fs.stat(dirPath)
    if (!stat.isDirectory()) continue

    const pageFiles = (await fs.readdir(dirPath)).filter(f => f.endsWith('.png'))
    console.log(`Uploading ${pageFiles.length} pages for ${pdfName}...`)

    for (const pageFile of pageFiles) {
      const localPath = join(dirPath, pageFile)
      const r2Key = `pages/${pdfName}/${pageFile}`

      try {
        execSync(
          `npx wrangler r2 object put "${BUCKET}/${r2Key}" --file "${localPath}" --content-type "image/png"`,
          { stdio: 'pipe' },
        )
        uploaded++
        process.stdout.write(`  ✓ ${r2Key}\r`)
      } catch (err) {
        failed++
        console.error(`  ✗ ${r2Key}: ${err instanceof Error ? err.message : err}`)
      }
    }

    console.log(`  ✓ ${pdfName}: ${pageFiles.length} pages uploaded`)
  }

  console.log(`\nR2 upload: ${uploaded} succeeded, ${failed} failed`)
}

async function main() {
  const shouldUpload = process.argv.includes('--upload')
  const uploadOnly = process.argv.includes('--upload-only')

  if (!uploadOnly) {
    await generateImages()
  }

  if (shouldUpload || uploadOnly) {
    await uploadToR2()
  } else {
    console.log('\nTo upload to R2, run with --upload flag:')
    console.log('  npx tsx src/generate-page-images.ts --upload')
    console.log('\nOr to upload only (skip generation):')
    console.log('  npx tsx src/generate-page-images.ts --upload-only')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
