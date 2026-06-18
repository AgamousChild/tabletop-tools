/**
 * Generate English-overlay copies of every rules page (core rulebook + mission
 * deck rules pages). Rules in reference.json carry source = {doc, page}; this
 * groups them by page and drops a full-page English panel (all rules on that
 * page) over the French.
 *
 * Usage: node scripts/11th-ingest/overlay-rules.mjs <reference.json> <coreDir> <missionDir> <outDir>
 *   coreDir/missionDir hold p{NNN}.png; output named {doc}-p{NNN}.png
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { overlayTranslation } from './overlay.mjs'

export function rulePageRegions(rulesOnPage) {
  const title = rulesOnPage.map((r) => r.title_en).join('  ·  ')
  const body = rulesOnPage.map((r) => `■ ${r.title_en}\n${r.text_en}`).join('\n\n')
  return [
    { x: 0.02, y: 0.02, w: 0.96, h: 0.96, bg: 'rgba(255,255,255,0.95)', lines: [''] },
    { x: 0.03, y: 0.02, w: 0.94, h: 0.05, bg: false, weight: 'bold', color: '#7a0000', size: 17, lines: [title] },
    { x: 0.03, y: 0.075, w: 0.94, h: 0.9, bg: false, size: 13, text: body },
  ]
}

export async function overlayRules({ refPath, coreDir, missionDir, outDir }) {
  const data = JSON.parse(readFileSync(refPath, 'utf8'))
  mkdirSync(outDir, { recursive: true })
  const groups = {}
  for (const r of data.rules) {
    if (!r.source || r.source.page == null) continue
    const doc = r.source.doc || 'core'
    const key = `${doc}:${r.source.page}`
    ;(groups[key] ??= []).push(r)
  }
  let written = 0
  const missing = []
  for (const [key, rules] of Object.entries(groups)) {
    const [doc, page] = key.split(':')
    const dir = doc === 'mission' ? missionDir : coreDir
    const src = `${dir}/p${String(page).padStart(3, '0')}.png`
    if (!existsSync(src)) { missing.push(src); continue }
    await overlayTranslation({ input: src, regions: rulePageRegions(rules), output: `${outDir}/${doc}-p${String(page).padStart(3, '0')}.png` })
    written++
  }
  return { written, missing }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/overlay-rules.mjs')) {
  const [, , refPath, coreDir, missionDir, outDir] = process.argv
  const res = await overlayRules({ refPath, coreDir, missionDir, outDir })
  console.log(`wrote ${res.written} rules-page overlays to ${outDir}`)
  if (res.missing.length) console.log(`missing pages (${res.missing.length}):\n  ${res.missing.join('\n  ')}`)
}
