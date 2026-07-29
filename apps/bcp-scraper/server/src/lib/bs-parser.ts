import { normalizeFaction } from './faction-map'
import type { TTTPackage, TTTUnit } from './ttt-types'

function slugifyDetachment(name: string): string {
  return name
    .replace(/\s*\(.*\)/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function fail(text: string, error: string): TTTPackage {
  return {
    version: 1,
    parsedWith: 'battlescribe-v1',
    parseStatus: 'failed',
    parseError: error,
    meta: {
      name: '',
      totalPoints: 0,
      edition: '10th',
      battleSize: 'unknown',
      source: 'bcp-import',
    },
    list: { factionId: '', factionName: '', units: [] },
    exports: { rawSource: text },
  }
}

export function parseBattleScribe(text: string): TTTPackage {
  // --- Faction ---
  const factionMatch = text.match(/FACTION KEYWORD:\s*(.+?)(?:\+|$)/m)
  if (!factionMatch) return fail(text, 'No FACTION KEYWORD found')

  let factionName = factionMatch[1]!.trim()
  // "Chaos - Chaos Space Marines" → "Chaos Space Marines"
  if (factionName.includes(' - ')) {
    factionName = factionName.split(' - ').pop()!.trim()
  }
  const factionId = normalizeFaction(factionName)

  // --- Detachment ---
  const detachmentMatch = text.match(/DETACHMENT:\s*(.+?)(?:\s*\(|(?:\+)|$)/m)
  const detachmentName = detachmentMatch ? detachmentMatch[1]!.trim() : undefined
  const detachmentId = detachmentName ? slugifyDetachment(detachmentName) : undefined

  // --- Total points ---
  const pointsMatch = text.match(/TOTAL ARMY POINTS:\s*(\d+)\s*pts/i)
  const totalPoints = pointsMatch ? parseInt(pointsMatch[1]!, 10) : 0

  // --- Battle size ---
  let battleSize: TTTPackage['meta']['battleSize'] = 'unknown'
  if (totalPoints > 0) {
    if (totalPoints <= 500) battleSize = 'Combat Patrol'
    else if (totalPoints <= 1000) battleSize = 'Incursion'
    else if (totalPoints <= 2000) battleSize = 'Strike Force'
    else battleSize = 'Onslaught'
  }

  // --- Warlord ---
  const warlordMatch = text.match(/WARLORD:\s*(?:Char\d+:\s*)?(.+?)(?:\+|$)/m)
  const warlordName = warlordMatch ? warlordMatch[1]!.trim() : undefined

  // --- Enhancements (header-level) ---
  const enhancementMap = new Map<string, string>() // unit name → enhancement name
  const enhRegex = /ENHANCEMENT:\s*(.+?)\s*\(on\s+(?:Char\d+:\s*)?(.+?)\)/g
  let enhMatch: RegExpExecArray | null
  while ((enhMatch = enhRegex.exec(text)) !== null) {
    const enhName = enhMatch[1]!.trim()
    const unitName = enhMatch[2]!.trim()
    enhancementMap.set(unitName, enhName)
  }

  // --- Units ---
  // A unit ends at the next "CharN:", a line break, or end of input. The line
  // break alternative is load-bearing: real BCP exports are newline-separated,
  // and without it the lookahead can only ever be satisfied by units running
  // together on a single line (the shape of the flattened test fixtures), so
  // every real multi-line list parsed to zero units.
  // Points suffix is `pts` or `points`, with or without a leading space.
  const unitRegex =
    /(?:Char\d+:\s*)?(\d+)x\s+(.+?)\s+\((\d+)\s*(?:pts|points)\)(?::\s*(.+?))?(?=[ \t]*(?:Char\d+:|\r?\n|$))/gi
  const units: TTTUnit[] = []
  let unitMatch: RegExpExecArray | null
  while ((unitMatch = unitRegex.exec(text)) !== null) {
    const models = parseInt(unitMatch[1]!, 10)
    const name = unitMatch[2]!.trim()
    const points = parseInt(unitMatch[3]!, 10)
    const gearStr = unitMatch[4]?.trim() ?? ''

    const gearItems = gearStr
      ? gearStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []

    // Detect warlord from wargear list
    const isWarlord = gearItems.includes('Warlord') || name === warlordName
    const wargear = gearItems.filter((g) => g !== 'Warlord')

    // Detect enhancement — either from header map or from wargear matching header enhancement
    let enhancement: string | undefined
    if (enhancementMap.has(name)) {
      enhancement = enhancementMap.get(name)
      // Also remove enhancement from wargear if present
      const idx = wargear.indexOf(enhancement!)
      if (idx !== -1) wargear.splice(idx, 1)
    }

    // Role: if this unit is the warlord, it's a Character; otherwise unknown
    const role: TTTUnit['role'] = isWarlord ? 'Character' : 'unknown'

    units.push({
      name,
      role,
      models,
      points,
      wargear,
      ...(enhancement ? { enhancement } : {}),
      ...(isWarlord ? { isWarlord: true } : {}),
    })
  }

  if (units.length === 0) return fail(text, 'No units found')

  // --- Name ---
  const name = `${factionName} ${totalPoints}pts`

  return {
    version: 1,
    parsedWith: 'battlescribe-v1',
    parseStatus: 'ok',
    meta: { name, totalPoints, edition: '10th', battleSize, source: 'bcp-import' },
    list: {
      factionId,
      factionName,
      ...(detachmentId ? { detachmentId } : {}),
      ...(detachmentName ? { detachmentName } : {}),
      units,
    },
    exports: { rawSource: text },
  }
}
