/**
 * Build the study app's slide data.
 *
 * Walks the source folder for .pptx files. For each one:
 *   1. Convert to PDF via LibreOffice headless (`soffice --headless --convert-to pdf`).
 *   2. Extract per-block text + bounding-box coordinates via unpdf.
 *   3. Render each page to PNG via pdf-to-img.
 *   4. Emit a `slides.json` manifest and `pages/<deck>/slide-<N>.png` images
 *      into the Vite client's `public/data/` directory so they bundle into
 *      the SPA's dist.
 *
 * Usage:
 *   cd apps/study/client
 *   pnpm slides:build
 *
 * Override the source folder with $STUDY_SRC_DIR.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { extractText, getDocumentProxy } from 'unpdf'
import { pdf } from 'pdf-to-img'

const SRC_DIR =
  process.env.STUDY_SRC_DIR || 'C:/Users/micah/OneDrive/Documents/Psy'
const PUBLIC_DIR = resolve('public', 'data')
const PAGES_DIR = join(PUBLIC_DIR, 'pages')
const SCALE = 2

function findSoffice() {
  const candidates = [
    'soffice',
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
  ]
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' })
      return c
    } catch {
      // try next
    }
  }
  return null
}

function slugifyDeck(filename) {
  return basename(filename, extname(filename))
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function deckTitle(filename) {
  return basename(filename, extname(filename))
}

async function pptxToPdf(soffice, pptxPath, outDir) {
  mkdirSync(outDir, { recursive: true })
  execFileSync(
    soffice,
    ['--headless', '--convert-to', 'pdf', '--outdir', outDir, pptxPath],
    { stdio: 'inherit' },
  )
  const pdfName = basename(pptxPath, extname(pptxPath)) + '.pdf'
  const pdfPath = join(outDir, pdfName)
  if (!existsSync(pdfPath)) {
    throw new Error(`LibreOffice did not produce ${pdfPath}`)
  }
  return pdfPath
}

/**
 * Extract text blocks per page with their bounding boxes from a PDF.
 * Returns one entry per textual element with bounding-box percentages.
 */
async function extractBlocksByPage(pdfPath) {
  const buffer = readFileSync(pdfPath)
  const doc = await getDocumentProxy(new Uint8Array(buffer))
  const numPages = doc.numPages
  const byPage = new Map()

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 1.0 })
    const pageW = viewport.width
    const pageH = viewport.height
    const content = await page.getTextContent()
    const blocks = []

    for (const item of content.items) {
      // pdf.js TextItem has transform [a, b, c, d, e, f]; x = e, y = f (baseline)
      const t = item.transform
      if (!t) continue
      const text = (item.str || '').trim()
      if (!text) continue
      const x = t[4]
      const y = t[5]
      const width = item.width || 0
      const height = item.height || (t[3] ? Math.abs(t[3]) : 12)
      // pdf.js y is baseline measured from bottom; bbox top in screen coords:
      const bboxTop = pageH - y - height
      const leftPct = Math.max(0, (x / pageW) * 100)
      const topPct = Math.max(0, (bboxTop / pageH) * 100)
      const widthPct = Math.min(100 - leftPct, (width / pageW) * 100)
      const heightPct = Math.min(100 - topPct, (height / pageH) * 100)
      blocks.push({ text, leftPct, topPct, widthPct, heightPct })
    }
    byPage.set(p, blocks)
  }
  return byPage
}

async function renderPages(pdfPath, outDir) {
  mkdirSync(outDir, { recursive: true })
  const document = await pdf(pdfPath, { scale: SCALE })
  const written = []
  let i = 0
  for await (const image of document) {
    i++
    const out = join(outDir, `slide-${i}.png`)
    writeFileSync(out, image)
    written.push(i)
  }
  return written
}

function pickTitleAndBody(blocks) {
  // Title = the first block with the largest height on the page. Body = the rest.
  if (!blocks.length) return { title: '', body: '' }
  let titleIdx = 0
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].heightPct > blocks[titleIdx].heightPct) titleIdx = i
  }
  const title = blocks[titleIdx]?.text ?? ''
  const body = blocks
    .filter((_, i) => i !== titleIdx)
    .map((b) => b.text)
    .join(' ')
  return { title, body }
}

async function main() {
  const soffice = findSoffice()
  if (!soffice) {
    console.error(
      'LibreOffice not found. Install from https://www.libreoffice.org/ then re-run.',
    )
    process.exit(1)
  }
  console.log(`Using LibreOffice: ${soffice}`)

  if (!existsSync(SRC_DIR)) {
    console.error(`Source dir not found: ${SRC_DIR}`)
    process.exit(1)
  }
  const pptxFiles = readdirSync(SRC_DIR).filter((f) =>
    f.toLowerCase().endsWith('.pptx'),
  )
  if (!pptxFiles.length) {
    console.error(`No .pptx files in ${SRC_DIR}`)
    process.exit(1)
  }
  console.log(`Found ${pptxFiles.length} pptx file(s) in ${SRC_DIR}`)

  // Clean output dirs
  if (existsSync(PUBLIC_DIR)) rmSync(PUBLIC_DIR, { recursive: true, force: true })
  mkdirSync(PUBLIC_DIR, { recursive: true })
  mkdirSync(PAGES_DIR, { recursive: true })

  const decks = []
  const tmpRoot = join(tmpdir(), 'study-build')
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })

  for (const pptxFile of pptxFiles) {
    const deckId = slugifyDeck(pptxFile)
    const tmpDir = join(tmpRoot, deckId)
    const pptxPath = join(SRC_DIR, pptxFile)
    console.log(`\n[${deckId}] converting → pdf…`)
    const pdfPath = await pptxToPdf(soffice, pptxPath, tmpDir)
    console.log(`[${deckId}] extracting positions…`)
    const blocksByPage = await extractBlocksByPage(pdfPath)
    console.log(`[${deckId}] rendering ${blocksByPage.size} pages → png…`)
    const written = await renderPages(pdfPath, join(PAGES_DIR, deckId))

    const slides = []
    for (const slideNum of written) {
      const blocks = blocksByPage.get(slideNum) || []
      const { title, body } = pickTitleAndBody(blocks)
      slides.push({
        deckId,
        slideNum,
        title,
        body,
        imageUrl: `/study/data/pages/${deckId}/slide-${slideNum}.png`,
        blocks,
      })
    }
    decks.push({ id: deckId, name: deckTitle(pptxFile), slides })
    console.log(`[${deckId}] done — ${slides.length} slides`)
  }

  const manifest = { builtAt: new Date().toISOString(), decks }
  writeFileSync(
    join(PUBLIC_DIR, 'slides.json'),
    JSON.stringify(manifest, null, 2),
  )
  console.log(
    `\nWrote ${PUBLIC_DIR}/slides.json (${decks.length} decks, ${decks.reduce((n, d) => n + d.slides.length, 0)} slides)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

// Suppress "extractText imported but unused" — keeping the export in case
// someone wants a quick all-text dump separate from the per-block extraction.
void extractText
