// splitDetachmentNames lives in server-core because that is where the
// dim_detachment registry lives — the only place that can decide whether a
// split is right (see resolveDeclaredDetachments). One implementation, not two.
import type { TTTPackage, TTTUnit } from '@tabletop-tools/db'
import { splitDetachmentNames } from '@tabletop-tools/server-core'

import { normalizeFaction } from './faction-map'

/** Canonical faction names as they appear in GW App exports. Longer names first. */
const FACTION_NAMES = [
  'Chaos Space Marines',
  'Adepta Sororitas',
  'Adeptus Custodes',
  'Adeptus Mechanicus',
  'Astra Militarum',
  'Black Templars',
  'Blood Angels',
  'Chaos Daemons',
  'Chaos Knights',
  'Dark Angels',
  'Death Guard',
  "Emperor's Children",
  'Genestealer Cults',
  'Grey Knights',
  'Imperial Agents',
  'Imperial Knights',
  'Leagues of Votann',
  'Space Marines',
  'Space Wolves',
  "T'au Empire",
  'Thousand Sons',
  'World Eaters',
  'Aeldari',
  'Deathwatch',
  'Drukhari',
  'Necrons',
  'Orks',
  'Tyranids',
]

const SUBFACTION_NAMES = [
  'Ultramarines',
  'Salamanders',
  'Imperial Fists',
  'Iron Hands',
  'Raven Guard',
  'White Scars',
  'Crimson Fists',
  'Flesh Tearers',
  'Black Legion',
  'Alpha Legion',
  'Night Lords',
  'Iron Warriors',
  'Word Bearers',
  'Red Corsairs',
  'Deathwing',
  'Farsight Enclaves',
  "T'au Sept",
  'Sautekh',
  'Nihilakh',
  'Goffs',
  'Freebooterz',
  'Blood Axe',
]

const ROLE_HEADERS = [
  'CHARACTERS',
  'OTHER DATASHEETS',
  'BATTLELINE',
  'DEDICATED TRANSPORTS',
  'FORTIFICATIONS',
  'ALLIED UNITS',
] as const

const ROLE_MAP: Record<string, TTTUnit['role']> = {
  CHARACTERS: 'Character',
  'OTHER DATASHEETS': 'Other',
  BATTLELINE: 'Battleline',
  'DEDICATED TRANSPORTS': 'Dedicated Transport',
  FORTIFICATIONS: 'Fortification',
  'ALLIED UNITS': 'Allied',
}

type BattleSize = TTTPackage['meta']['battleSize']

const BATTLE_SIZES: BattleSize[] = ['Combat Patrol', 'Incursion', 'Strike Force', 'Onslaught']

