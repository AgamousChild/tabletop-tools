/**
 * Extract text positions from PDF files using pdfjs-dist.
 * Maps node content to bounding regions on specific PDF pages.
 *
 * Each node gets: { pdfName, page, topPct, heightPct }
 * - pdfName: filename without extension (e.g., "core-rules")
 * - page: 1-based page number
 * - topPct: percentage from top of page where the text region starts (0-100)
 * - heightPct: percentage of page height the text region covers (0-100)
 */
import { join } from 'path'
import type { Node } from './model'

// pdfjs-dist types
interface TextItem {
  str: string
  transform: number[] // [scaleX, skewX, skewY, scaleY, x, y]
  width: number
  height: number
}

interface TextContent {
  items: Array<TextItem | { type: string }>
}

export interface TextRegion {
  pdfName: string
  page: number
  topPct: number
  heightPct: number
  leftPct: number
  widthPct: number
}

interface PageTextBlock {
  text: string
  x: number       // horizontal position from left (in PDF points)
  y: number       // vertical position from top (in PDF points)
  width: number    // width of text block
  height: number   // height of text block
}

/**
 * Extract text + positions from every page of a PDF.
 * Returns a map of page number → array of text blocks with positions.
 */
export async function extractPdfText(
  pdfPath: string,
): Promise<Map<number, PageTextBlock[]>> {
  // Dynamic import to avoid issues with ESM/CJS
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const doc = await pdfjsLib.getDocument(pdfPath).promise
  const pageMap = new Map<number, PageTextBlock[]>()

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.0 })
    const pageHeight = viewport.height
    const textContent: TextContent = await page.getTextContent()

    const blocks: PageTextBlock[] = []
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const x = item.transform[4]!
        const yFromBottom = item.transform[5]!
        const yFromTop = pageHeight - yFromBottom
        blocks.push({
          text: item.str.trim(),
          x,
          y: yFromTop,
          width: item.width || 100,
          height: Math.abs(item.transform[3]!) || 12,
        })
      }
    }

    // Keep pdfjs natural order (follows reading order across columns)
    // Do NOT sort by y — that breaks multi-column layouts
    pageMap.set(pageNum, blocks)
  }

  await doc.destroy()
  return pageMap
}

/**
 * Normalize text for fuzzy matching — lowercase, collapse whitespace,
 * strip markdown formatting and special characters.
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*([^*]+)\*\*/g, '$1') // strip bold
    .replace(/[^a-z0-9\s]/g, ' ')      // strip non-alphanumeric
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Find the best matching page region for a node's content in the PDF text.
 * Builds full page text and uses substring matching with the node's content.
 */
function findContentRegion(
  nodeText: string,
  pageMap: Map<number, PageTextBlock[]>,
  pageHeight: number,
  pageWidth: number,
): { page: number; topPct: number; heightPct: number; leftPct: number; widthPct: number } | null {
  const normalizedNode = normalizeForMatch(nodeText)
  if (normalizedNode.length < 15) return null

  // Use a distinctive substring from the start of the content
  // Skip very common openings, try to find something unique
  const searchText = normalizedNode.substring(0, 150)

  let bestMatch: { page: number; matchPos: number; score: number } | null = null

  for (const [pageNum, blocks] of pageMap) {
    if (blocks.length === 0) continue

    // Build full page text for matching — join raw text then normalize once
    const fullPageText = normalizeForMatch(blocks.map(b => b.text).join(' '))

    const pos = fullPageText.indexOf(searchText)
    if (pos !== -1) {
      // First match wins (Map iterates in insertion order = page order)
      if (!bestMatch) {
        bestMatch = { page: pageNum, matchPos: pos, score: searchText.length }
      }
    }
  }

  if (!bestMatch) {
    // Try with shorter text (first 60 chars)
    const shortSearch = normalizedNode.substring(0, 60)
    if (shortSearch.length < 15) return null

    for (const [pageNum, blocks] of pageMap) {
      const fullPageText = normalizeForMatch(blocks.map(b => b.text).join(' '))
      const pos = fullPageText.indexOf(shortSearch)
      if (pos !== -1) {
        if (!bestMatch || pageNum < bestMatch.page) {
          bestMatch = { page: pageNum, matchPos: pos, score: shortSearch.length }
        }
      }
    }
  }

  if (!bestMatch) return null

  // Find the position of the matched text on the page
  const blocks = pageMap.get(bestMatch.page)!
  let topY = blocks[0]?.y ?? 0
  let bottomY = topY
  let leftX = pageWidth
  let rightX = 0

  // Walk through blocks to find where our match starts and ends
  const pageTextNorm = blocks.map(b => normalizeForMatch(b.text))
  let runningLen = 0
  let foundStart = false

  for (let i = 0; i < blocks.length; i++) {
    const blockLen = pageTextNorm[i]!.length + 1 // +1 for join space

    if (!foundStart && runningLen + blockLen > bestMatch.matchPos) {
      topY = blocks[i]!.y
      foundStart = true
    }

    if (foundStart) {
      bottomY = blocks[i]!.y + blocks[i]!.height
      leftX = Math.min(leftX, blocks[i]!.x)
      rightX = Math.max(rightX, blocks[i]!.x + blocks[i]!.width)
      // Check if we've covered enough of the node content
      if (runningLen > bestMatch.matchPos + normalizedNode.length) break
    }

    runningLen += blockLen
  }

  // Add padding
  const padY = pageHeight * 0.01
  const padX = pageWidth * 0.01
  const topPct = Math.max(0, ((topY - padY) / pageHeight) * 100)
  const heightPct = Math.min(100 - topPct, ((bottomY - topY + padY * 2) / pageHeight) * 100)
  const leftPct = Math.max(0, ((leftX - padX) / pageWidth) * 100)
  const widthPct = Math.min(100 - leftPct, ((rightX - leftX + padX * 2) / pageWidth) * 100)

  return { page: bestMatch.page, topPct, heightPct, leftPct, widthPct }
}

