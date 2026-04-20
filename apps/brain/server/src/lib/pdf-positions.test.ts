import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const POSITIONS_DIR = 'C:/R/sync-data/tools/gw-sync/.local/gw/markdown'
const NODES_DIR = join(__dirname, '../../.local/brain/nodes')

const hasLocalData = existsSync(POSITIONS_DIR) && existsSync(NODES_DIR)

describe.skipIf(!hasLocalData)('PDF position accuracy', () => {
  it('all nodes with PDF sources have positions within page bounds', () => {
    const nodeFiles = readdirSync(NODES_DIR).filter(f => f.endsWith('.json'))
    let checked = 0
    const outOfBounds: string[] = []

    for (const file of nodeFiles) {
      const nodes = JSON.parse(readFileSync(join(NODES_DIR, file), 'utf8'))
      for (const node of nodes) {
        for (const src of node.sources) {
          if (src.type !== 'pdf' || src.page === undefined) continue
          checked++

          if (src.topPct !== undefined && (src.topPct < 0 || src.topPct > 100))
            outOfBounds.push(`${node.id}: topPct=${src.topPct}`)
          if (src.heightPct !== undefined && (src.heightPct < 0 || src.heightPct > 100))
            outOfBounds.push(`${node.id}: heightPct=${src.heightPct}`)
          if (src.leftPct !== undefined && (src.leftPct < 0 || src.leftPct > 100))
            outOfBounds.push(`${node.id}: leftPct=${src.leftPct}`)
          if (src.widthPct !== undefined && (src.widthPct < 0 || src.widthPct > 100))
            outOfBounds.push(`${node.id}: widthPct=${src.widthPct}`)

          // top + height should not exceed 105% (5% tolerance for padding)
          if (src.topPct !== undefined && src.heightPct !== undefined) {
            if (src.topPct + src.heightPct > 105)
              outOfBounds.push(`${node.id}: top+height=${(src.topPct + src.heightPct).toFixed(1)}%`)
          }
          // left + width should not exceed 105%
          if (src.leftPct !== undefined && src.widthPct !== undefined) {
            if (src.leftPct + src.widthPct > 105)
              outOfBounds.push(`${node.id}: left+width=${(src.leftPct + src.widthPct).toFixed(1)}%`)
          }
        }
      }
    }

    if (outOfBounds.length > 0) {
      console.warn(`Out of bounds positions (${outOfBounds.length}):`)
      outOfBounds.slice(0, 20).forEach(o => console.warn(`  ${o}`))
    }
    expect(outOfBounds).toEqual([])
    expect(checked).toBeGreaterThan(0)
  })

  it('every mapped node has a valid page number', () => {
    const nodeFiles = readdirSync(NODES_DIR).filter(f => f.endsWith('.json'))
    const invalidPages: string[] = []
    let checked = 0

    // Build max-page map from sidecars
    const maxPageByPdf = new Map<string, number>()
    const sidecarFiles = readdirSync(POSITIONS_DIR).filter(f => f.endsWith('.positions.json'))
    for (const file of sidecarFiles) {
      const positions = JSON.parse(readFileSync(join(POSITIONS_DIR, file), 'utf8'))
      const pdfName = file.replace('.positions.json', '')
      const maxPage = Math.max(...positions.map((p: { page: number }) => p.page), 0)
      maxPageByPdf.set(pdfName, maxPage)
    }

    for (const file of nodeFiles) {
      const nodes = JSON.parse(readFileSync(join(NODES_DIR, file), 'utf8'))
      for (const node of nodes) {
        for (const src of node.sources) {
          if (src.type !== 'pdf' || !src.page) continue
          checked++

          const pdfSlug = src.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          const maxPage = maxPageByPdf.get(pdfSlug)
          if (maxPage !== undefined) {
            if (src.page > maxPage || src.page < 1) {
              invalidPages.push(`${node.id}: page ${src.page} out of range [1, ${maxPage}] for ${pdfSlug}`)
            }
          }
        }
      }
    }

    if (invalidPages.length > 0) {
      console.warn(`Invalid page numbers (${invalidPages.length}):`)
      invalidPages.slice(0, 20).forEach(o => console.warn(`  ${o}`))
    }
    expect(invalidPages).toEqual([])
    expect(checked).toBeGreaterThan(0)
  })

  it('reports position coverage statistics', () => {
    const nodeFiles = readdirSync(NODES_DIR).filter(f => f.endsWith('.json'))
    let totalPdfSources = 0
    let withPositions = 0
    let withoutPositions = 0

    for (const file of nodeFiles) {
      const nodes = JSON.parse(readFileSync(join(NODES_DIR, file), 'utf8'))
      for (const node of nodes) {
        for (const src of node.sources) {
          if (src.type !== 'pdf') continue
          totalPdfSources++
          if (src.topPct !== undefined && src.heightPct !== undefined) {
            withPositions++
          } else {
            withoutPositions++
          }
        }
      }
    }

    console.log(`PDF position coverage: ${withPositions}/${totalPdfSources} sources have positions (${withoutPositions} without)`)
    // Informational — don't fail
    expect(totalPdfSources).toBeGreaterThan(0)
  })
})
