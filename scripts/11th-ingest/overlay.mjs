/**
 * Drop translated (English) text over the French on a copy of a card/page image.
 *
 * Each region paints a panel **sized to its text** (not the whole image — so the
 * original card/page stays visible around it) and lays the English inside it,
 * word-wrapped. An optional bold `title` renders as the first line. Coordinates
 * may be absolute pixels or fractions of the image dimensions (0-1).
 *
 * Region: { x, y, w, title?, titleColor?, text|lines, size?, color?, bg? }
 *   - x,y,w  : panel left/top/width (px, or 0-1 fraction). Height auto-fits the text.
 *   - title  : optional bold heading line
 *   - text   : string (\n-separated, auto-wrapped) OR lines: pre-split string[]
 *   - bg     : panel fill (default near-opaque white); `false` = text only, no panel
 *
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
    const size = r.size || 16
    const titleSize = Math.round(size * 1.25)
    const lineH = Math.round(size * 1.32)
    const pad = 10
    const maxChars = Math.max(10, Math.floor((w - 2 * pad) / (size * 0.52)))
    const titleMaxChars = Math.max(10, Math.floor((w - 2 * pad) / (titleSize * 0.55)))

    const titleLines = r.title ? wrap(r.title, titleMaxChars) : []
    const bodyLines = r.lines || (r.text ? wrap(r.text, maxChars) : [])

    // height fits the content
    const contentH = titleLines.length * Math.round(titleSize * 1.3) + bodyLines.length * lineH
    const h = contentH + 2 * pad

    if (r.bg !== false) {
      svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${r.bg || 'rgba(255,255,255,0.93)'}" stroke="#888" stroke-width="1"/>`)
    }
    let ty = y + pad
    for (const line of titleLines) {
      ty += Math.round(titleSize * 1.3)
      svg.push(`<text x="${x + pad}" y="${ty}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="bold" fill="${r.titleColor || '#7a0000'}">${escapeXml(line)}</text>`)
    }
    if (titleLines.length) ty += 4
    for (const line of bodyLines) {
      ty += lineH
      if (line) svg.push(`<text x="${x + pad}" y="${ty}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${r.color || '#111'}">${escapeXml(line)}</text>`)
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
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue }
    let cur = ''
    for (const word of para.split(/\s+/)) {
      if ((cur + ' ' + word).trim().length > maxChars) { out.push(cur); cur = word } else cur = (cur + ' ' + word).trim()
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
