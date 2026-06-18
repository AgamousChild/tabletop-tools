/**
 * Slice a scanned multi-card sheet into one PNG per card.
 *
 * The mission-deck pages are photos of print sheets laid out as an even grid
 * of cards (e.g. 3x3 secondaries, 3x2 primaries) surrounded by a uniform
 * background margin. This:
 *   1. Detects the printed block by trimming the margin — columns/rows whose
 *      pixel variance is near zero are background and get cut.
 *   2. Divides that block into an even `cols` x `rows` grid (the cards are
 *      equal-sized, so even division aligns to them).
 *   3. Writes each cell as `r{row}c{col}.png`.
 *
 * `overlap` widens each cell so card content sitting at a cell edge (e.g. the
 * right-hand VP column on primary cards) isn't clipped: a negative value
 * expands the cell outward, a small positive value insets it. Edge bleed from
 * neighbours is tolerated — callers identify each card by its title + known
 * sheet order.
 *
 * @param {object} o
 * @param {string} o.input                path to the sheet PNG
 * @param {number} o.cols                 grid columns
 * @param {number} o.rows                 grid rows
 * @param {string} o.outDir               directory to write the per-card PNGs into
 * @param {number} [o.varThreshold=0.18]  margin-trim sensitivity (fraction of peak variance)
 * @param {number} [o.overlap=0.012]      cell inset (+) / expansion (-) as a fraction of cell size
 * @returns {Promise<{ bbox:[number,number,number,number], cell:[number,number], files:string[] }>}
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

export async function cropSheet({ input, cols, rows, outDir, varThreshold = 0.18, overlap = 0.012 }) {
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info

  const colV = axisVariance(data, W, H, 'col')
  const rowV = axisVariance(data, W, H, 'row')
  const [x0, x1] = trimMargin(colV, varThreshold)
  const [y0, y1] = trimMargin(rowV, varThreshold)

  const blockW = x1 - x0 + 1
  const blockH = y1 - y0 + 1
  const cellW = Math.floor(blockW / cols)
  const cellH = Math.floor(blockH / rows)
  const padX = Math.round(cellW * overlap)
  const padY = Math.round(cellH * overlap)

  mkdirSync(outDir, { recursive: true })
  const files = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const region = clampRegion(
        {
          left: x0 + c * cellW + padX,
          top: y0 + r * cellH + padY,
          width: cellW - 2 * padX,
          height: cellH - 2 * padY,
        },
        W,
        H,
      )
      const file = `${outDir}/r${r}c${c}.png`
      await sharp(input).extract(region).toFile(file)
      files.push(file)
    }
  }
  return { bbox: [x0, y0, blockW, blockH], cell: [cellW, cellH], files }
}

/** Per-column ('col') or per-row ('row') pixel standard deviation; low = uniform background. */
function axisVariance(data, W, H, axis) {
  const n = axis === 'col' ? W : H
  const m = axis === 'col' ? H : W
  const at = axis === 'col' ? (i, j) => data[j * W + i] : (i, j) => data[i * W + j]
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = 0; j < m; j++) sum += at(i, j)
    const mean = sum / m
    let v = 0
    for (let j = 0; j < m; j++) {
      const d = at(i, j) - mean
      v += d * d
    }
    out[i] = Math.sqrt(v / m)
  }
  return out
}

/** First/last index whose variance exceeds `frac` of the peak (the printed block, margin trimmed). */
function trimMargin(variance, frac) {
  const threshold = Math.max(...variance) * frac
  let a = 0
  while (a < variance.length && variance[a] < threshold) a++
  let b = variance.length - 1
  while (b > 0 && variance[b] < threshold) b--
  return [a, b]
}

function clampRegion({ left, top, width, height }, W, H) {
  if (left < 0) { width += left; left = 0 }
  if (top < 0) { height += top; top = 0 }
  if (left + width > W) width = W - left
  if (top + height > H) height = H - top
  return { left, top, width, height }
}

// CLI: node scripts/11th-ingest/crop.mjs <input> <cols> <rows> <outDir> [varThreshold] [overlap]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/crop.mjs')) {
  const [, , input, cols, rows, outDir, varThreshold, overlap] = process.argv
  const res = await cropSheet({
    input,
    cols: Number(cols),
    rows: Number(rows),
    outDir,
    varThreshold: varThreshold ? Number(varThreshold) : undefined,
    overlap: overlap ? Number(overlap) : undefined,
  })
  console.log(`bbox=${res.bbox.join(',')} cell=${res.cell.join('x')} → ${res.files.length} cards in ${outDir}`)
}