function slugifyDetachment(name: string): string {
  return name
    .replace(/\s*\(.*\)/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function stripCommas(n: string): number {
  return parseInt(n.replace(/,/g, ''), 10)
}

function factionToSlug(name: string): string {
  const direct = normalizeFaction(name)
  if (direct) return direct
  if (name === 'Space Marines') return 'space-marines'
  return name.toLowerCase().replace(/\s+/g, '-')
}

export function parseGwApp(text: string): TTTPackage {
  const rawSource = text
  text = text.replace(/Exported with App Version:.*$/, '').trim()

  const base: TTTPackage = {
    version: 1,
    parsedWith: 'gw-app-v1',
    parseStatus: 'ok',
    meta: {
      name: '',
      totalPoints: 0,
      edition: '10th',
      battleSize: 'unknown',
      source: 'bcp-import',
    },
    list: {
      factionId: '',
      factionName: '',
      units: [],
    },
    exports: { rawSource },
  }

  // 1. Find the FIRST parenthesized number — that's the list name+points.
  //    Try bare-number first (stops at first paren), then "Points" variant.
  const nameMatch =
    text.match(/^(.*?)\((\d[\d,]*)\)/) ?? text.match(/^(.*?)\((\d[\d,]*)\s*[Pp]oints?\)/)

  if (!nameMatch) {
    base.parseStatus = 'failed'
    base.parseError = 'Could not parse list name and points'
    return base
  }

  base.meta.name = (nameMatch[1] ?? '').trim()
  base.meta.totalPoints = stripCommas(nameMatch[2] ?? '0')
  const afterNamePos = nameMatch.index! + nameMatch[0].length

  // 2. Find the first role header
  let firstRolePos = -1
  for (const header of ROLE_HEADERS) {
    const idx = text.indexOf(header, afterNamePos)
    if (idx !== -1 && (firstRolePos === -1 || idx < firstRolePos)) {
      firstRolePos = idx
    }
  }

  const preamble =
    firstRolePos !== -1 ? text.slice(afterNamePos, firstRolePos) : text.slice(afterNamePos)

  // 3. Parse preamble
  parsePreamble(preamble, base)

  // 4. Parse units
  if (firstRolePos !== -1) {
    base.list.units = parseUnits(text.slice(firstRolePos))
  }

  // 5. Status
  if (base.list.units.length === 0) {
    base.parseStatus = 'failed'
    base.parseError = 'No units found'
  } else if (!base.list.detachmentName) {
    base.parseStatus = 'partial'
  }

  return base
}

function parsePreamble(preamble: string, pkg: TTTPackage): void {
  let remaining = preamble

  for (const f of FACTION_NAMES) {
    const idx = remaining.indexOf(f)
    if (idx !== -1) {
      pkg.list.factionName = f
      pkg.list.factionId = factionToSlug(f)
      remaining = remaining.slice(idx + f.length)
      break
    }
  }

  for (const bs of BATTLE_SIZES) {
    const escaped = bs.replace(/\s+/g, '\\s+')
    const pattern = new RegExp(escaped + '\\s*\\(\\d[\\d,]*\\s*[Pp]oints?\\)')
    const m = remaining.match(pattern)
    if (m) {
      pkg.meta.battleSize = bs
      remaining = remaining.slice(0, m.index!) + remaining.slice(m.index! + m[0].length)
      break
    }
  }

  remaining = remaining.trim()
  if (!remaining) return

  for (const sf of SUBFACTION_NAMES) {
    if (remaining.startsWith(sf)) {
      pkg.list.subfactionName = sf
      pkg.list.subfactionId = sf.toLowerCase().replace(/\s+/g, '-')
      remaining = remaining.slice(sf.length).trim()
      break
    }
  }

  if (remaining) {
    // 11e: the detachment line carries the points spent, e.g.
    // "Librarius Conclave and Spearpoint Task Force (3 Detachment Points)".
    const dpMatch = remaining.match(/\((\d+)\s*Detachment\s+Points?\)/i)
    if (dpMatch) {
      pkg.list.detachmentPoints = parseInt(dpMatch[1]!, 10)
      remaining = (
        remaining.slice(0, dpMatch.index!) + remaining.slice(dpMatch.index! + dpMatch[0].length)
      ).trim()
    }

    pkg.list.detachmentName = remaining
    pkg.list.detachmentId = slugifyDetachment(remaining)

    const names = splitDetachmentNames(remaining)
    pkg.list.detachments = names.map((name) => ({ name, id: slugifyDetachment(name) }))
    // Primary is the first written detachment.
    if (names.length > 0) {
      pkg.list.detachmentName = names[0]!
      pkg.list.detachmentId = slugifyDetachment(names[0]!)
    }
  }
}

/**
 * Split text into units. The key insight: the reliable delimiter is "(NNN Points)".
 * Each unit is: [name](points)[body]
 *
 * Since there are no newlines, unit names are concatenated directly after the previous
 * unit's wargear text. We find each "(NNN Points)" and scan backwards to find where
 * the unit name starts.
 */
function parseUnits(text: string): TTTUnit[] {
  const units: TTTUnit[] = []

  // Split at role headers first
  const headerPattern = new RegExp(
    `(${ROLE_HEADERS.map((h) => h.replace(/\s+/g, '\\s+')).join('|')})`,
  )
  const parts = text.split(headerPattern)

  let currentRole: TTTUnit['role'] = 'unknown'

  for (const part of parts) {
    const trimmed = part.trim()
    if (ROLE_MAP[trimmed]) {
      currentRole = ROLE_MAP[trimmed]!
      continue
    }
    if (!trimmed) continue

    // Find all "(NNN Points)" positions
    const pointsRe = /\((\d[\d,]*)\s*[Pp]oints?\)/g
    let m: RegExpExecArray | null
    const anchors: { points: number; nameStart: number; nameEnd: number; bodyStart: number }[] = []

    while ((m = pointsRe.exec(trimmed)) !== null) {
      const parenStart = m.index
      const parenEnd = m.index + m[0].length
      const points = stripCommas(m[1]!)

      // Scan backwards from parenStart to find unit name start.
      // The name is a sequence of word characters (including spaces, hyphens, apostrophes)
      // starting with a capital letter. It ends at the paren.
      // Before the name, there's either: start of section, or wargear text (containing •, ◦, digits+x).
      const beforeParen = trimmed.slice(0, parenStart)
      const nameStart = findNameStart(beforeParen)

      anchors.push({
        points,
        nameStart,
        nameEnd: parenStart,
        bodyStart: parenEnd,
      })
    }

    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i]!
      const name = trimmed.slice(a.nameStart, a.nameEnd).trim()
      const bodyEnd = i + 1 < anchors.length ? anchors[i + 1]!.nameStart : trimmed.length
      const body = trimmed.slice(a.bodyStart, bodyEnd)

      units.push(parseUnitBody(name, a.points, currentRole, body))
    }
  }

  return units
}

