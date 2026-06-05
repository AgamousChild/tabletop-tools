#!/usr/bin/env node
/**
 * Build brain Nodes from an 11th-edition datasheet-card PDF.
 *
 * Usage:
 *   node scripts/11th-ingest/build-datasheet-nodes.mjs <pdf-path> <faction-id> <bundle-name> [--upload]
 *
 *   node scripts/11th-ingest/build-datasheet-nodes.mjs \
 *     C:/R/sync-data/tools/11th-official/armageddon-orks-datasheets.pdf \
 *     orks 11e-orks-armageddon
 *
 * Each card has the structure:
 *   <NAME>                       — ALL-CAPS unit name on its own line
 *   M T SV W LD OC               — stats header
 *   <values>                     — `6" 5 4+ 6 6+ 1`
 *   ABILITIES
 *     CORE: ...                  — core ability keywords
 *     FACTION: ...               — faction ability keywords
 *     <Named ability>: <text>    — repeating
 *   UNIT COMPOSITION
 *     <body>
 *   <lore paragraph>
 *   RANGED WEAPONS RANGE A BS S AP D
 *     <weapon rows>
 *   MELEE WEAPONS RANGE A WS S AP D
 *     <weapon rows>
 *   LEADER                       — optional
 *     This model can be attached to: <unit list>
 *   KEYWORDS: <list>
 *   FACTION KEYWORDS:
 *   <faction>
 *   InSv (e.g.) 5+               — optional invulnerable save line at end
 *
 * Output: one Node per datasheet, layer='unit', category='datasheet'.
 */
