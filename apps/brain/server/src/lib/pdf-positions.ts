/**
 * Map brain nodes to their exact positions in source PDFs.
 *
 * Reads .positions.json sidecar files produced by gw-sync alongside each .md file.
 * Each sidecar contains per-block { text, level, page, xPt, yPt, widthPt, heightPt,
 * pageWidthPt, pageHeightPt } — exact coordinates from PDF text extraction.
 *
 * For each node, finds the matching heading block and calculates the region from
 * that heading to the next heading of same or higher level (the full rule section).
 */
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import type { Node } from './model'

/** Block position from gw-sync sidecar. */
interface BlockPosition {
  text: string
  level: string
  page: number
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
  pageWidthPt: number
  pageHeightPt: number
}

/** Normalize text for matching — lowercase, collapse whitespace. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Find the region for a node's content in the sidecar positions.
 *
 * Strategy:
 * 1. Find a heading block matching the node's title
 * 2. The region starts at that heading
 * 3. The region ends at the next heading of same or higher level, or end of page
 * 4. Track the x-bounds of all body blocks in the region to get column width
 */
function findRegion(
  nodeTitle: string,
  nodeContent: string,
  positions: BlockPosition[],
): { page: number; topPct: number; heightPct: number; leftPct: number; widthPct: number } | null {
  const titleNorm = normalize(nodeTitle)
  const contentNorm = normalize(nodeContent)

  // Heading levels in order of precedence
  const headingLevels = ['h1', 'h2', 'h3', 'h4']

  // Strategy 1: Find a heading block that matches the node title
  let startIdx = -1
  for (let i = 0; i < positions.length; i++) {
    const b = positions[i]!
    if (!headingLevels.includes(b.level)) continue
    if (normalize(b.text) === titleNorm) {
      startIdx = i
      break
    }
  }

  // Strategy 2: If no heading match, find body text matching the start of the content
  if (startIdx === -1 && contentNorm.length >= 20) {
    const searchSnippet = contentNorm.substring(0, 80)
    for (let i = 0; i < positions.length; i++) {
      const b = positions[i]!
      if (normalize(b.text).includes(searchSnippet.substring(0, 40))) {
        // Walk backwards to find the nearest heading
        for (let j = i; j >= 0; j--) {
          if (headingLevels.includes(positions[j]!.level)) {
            startIdx = j
            break
          }
        }
        if (startIdx >= 0) break
        // No heading found — use this body block directly
        startIdx = i
        break
      }
    }
  }

  if (startIdx === -1) return null

  const startBlock = positions[startIdx]!
  const startLevel = headingLevels.indexOf(startBlock.level)
  const startPage = startBlock.page

  // Find the end of this section — next heading of same or higher level
  let endIdx = startIdx + 1
  while (endIdx < positions.length) {
    const b = positions[endIdx]!
    // Stop at a heading of same or higher level (lower index = higher level)
    if (headingLevels.includes(b.level)) {
      const bLevel = headingLevels.indexOf(b.level)
      if (bLevel <= startLevel && endIdx > startIdx + 1) break
    }
    // Stop if we've gone more than 2 pages past the start
    if (b.page > startPage + 1) break
    endIdx++
  }
  endIdx-- // back up to the last included block

  // Calculate bounding box from all blocks in the range
  const pageW = startBlock.pageWidthPt
  const pageH = startBlock.pageHeightPt
  let minX = pageW
  let maxX = 0
  let minY = pageH
  let maxY = 0

  for (let i = startIdx; i <= endIdx; i++) {
    const b = positions[i]!
    if (b.page !== startPage) continue // only use blocks on the start page
    minX = Math.min(minX, b.xPt)
    minY = Math.min(minY, b.yPt)
    maxX = Math.max(maxX, b.xPt + b.widthPt)
    maxY = Math.max(maxY, b.yPt + b.heightPt)
  }

  if (minY >= maxY) return null

  // Convert to percentages with padding
  const padX = pageW * 0.01
  const padY = pageH * 0.01
  const topPct = Math.max(0, ((minY - padY) / pageH) * 100)
  const heightPct = Math.min(100 - topPct, ((maxY - minY + padY * 2) / pageH) * 100)
  const leftPct = Math.max(0, ((minX - padX) / pageW) * 100)
  const widthPct = Math.min(100 - leftPct, ((maxX - minX + padX * 2) / pageW) * 100)

  return { page: startPage, topPct, heightPct, leftPct, widthPct }
}

/**
 * Map nodes to their positions using gw-sync .positions.json sidecar files.
 * Modifies nodes in-place, adding position data to their sources.
 */
export async function mapNodesToPages(
  nodes: Node[],
  positionsDir: string,
): Promise<{ mapped: number; unmapped: number; errors: string[] }> {
  let mapped = 0
  let unmapped = 0
  const errors: string[] = []

  // Group nodes by their source PDF
  const nodesByPdf = new Map<string, Node[]>()
  for (const node of nodes) {
    for (const src of node.sources) {
      if (src.type === 'pdf') {
        const pdfName = src.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        if (!nodesByPdf.has(pdfName)) nodesByPdf.set(pdfName, [])
        nodesByPdf.get(pdfName)!.push(node)
      }
    }
  }

  for (const [pdfName, pdfNodes] of nodesByPdf) {
    const sidecarPath = join(positionsDir, `${pdfName}.positions.json`)
    if (!existsSync(sidecarPath)) {
      errors.push(`Sidecar not found: ${sidecarPath}`)
      unmapped += pdfNodes.length
      continue
    }

    const positions: BlockPosition[] = JSON.parse(readFileSync(sidecarPath, 'utf-8'))
    console.log(`  ${pdfName}: ${positions.length} blocks, ${pdfNodes.length} nodes`)

    for (const node of pdfNodes) {
      const region = findRegion(node.title, node.content, positions)

      if (region) {
        // Clone source to avoid shared reference across nodes
        for (let i = 0; i < node.sources.length; i++) {
          const src = node.sources[i]!
          if (src.type === 'pdf' && src.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === pdfName) {
            node.sources[i] = {
              ...src,
              page: region.page,
              topPct: region.topPct,
              heightPct: region.heightPct,
              leftPct: region.leftPct,
              widthPct: region.widthPct,
            }
          }
        }
        mapped++
      } else {
        unmapped++
      }
    }
  }

  return { mapped, unmapped, errors }
}