/**
 * Given text before a "(NNN Points)" paren, find where the unit name starts.
 *
 * Two shapes arrive here. BCP usually strips newlines before we store the text,
 * leaving one run-on string where gear and the next unit name are concatenated
 * directly ("bolterGrand Master"); the boundary there is a lowercase-to-uppercase
 * transition with no space, which within ordinary space-separated text only
 * occurs at that join. Some lists keep their newlines, and then the name simply
 * starts on its own line.
 *
 * The newline case must be checked FIRST. It used to fall through to the
 * transition scan, which finds nothing (the character before the name is "\n",
 * neither lowercase nor uppercase) and then to "first capital in the preceding
 * text" — so every unit name absorbed all the units before it and grew by one
 * unit each time. Those lists still stored parseStatus "ok": on prod
 * 2026-08-03 the winning Genestealer Cults list from Shark Tank Winter 2026 had
 * 21 units whose names ran to 400+ characters of concatenated wargear.
 *
 * Examples:
 *   "Hive Tyrant " → start at 0
 *   "  • Enhancements: Tremor SensesHyperadapted Raveners " → start at "Hyperadapted"
 *   "  • 1x Storm bolterGrand Master in Nemesis Dreadknight " → start at "Grand"
 *   "  • 1x Patriarch’s claws\n\nReductus Saboteur " → start at "Reductus"
 */
function findNameStart(beforeParen: string): number {
  let end = beforeParen.length
  while (end > 0 && /\s/.test(beforeParen[end - 1]!)) end--

  // A newline is an unambiguous boundary — a unit name begins its own line.
  const lastNewline = beforeParen.lastIndexOf('\n', Math.max(end - 1, 0))
  if (lastNewline !== -1 && lastNewline < end) {
    let pos = lastNewline + 1
    while (pos < end && /\s/.test(beforeParen[pos]!)) pos++
    return pos
  }

  // Find the LAST lowercase-to-uppercase transition (no space between).
  // This marks where gear text ends and unit name begins.
  let lastTransition = -1
  for (let i = 1; i < end; i++) {
    if (/[a-z]/.test(beforeParen[i - 1]!) && /[A-Z]/.test(beforeParen[i]!)) {
      lastTransition = i
    }
  }

  if (lastTransition !== -1) return lastTransition

  // No transition — the whole text is the name (or starts with uppercase).
  // Find the first uppercase character.
  let pos = 0
  while (pos < end && !/[A-Z]/.test(beforeParen[pos]!)) pos++
  return pos
}

function parseUnitBody(name: string, points: number, role: TTTUnit['role'], body: string): TTTUnit {
  const wargear: string[] = []
  let enhancement: string | undefined
  let isWarlord = false

  // Split on bullet chars: \u2022 (•) and \u25E6 (◦)
  const bulletParts = body.split(/[\u2022\u25E6]/)

  for (const raw of bulletParts) {
    const item = raw.trim()
    if (!item) continue

    if (/^Warlord$/i.test(item)) {
      isWarlord = true
      continue
    }

    const enhMatch = item.match(/^Enhancements?:\s*(.+)/i)
    if (enhMatch) {
      enhancement = enhMatch[1]!.trim()
      continue
    }

    // Extract gear entries
    extractGear(item, wargear)
  }

  // Handle gear lines without bullets
  if (bulletParts.length <= 1 && body.trim()) {
    extractGear(body, wargear)
  }

  return {
    name,
    role,
    models: 1,
    points,
    wargear,
    ...(enhancement ? { enhancement } : {}),
    ...(isWarlord ? { isWarlord: true } : {}),
  }
}

/**
 * Extract wargear from text containing "Nx GearName" patterns.
 */
function extractGear(text: string, wargear: string[]): void {
  const parts = text.split(/(?=\d+x\s)/)
  for (const part of parts) {
    const m = part.trim().match(/^(\d+)x\s+(.+)/)
    if (m) {
      const gearName = m[2]!.trim()
      if (gearName && !wargear.includes(gearName)) {
        wargear.push(gearName)
      }
    }
  }
}