import { execSync, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [, , PDF_PATH, FACTION_ID, BUNDLE_NAME, ...flags] = process.argv
if (!PDF_PATH || !FACTION_ID || !BUNDLE_NAME) {
  console.error('Usage: build-datasheet-nodes.mjs <pdf> <factionId> <bundleName> [--upload]')
  process.exit(1)
}
const UPLOAD = flags.includes('--upload')
const RETRIEVED_AT = new Date().toISOString()
const SOURCE_TITLE = 'Warhammer 40,000 11th ed Datasheet Cards — ' + BUNDLE_NAME

// Extract text via pdftotext -raw (we already have pdftotext on PATH).
const TXT_PATH = PDF_PATH.replace(/\.pdf$/i, '-raw.txt')
execFileSync('pdftotext', ['-raw', PDF_PATH, TXT_PATH])
const raw = readFileSync(TXT_PATH, 'utf8').replace(/\r/g, '')

// Form feeds delimit pages; we use them to compute line→page.
const pages = raw.split('\f')
const lines = raw.split('\n')
const lineToPage = new Map()
{
  let i = 0
  for (let p = 0; p < pages.length; p++) {
    for (const _ of pages[p].split('\n')) lineToPage.set(i++, p + 1)
  }
}

// Find each datasheet: every `M T SV W LD OC` header marks one card. The unit
// name is the previous non-empty line. Slice from name line to next name line.
const STATS_HEADER = /^M T SV W LD OC\s*$/
const cards = []
for (let i = 0; i < lines.length; i++) {
  if (!STATS_HEADER.test(lines[i])) continue
  // Walk back to find the name (skip blanks).
  let n = i - 1
  while (n >= 0 && !lines[n].trim()) n--
  if (n < 0) continue
  const name = lines[n].trim()
  // Sanity: name must be a single-line ALL-CAPS string.
  if (!/^[A-Z][A-Z0-9 '’\-/]+$/.test(name)) continue
  cards.push({ name, nameLine: n, statsLine: i, valuesLine: i + 1 })
}

// Determine each card's end (next card's name line, or end of doc).
for (let k = 0; k < cards.length; k++) {
  cards[k].endLine = k + 1 < cards.length ? cards[k + 1].nameLine : lines.length
}

console.log(`Found ${cards.length} datasheet cards.`)

// ── extractors ──────────────────────────────────────────────────────────────

function parseStats(headerLine, valueLine) {
  // header: "M T SV W LD OC" → fields
  // values: `6" 5 4+ 6 6+ 1` (tokens — split on whitespace)
  const keys = headerLine.trim().split(/\s+/)
  const vals = valueLine.trim().split(/\s+/)
  const out = {}
  for (let i = 0; i < keys.length && i < vals.length; i++) out[keys[i]] = vals[i]
  return out
}

function parseInvSv(body) {
  // PDF appends "InSv\n5+" or "InSv: 5+" near the end on some cards.
  const m = body.match(/InSv[\s:]*([0-9]\+\+?)/i)
  return m ? m[1] : undefined
}

function parseAbilities(body) {
  const section = sectionAfter(body, 'ABILITIES', ['UNIT COMPOSITION', 'RANGED WEAPONS', 'MELEE WEAPONS', 'KEYWORDS:'])
  if (!section) return { core: [], faction: [], named: [] }
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean)
  const core = []
  const faction = []
  const named = []
  let currentNamed = null
  for (const ln of lines) {
    const c = ln.match(/^CORE:\s*(.*)$/)
    if (c) { core.push(...c[1].split(/\s*,\s*/).filter(Boolean)); continue }
    const f = ln.match(/^FACTION:\s*(.*)$/)
    if (f) { faction.push(...f[1].split(/\s*,\s*/).filter(Boolean)); continue }
    // Named ability: "<Name>: <text>"  — name segment is short and ends in colon.
    const m = ln.match(/^([A-Z][A-Za-z'’ \-]+):\s+(.+)$/)
    if (m && m[1].length <= 40) {
      if (currentNamed) named.push(currentNamed)
      currentNamed = { name: m[1].trim(), text: m[2].trim() }
    } else if (currentNamed) {
      currentNamed.text += ' ' + ln
    }
  }
  if (currentNamed) named.push(currentNamed)
  return { core, faction, named }
}

function parseUnitComposition(body) {
  const section = sectionAfter(body, 'UNIT COMPOSITION', ['RANGED WEAPONS', 'MELEE WEAPONS', 'KEYWORDS:'])
  return section ? section.trim() : ''
}

function parseLore(body) {
  // Lore sits between UNIT COMPOSITION and the first weapon table. Take the
  // LAST paragraph in that range (composition is usually 2-3 short lines,
  // followed by a blank line, followed by the lore paragraph).
  const m = body.match(/UNIT COMPOSITION[\s\S]*?\n([\s\S]*?)(?=\n(?:RANGED WEAPONS|MELEE WEAPONS|LEADER|SUPPORT|KEYWORDS:))/i)
  if (!m) return ''
  const paragraphs = m[1].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  // Composition is the first paragraph (starts with "<N> <Unit>" or "This model
  // is equipped..."); lore is everything after. If there's only one paragraph
  // (no blank-line separation), don't emit duplicated lore.
  if (paragraphs.length < 2) return ''
  return paragraphs.slice(1).join('\n\n')
}

function parseWeapons(body, type) {
  // type: 'RANGED' | 'MELEE'
  const header = type === 'RANGED' ? /RANGED WEAPONS\s+RANGE\s+A\s+BS\s+S\s+AP\s+D/i
                                   : /MELEE WEAPONS\s+RANGE\s+A\s+WS\s+S\s+AP\s+D/i
  const headerMatch = body.match(header)
  if (!headerMatch) return []
  const start = headerMatch.index + headerMatch[0].length
  // End at next major section header.
  const endMatch = body.slice(start).match(/\n(?:RANGED WEAPONS|MELEE WEAPONS|LEADER|SUPPORT|KEYWORDS:|FACTION KEYWORDS:)/i)
  const segment = endMatch ? body.slice(start, start + endMatch.index) : body.slice(start)
  const out = []
  for (const ln of segment.split('\n').map((l) => l.trim()).filter(Boolean)) {
    // Weapon row: <name> [<abilities>] <range> <A> <stat> <S> <AP> <D>
    // Range: 18" or "Melee"; stats: numbers or `4+`.
    const m = ln.match(/^(.+?)\s+(?:\[([^\]]*)\]\s+)?(\d+\"|Melee)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/)
    if (!m) continue
    out.push({
      name: m[1].trim(),
      abilities: m[2] ? m[2].split(/\s*,\s*/) : [],
      range: m[3],
      attacks: m[4],
      skill: m[5],
      strength: m[6],
      ap: m[7],
      damage: m[8],
    })
  }
  return out
}

function parseLeaderInfo(body) {
  // "LEADER\nThis model can be attached to the following units: A; B; C"
  const m = body.match(/(LEADER|SUPPORT)\s*\nThis model can be attached to[^:]*:\s*(.+?)(?:\n|$)/i)
  if (!m) return null
  return {
    role: m[1].toUpperCase(),
    canLead: m[2].split(/\s*[;,]\s*/).map((s) => s.trim()).filter(Boolean),
  }
}

function parseKeywords(body) {
  const m = body.match(/^KEYWORDS:\s*(.+)$/m)
  if (!m) return []
  return m[1].split(/\s*[;,]\s*/).map((s) => s.trim()).filter(Boolean)
}

function parseFactionKeywords(body) {
  const m = body.match(/FACTION KEYWORDS:\s*\n([\s\S]+?)(?:\n\s*\n|$)/i)
  if (!m) return []
  // Stop at the first line that's an InSv label or a bare save value — those
  // are tail-of-card stats, not faction keywords.
  const out = []
  for (const tok of m[1].split(/\n|;|,/).map((s) => s.trim()).filter(Boolean)) {
    if (/^InSv$/i.test(tok)) break
    if (/^\d\+\+?$/.test(tok)) break
    out.push(tok)
  }
  return out
}

function sectionAfter(body, header, terminators) {
  const headRe = new RegExp(`^${header}\\s*$`, 'mi')
  const headMatch = body.match(headRe)
  if (!headMatch) return null
  const start = headMatch.index + headMatch[0].length
  const tail = body.slice(start)
  let end = tail.length
  for (const t of terminators) {
    const m = tail.match(new RegExp(`\\n${t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}`, 'i'))
    if (m && m.index < end) end = m.index
  }
  return tail.slice(0, end).trim()
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[’ʼ'‘"”“]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

// ── build nodes ──────────────────────────────────────────────────────────────

const nodes = []
for (const card of cards) {
  const body = lines.slice(card.nameLine, card.endLine).join('\n')
  const stats = parseStats(lines[card.statsLine], lines[card.valuesLine])
  const invSv = parseInvSv(body)
  if (invSv) stats.InSv = invSv
  const abilities = parseAbilities(body)
  const unitComposition = parseUnitComposition(body)
  const lore = parseLore(body)
  const rangedWeapons = parseWeapons(body, 'RANGED')
  const meleeWeapons = parseWeapons(body, 'MELEE')
  const leader = parseLeaderInfo(body)
  const keywords = parseKeywords(body)
  const factionKeywords = parseFactionKeywords(body)

  const title = card.name.replace(/\s+/g, ' ').trim()
  const id = `11e-ds-${FACTION_ID}-${slug(title)}`
  const page = lineToPage.get(card.nameLine) ?? 1

  // Content: nicely formatted summary of the card for display + LLM grounding.
  const contentLines = []
  contentLines.push(`**${title}** — ${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  if (unitComposition) contentLines.push('\n**Unit Composition:**\n' + unitComposition)
  if (abilities.core.length) contentLines.push(`\n**Core abilities:** ${abilities.core.join(', ')}`)
  if (abilities.faction.length) contentLines.push(`**Faction abilities:** ${abilities.faction.join(', ')}`)
  if (abilities.named.length) {
    contentLines.push('\n**Abilities:**')
    for (const a of abilities.named) contentLines.push(`- *${a.name}:* ${a.text}`)
  }
  if (rangedWeapons.length) {
    contentLines.push('\n**Ranged Weapons:**')
    for (const w of rangedWeapons) {
      const ab = w.abilities.length ? ` [${w.abilities.join(', ')}]` : ''
      contentLines.push(`- ${w.name}${ab} — Range ${w.range}, A ${w.attacks}, BS ${w.skill}, S ${w.strength}, AP ${w.ap}, D ${w.damage}`)
    }
  }
  if (meleeWeapons.length) {
    contentLines.push('\n**Melee Weapons:**')
    for (const w of meleeWeapons) {
      const ab = w.abilities.length ? ` [${w.abilities.join(', ')}]` : ''
      contentLines.push(`- ${w.name}${ab} — A ${w.attacks}, WS ${w.skill}, S ${w.strength}, AP ${w.ap}, D ${w.damage}`)
    }
  }
  if (leader) {
    contentLines.push(`\n**${leader.role}:** can be attached to ${leader.canLead.join(', ')}`)
  }
  if (keywords.length) contentLines.push(`\n**Keywords:** ${keywords.join(', ')}`)
  if (factionKeywords.length) contentLines.push(`**Faction Keywords:** ${factionKeywords.join(', ')}`)
  if (lore) contentLines.push('\n' + lore)

  const content = contentLines.join('\n')
  const summary = `${title}: ${unitComposition.split('\n')[0] || 'datasheet'}.`

  nodes.push({
    id,
    layer: 'unit',
    category: 'datasheet',
    title,
    content,
    summary,
    factionId: FACTION_ID,
    datasheetId: id,
    stats,
    abilities,
    rangedWeapons,
    meleeWeapons,
    ...(leader ? { attach: leader } : {}),
    unitComposition,
    keywords: keywords.map((k) => k.toLowerCase()),
    factionKeywords,
    sources: [
      {
        type: 'pdf',
        title: SOURCE_TITLE,
        page,
        publishedAt: '2026-06-02',
        retrievedAt: RETRIEVED_AT,
      },
    ],
    refs: [],
    version: 1,
    edition: '11th',
  })
}

// ── write ────────────────────────────────────────────────────────────────────

const outDir = `C:/R/sync-data/tools/11th-official/${BUNDLE_NAME}`
mkdirSync(outDir, { recursive: true })
for (const n of nodes) writeFileSync(`${outDir}/${n.id}.json`, JSON.stringify(n, null, 2))
writeFileSync(
  `${outDir}/_index.json`,
  JSON.stringify(
    nodes.map((n) => ({ id: n.id, title: n.title, factionId: n.factionId, page: n.sources[0].page })),
    null,
    2,
  ),
)
const bundlePath = `${outDir}/${BUNDLE_NAME}-bundle.json`
writeFileSync(bundlePath, JSON.stringify(nodes))
console.log(`Wrote ${nodes.length} datasheet node files to ${outDir}`)

if (UPLOAD) {
  console.log('Uploading to brain R2...')
  execSync(
    `wrangler r2 object put tabletop-tools-brain/nodes/${BUNDLE_NAME}.json --file ${bundlePath} --remote`,
    { stdio: 'inherit' },
  )
  console.log(`Uploaded nodes/${BUNDLE_NAME}.json — bump manifest hash separately.`)
}