/**
 * Map nodes to their positions in PDF files.
 * Modifies nodes in-place, adding position data to their sources.
 *
 * @param nodes - All brain nodes to process
 * @param pdfDir - Directory containing the PDF files
 */
export async function mapNodesToPages(
  nodes: Node[],
  pdfDir: string,
): Promise<{ mapped: number; unmapped: number; pdfErrors: string[] }> {
  const { existsSync } = await import('fs')
  let mapped = 0
  let unmapped = 0
  const pdfErrors: string[] = []

  // Group nodes by their source PDF
  const nodesByPdf = new Map<string, Node[]>()
  for (const node of nodes) {
    for (const src of node.sources) {
      if (src.type === 'pdf') {
        // Convert "Faction Pack: Adepta Sororitas" → "faction-pack-adepta-sororitas"
        const pdfName = src.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        if (!nodesByPdf.has(pdfName)) nodesByPdf.set(pdfName, [])
        nodesByPdf.get(pdfName)!.push(node)
      }
    }
  }

  for (const [pdfName, pdfNodes] of nodesByPdf) {
    const pdfPath = join(pdfDir, `${pdfName}.pdf`)
    if (!existsSync(pdfPath)) {
      pdfErrors.push(`PDF not found: ${pdfPath}`)
      unmapped += pdfNodes.length
      continue
    }

    console.log(`  Extracting positions from ${pdfName}.pdf (${pdfNodes.length} nodes)...`)

    let pageMap: Map<number, PageTextBlock[]>
    try {
      pageMap = await extractPdfText(pdfPath)
    } catch (err) {
      pdfErrors.push(`Failed to read ${pdfName}.pdf: ${err instanceof Error ? err.message : String(err)}`)
      unmapped += pdfNodes.length
      continue
    }

    // Get page dimensions from first page for percentage calculations
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjsLib.getDocument(pdfPath).promise
    const firstPage = await doc.getPage(1)
    const viewport = firstPage.getViewport({ scale: 1.0 })
    const pageHeight = viewport.height
    const pageWidth = viewport.width
    await doc.destroy()

    for (const node of pdfNodes) {
      const contentToMatch = node.content || node.summary || node.title
      const region = findContentRegion(contentToMatch, pageMap, pageHeight, pageWidth)

      if (region) {
        // Update the source with position data
        // Clone the source object to avoid shared references across nodes
        for (let i = 0; i < node.sources.length; i++) {
          const src = node.sources[i]!
          if (src.type === 'pdf' && src.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === pdfName) {
            node.sources[i] = { ...src, page: region.page, topPct: region.topPct, heightPct: region.heightPct, leftPct: region.leftPct, widthPct: region.widthPct }
          }
        }
        mapped++
      } else {
        unmapped++
      }
    }

    console.log(`    ${pdfNodes.filter(n => n.sources.some(s => s.page)).length}/${pdfNodes.length} mapped`)
  }

  return { mapped, unmapped, pdfErrors }
}
