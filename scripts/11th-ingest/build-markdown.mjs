/**
 * Generate the flat, human-readable reference (reference.md) from reference.json.
 *
 * reference.json is the single source of truth (English, our own words). This
 * renders it as grouped Markdown: the mission deck (deployment maps, primary
 * missions by set, secondary missions) and the base rules (grouped by section).
 *
 * @param {object} data parsed reference.json
 * @returns {string} markdown
 */
import { readFileSync, writeFileSync } from 'node:fs'

export function buildMarkdown(data) {
  const cards = data.cards || []
  const rules = data.rules || []
  const out = []
  const h = (n, t) => out.push(`${'#'.repeat(n)} ${t}`, '')
  const p = (t) => out.push(t, '')

  h(1, '11th Edition — Translated Reference')
  p('> Generated from `reference.json` (English / our own words). Local reference only — not committed; sourced from the leaked Chapter Approved mission deck + core rulebook, mechanics re-expressed in our own words.')

  const scoringLines = (c) =>
    (c.scoring || []).map((s) => {
      const bits = []
      if (s.mode) bits.push(`[${s.mode}]`)
      if (s.trigger) bits.push(s.trigger.replace(/_/g, ' '))
      if (s.from_round) bits.push(`from round ${s.from_round}`)
      if (s.rounds) bits.push(`rounds ${s.rounds.join('/')}`)
      const when = bits.length ? ` _(${bits.join(', ')})_` : ''
      return `  - **${s.vp} VP**${s.bonus ? ' (bonus)' : ''} — ${s.condition}${when}`
    })

  const renderCard = (c) => {
    h(4, `${c.title_en}${c.title_fr ? ` — _${c.title_fr}_` : ''}`)
    const meta = []
    if (c.subtype) meta.push(c.subtype)
    if (c.set) meta.push(`set: ${c.set}`)
    if (c.copies) meta.push(`${c.copies} copies`)
    if (c.source) meta.push(`p${c.source.page}${c.source.cell ? ` ${c.source.cell}` : ''}`)
    if (meta.length) p(`*${meta.join(' · ')}*`)
    if (c.flavor_en) p(`_${c.flavor_en}_`)
    if (c.rules_en) p(c.rules_en)
    if (c.action) {
      const a = c.action
      p(`**Action — ${a.name}:** begins ${a.begins}; units: ${a.units}; use limit: ${a.use_limit}; completes ${a.completes}; effect: ${a.effect}${a.restrictions ? `; restrictions: ${a.restrictions}` : ''}`)
    }
    const sc = scoringLines(c)
    if (sc.length) { out.push('**Scoring:**', ...sc, '') }
    if (c.needs_verify && c.needs_verify.length) p(`⚠ _verify: ${c.needs_verify.join('; ')}_`)
  }

  h(2, 'Mission Deck')
  for (const [kind, label] of [['deployment', 'Deployment Maps'], ['primary', 'Primary Missions'], ['secondary', 'Secondary Missions']]) {
    const group = cards.filter((c) => c.kind === kind)
    if (!group.length) continue
    h(3, label)
    for (const c of group) renderCard(c)
  }

  h(2, 'Base Rules')
  const sections = [...new Set(rules.map((r) => r.section || 'Misc'))]
  for (const section of sections) {
    h(3, section)
    for (const r of rules.filter((x) => (x.section || 'Misc') === section)) {
      h(4, `${r.title_en}${r.title_fr ? ` — _${r.title_fr}_` : ''}`)
      if (r.source) p(`*${r.source.doc} p${r.source.page}${r.category ? ` · ${r.category}` : ''}*`)
      if (r.text_en) p(r.text_en)
      if (r.needs_verify && r.needs_verify.length) p(`⚠ _verify: ${r.needs_verify.join('; ')}_`)
    }
  }

  return out.join('\n')
}

// CLI: node scripts/11th-ingest/build-markdown.mjs <reference.json> <out.md>
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/11th-ingest/build-markdown.mjs')) {
  const [, , inPath, outPath] = process.argv
  const md = buildMarkdown(JSON.parse(readFileSync(inPath, 'utf8')))
  writeFileSync(outPath, md)
  console.log(`wrote ${outPath} (${md.length} chars)`)
}
