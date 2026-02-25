import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  getFactions,
  getDatasheetsByFaction,
  getModelsForDatasheet,
  getAbilitiesForDatasheet,
  getWargearForDatasheet,
  getStratagemsByFaction,
  getEnhancementsByFaction,
} from './db'
import { stripHtml } from './csv-parser'

export interface MarkdownResult {
  factionCount: number
  fileCount: number
}

export function generateFactionMarkdown(
  dbPath: string,
  factionId: string,
  factionName: string,
): string {
  const lines: string[] = []
  lines.push(`# ${factionName}`)
  lines.push('')

  // Datasheets
  const datasheets = getDatasheetsByFaction(dbPath, factionId)
  if (datasheets.length > 0) {
    lines.push('## Datasheets')
    lines.push('')

    for (const ds of datasheets) {
      lines.push(`### ${ds.name}`)
      if (ds.role) lines.push(`**Role:** ${ds.role}`)
      if (ds.cost) lines.push(`**Cost:** ${ds.cost} pts`)
      lines.push('')

      // Models (stat block)
      const models = getModelsForDatasheet(dbPath, ds.id)
      if (models.length > 0) {
        lines.push('| Name | M | T | SV | W | LD | OC |')
        lines.push('|------|---|---|----|----|----|----|')
        for (const m of models) {
          const invul = m.invul_save ? ` (${m.invul_save}++)` : ''
          lines.push(`| ${m.name} | ${m.M} | ${m.T} | ${m.SV}${invul} | ${m.W} | ${m.LD} | ${m.OC} |`)
        }
        lines.push('')
      }

      // Weapons
      const wargear = getWargearForDatasheet(dbPath, ds.id)
      const ranged = wargear.filter((w) => w.wargear_name && (w as any).range && (w as any).range !== '-' && (w as any).range !== '')
      const melee = wargear.filter((w) => w.wargear_name && ((w as any).range === '-' || (w as any).range === ''))

      if (ranged.length > 0) {
        lines.push('**Ranged Weapons**')
        lines.push('')
        lines.push('| Weapon | Range | A | BS | S | AP | D |')
        lines.push('|--------|-------|---|----|---|----|---|')
        for (const w of ranged) {
          lines.push(`| ${w.wargear_name} | ${(w as any).range} | ${(w as any).A} | ${(w as any).BS_WS} | ${(w as any).S} | ${(w as any).AP} | ${(w as any).D} |`)
        }
        lines.push('')
      }

      if (melee.length > 0) {
        lines.push('**Melee Weapons**')
        lines.push('')
        lines.push('| Weapon | A | WS | S | AP | D |')
        lines.push('|--------|---|----|---|----|---|')
        for (const w of melee) {
          lines.push(`| ${w.wargear_name} | ${(w as any).A} | ${(w as any).BS_WS} | ${(w as any).S} | ${(w as any).AP} | ${(w as any).D} |`)
        }
        lines.push('')
      }

      // Abilities
      const abs = getAbilitiesForDatasheet(dbPath, ds.id)
      if (abs.length > 0) {
        lines.push('**Abilities**')
        lines.push('')
        for (const a of abs) {
          if (a.ability_name) {
            const desc = a.ability_description ? `: ${stripHtml(a.ability_description)}` : ''
            lines.push(`- **${a.ability_name}**${desc}`)
          }
        }
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    }
  }

  // Stratagems
  const stratagems = getStratagemsByFaction(dbPath, factionId)
  if (stratagems.length > 0) {
    lines.push('## Stratagems')
    lines.push('')
    for (const s of stratagems) {
      lines.push(`### ${s.name} (${s.cp_cost} CP)`)
      if (s.type) lines.push(`**Type:** ${s.type}`)
      if (s.phase) lines.push(`**Phase:** ${s.phase}`)
      if (s.turn) lines.push(`**Turn:** ${s.turn}`)
      lines.push('')
      if (s.description) lines.push(stripHtml(s.description))
      lines.push('')
    }
  }

  // Enhancements
  const enhancements = getEnhancementsByFaction(dbPath, factionId)
  if (enhancements.length > 0) {
    lines.push('## Enhancements')
    lines.push('')
    for (const e of enhancements) {
      const cost = e.cost ? ` (${e.cost} pts)` : ''
      lines.push(`### ${e.name}${cost}`)
      lines.push('')
      if (e.description) lines.push(stripHtml(e.description))
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function generateAllMarkdown(
  dbPath: string,
  outputDir: string,
): MarkdownResult {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const factions = getFactions(dbPath)
  let fileCount = 0

  const indexLines: string[] = []
  indexLines.push('# Wahapedia 40K 10th Edition Data')
  indexLines.push('')
  indexLines.push(`Generated: ${new Date().toISOString()}`)
  indexLines.push('')
  indexLines.push('## Factions')
  indexLines.push('')

  for (const faction of factions) {
    const safeName = faction.name.replace(/[^a-zA-Z0-9 -]/g, '').replace(/\s+/g, '-').toLowerCase()
    const fileName = `${safeName}.md`

    const markdown = generateFactionMarkdown(dbPath, faction.id, faction.name)
    writeFileSync(join(outputDir, fileName), markdown, 'utf-8')
    fileCount++

    indexLines.push(`- [${faction.name}](./${fileName})`)
  }

  indexLines.push('')
  writeFileSync(join(outputDir, 'INDEX.md'), indexLines.join('\n'), 'utf-8')
  fileCount++

  return { factionCount: factions.length, fileCount }
}
