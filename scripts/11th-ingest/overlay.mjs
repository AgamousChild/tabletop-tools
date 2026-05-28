/**
 * Drop translated (English) text over the French on a copy of a card/page image.
 *
 * Takes the source image and a list of regions; for each region it paints a
 * semi-opaque panel (covering the French) and lays the English text inside it,
 * word-wrapped to the panel width. Coordinates may be absolute pixels or
 * fractions of the image dimensions (0-1), so the same region set scales across
 * resolutions.
 *
 * Region: { x, y, w, h, text|lines, size?, weight?, color?, bg? }
 *   - x,y,w,h : panel rect (px, or 0-1 fraction of width/height)
 *   - text    : string (\n-separated paragraphs, auto-wrapped) OR
 *   - lines   : pre-split string[] (no auto-wrap)
 *   - bg      : panel fill (default translucent white); `false` = no panel (text only)
 *
 * @param {object} o
 * @param {string} o.input    source image path
 * @param {Array}  o.regions  region list (see above)
 * @param {string} o.output   destination PNG path
 * @returns {Promise<{ width:number, height:number, output:string }>}
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

export async function overlayTranslation({ input, regions, output }) {
  const { width: W, height: H } = await sharp(input).metadata()
  const toPx = (v, dim) => (v <= 1 ? Math.round(v * dim) : Math.round(v))

  const svg = [`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`]
  for (const r of regions) {
    const x = toPx(r.x, W)
    const y = toPx(r.y, H)
    const w = toPx(r.w, W)
    const h = toPx(r.h, H)
    const size = r.size || 17
    const lineHeight = size * 1.28
    const color = r.color || '#111'
    if (r.bg !== false) {
      svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${r.bg || 'rgba(255,255,255,0.94)'}" stroke="#888" stroke-width="1"/>`)
    }
    const maxChars = Math.max(8, Math.floor((w - 12) / (size * 0.52)))
    const lines = r.lines || wrap(r.text, maxChars)
    let ty = y + size + 6
    for (const line of lines) {
      if (line) {
        svg.push(`<text x="${x + 8}" y="${ty}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${r.weight || 'normal'}" fill="${color}">${escapeXml(line)}</text>`)
      }
      ty += lineHeight
    }
  }
  svg.push('</svg>')

  await sharp(input).composite([{ input: Buffer.from(svg.join('')), top: 0, left: 0 }]).toFile(output)
  return { width: W, height: H, output }
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrap(text, maxChars) {
  const out = []
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      out.push('')
      continue
    }
    let cur = ''
    for (const word of para.split(/\s+/)) {
      if ((cur + ' ' + word).trim().length > maxChars) {
        out.push(cur)
        cur = word
      } else {
        cur = (cur + ' ' + word).trim()
      }
    }
    if (cur) out.push(cur)
  }
  return out
}

// CLI: node scripts/11th-ingest/overlay.mjs <input> <regions.json> <output>
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/overlay.mjs')) {
  const [, , input, regionsPath, output] = process.argv
  const regions = JSON.parse(readFileSync(regionsPath, 'utf8'))
  const res = await overlayTranslation({ input, regions, output })
  console.log(`wrote ${res.output} (${res.width}x${res.height})`)
}
