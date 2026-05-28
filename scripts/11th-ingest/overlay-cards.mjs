/**
 * Generate English-overlay copies of every mission card.
 *
 * For each card in reference.json that has a source cell, take its per-card crop
 * (from the crops dir) and drop a translated panel over it: bold English title +
 * flavour + rules + scoring. Output one PNG per card id.
 *
 * Usage: node scripts/11th-ingest/overlay-cards.mjs <reference.json> <cropsDir> <outDir>
 *   cropsDir = the per-page crop dirs (e.g. .../crops2b), expects {cropsDir}/p{NNN}/{cell}.png
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { overlayTranslation } from './overlay.mjs'

export function cardRegions(card) {
  const body = []
  if (card.flavor_en) body.push(card.flavor_en)
  if (card.rules_en) body.push(card.rules_en)
  if (card.action) {
    const a = card.action
    body.push(`Action — ${a.name}: begins ${a.begins}; units: ${a.units}; completes ${a.completes}; effect: ${a.effect}.`)
  }
  for (const s of card.scoring || []) {
    body.push(`• ${s.vp} VP${s.mode ? ` [${s.mode}]` : ''}${s.bonus ? ' (bonus)' : ''}: ${s.condition}`)
  }
  return [
    // opaque panel covering the card body
    { x: 0.03, y: 0.03, w: 0.94, h: 0.94, bg: 'rgba(255,255,255,0.95)', lines: [''] },
    // title bar
    { x: 0.045, y: 0.035, w: 0.91, h: 0.06, bg: false, weight: 'bold', color: '#7a0000', size: 19, lines: [card.title_en] },
    // body text
    { x: 0.045, y: 0.105, w: 0.91, h: 0.86, bg: false, size: 13, text: body.join('\n\n') },
  ]
}

export async function overlayCards({ refPath, cropsDir, outDir }) {
  const data = JSON.parse(readFileSync(refPath, 'utf8'))
  mkdirSync(outDir, { recursive: true })
  let written = 0
  const missing = []
  for (const card of data.cards) {
    if (!card.source || !card.source.cell) continue
    const page = String(card.source.page).padStart(3, '0')
    const crop = `${cropsDir}/p${page}/${card.source.cell}.png`
    if (!existsSync(crop)) { missing.push(`${card.id} (${crop})`); continue }
    await overlayTranslation({ input: crop, regions: cardRegions(card), output: `${outDir}/${card.id}.png` })
    written++
  }
  return { written, missing }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/overlay-cards.mjs')) {
  const [, , refPath, cropsDir, outDir] = process.argv
  const res = await overlayCards({ refPath, cropsDir, outDir })
  console.log(`wrote ${res.written} card overlays to ${outDir}`)
  if (res.missing.length) console.log(`missing crops (${res.missing.length}):\n  ${res.missing.join('\n  ')}`)
}
