import type {
  CardData,
  EnhancementCardData,
  RuleCardData,
  StratagemCardData,
  UnitCardData,
} from '../components/cards/types'

// ── BrainNode type ────────────────────────────────────────────────────────────

export interface BrainNode {
  id: string
  title: string
  summary: string
  content: string
  layer: string
  category: string
  factionId?: string
  phase?: string
  parentUnit?: string
  datasheetId?: string
  detachmentId?: string
  sources: any[]
  keywords: string[]
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/** Parse "M6" T4 Sv3+ W2 Ld6+ OC1" style stat line */
function parseStatLine(content: string): UnitCardData['stats'] {
  const stats = { move: '-', toughness: '-', save: '-', wounds: '-', leadership: '-', oc: '-' }
  const m = content.match(
    /M(\d+["\u201d\u2033]?)\s+T(\d+)\s+Sv(\d+\+)\s+W(\d+)\s+Ld(\d+\+)\s+OC(\d+)/,
  )
  if (m) {
    stats.move = m[1]!
    stats.toughness = m[2]!
    stats.save = m[3]!
    stats.wounds = m[4]!
    stats.leadership = m[5]!
    stats.oc = m[6]!
  }
  return stats
}

/** Extract lines from a named section in content */
function parseWeaponSection(content: string, section: string): string[] {
  const sectionIdx = content.indexOf(section)
  if (sectionIdx === -1) return []
  const after = content.slice(sectionIdx + section.length)
  const nextSection = after.search(/Ranged weapons|Melee weapons|Abilities|Keywords/i)
  const block = nextSection === -1 ? after : after.slice(0, nextSection)
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/** Parse WHEN/TARGET/EFFECT/CP/Phase fields from stratagem content */
function parseStratagemFields(content: string) {
  const extract = (label: string) => {
    const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]+:\\*\\*|$)`, 'i')
    const m = content.match(re)
    return m ? m[1]!.trim() : ''
  }

  const cpMatch = content.match(/\*\*CP:\*\*\s*(\d+)/)
  const phaseMatch = content.match(/\*\*Phase:\*\*\s*([^\n*]+)/)

  return {
    when: extract('WHEN'),
    target: extract('TARGET'),
    effect: extract('EFFECT'),
    cpCost: cpMatch ? cpMatch[1]! : '1',
    phase: phaseMatch ? phaseMatch[1]!.trim() : '',
  }
}

/** Parse cost from enhancement content */
function parseCost(content: string): string {
  const m = content.match(/\*\*Cost:\*\*\s*([^\n]+)/)
  return m ? m[1]!.trim() : ''
}

/** Extract restriction line (e.g. "ADEPTUS ASTARTES model only") from content */
function parseRestriction(content: string): string | undefined {
  // Look for a line containing "model only" or "models only" or "UNIT TYPE only"
  const lines = content.split('\n')
  const restrictLine = lines.find((l) => /model[s]? only/i.test(l))
  if (restrictLine) return restrictLine.trim()
  return undefined
}

/** Parse ALL-CAPS heading sub-rules from content */
function parseSubRules(content: string): { name: string; description: string }[] | undefined {
  // ALL-CAPS line (2+ words) treated as a sub-rule heading
  const ALL_CAPS_LINE = /^([A-Z][A-Z\s''-]{2,})$/
  const lines = content.split('\n')
  const subRules: { name: string; description: string }[] = []
  let current: { name: string; descLines: string[] } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (ALL_CAPS_LINE.test(trimmed)) {
      if (current) {
        subRules.push({ name: current.name, description: current.descLines.join('\n').trim() })
      }
      current = { name: trimmed, descLines: [] }
    } else if (current) {
      current.descLines.push(trimmed)
    }
  }

  if (current) {
    subRules.push({ name: current.name, description: current.descLines.join('\n').trim() })
  }

  return subRules.length > 0 ? subRules : undefined
}

// ── Builders ──────────────────────────────────────────────────────────────────

function buildUnitData(node: BrainNode): UnitCardData {
  const content = node.content || ''
  const stats = parseStatLine(content)
  const rangedLines = parseWeaponSection(content, 'Ranged weapons')
  const meleeLines = parseWeaponSection(content, 'Melee weapons')

  return {
    id: node.id,
    name: node.title,
    factionId: node.factionId || '',
    role: node.layer,
    derivedType: content.match(/\*\*Derived Type:\*\*\s*(.+)/)?.[1]?.trim() || node.layer,
    points: '',
    stats: (() => {
      const fnpKw = (node.keywords || []).find((k) => /^fnp-\d$/.test(k))
      return fnpKw ? { ...stats, fnp: `${fnpKw.replace('fnp-', '')}++` } : stats
    })(),
    rangedWeapons:
      rangedLines.length > 0
        ? [
            {
              name: rangedLines[0] || '',
              range: '',
              attacks: '',
              skill: '',
              strength: '',
              ap: '',
              damage: '',
              abilities: rangedLines.slice(1).join(', '),
            },
          ]
        : [],
    meleeWeapons:
      meleeLines.length > 0
        ? [
            {
              name: meleeLines[0] || '',
              range: 'Melee',
              attacks: '',
              skill: '',
              strength: '',
              ap: '',
              damage: '',
              abilities: meleeLines.slice(1).join(', '),
            },
          ]
        : [],
    abilities: [],
    coreAbilities: [],
    keywords: node.keywords || [],
    factionKeywords: [],
    composition: '',
    loadout: '',
    leaders: [],
  }
}

function buildStratagemData(node: BrainNode): StratagemCardData {
  const source = node.content || node.summary || ''
  const { when, target, effect, cpCost, phase } = parseStratagemFields(source)

  return {
    id: node.id,
    name: node.title,
    type: 'Stratagem',
    cpCost,
    turn: '',
    phase: phase || node.phase || '',
    when,
    target,
    effect: effect || node.summary,
    detachmentName: '',
    factionId: node.factionId || '',
  }
}

function buildEnhancementData(node: BrainNode): EnhancementCardData {
  const content = node.content || ''
  const cost = parseCost(content)
  const restriction = parseRestriction(content)

  // Strip the leading "**Name** (Npts)" header from MFM nodes
  // (server/lib/parsers/mfm-detachments.ts buildEnhancementNode). The card
  // surfaces name and cost separately; leaving the header in the description
  // shows literal markdown asterisks.
  const description = (content || node.summary || '')
    .replace(/^\*\*[^*]+\*\*\s*\(\d+\s*pts?\)\s*\n?/, '')
    .trim()

  return {
    id: node.id,
    name: node.title,
    cost,
    description,
    restriction,
    detachmentName: '',
    factionId: node.factionId || '',
  }
}

function buildRuleData(node: BrainNode, isArmyRule: boolean): RuleCardData {
  const content = node.content || node.summary || ''
  const subRules = isArmyRule ? parseSubRules(content) : undefined

  return {
    id: node.id,
    name: node.title,
    description: content,
    factionId: node.factionId || '',
    detachmentName: '',
    isArmyRule,
    subRules,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Categories that don't map to a card type — return null */
const NULL_CATEGORIES = new Set(['weapon', 'unit-ability', 'core-mechanic'])

/**
 * Converts a brain API response node into a typed CardData object for rendering,
 * or returns null for node categories that don't have a dedicated card type.
 */
export function buildCardData(node: BrainNode): CardData | null {
  if (NULL_CATEGORIES.has(node.category)) return null

  switch (node.category) {
    case 'datasheet':
      return { type: 'unit', data: buildUnitData(node) }

    case 'stratagem':
      return { type: 'stratagem', data: buildStratagemData(node) }

    case 'enhancement':
      return { type: 'enhancement', data: buildEnhancementData(node) }

    case 'faction-ability':
      return {
        type: 'rule',
        data: buildRuleData(node, !node.detachmentId),
      }

    case 'detachment-rule':
      return { type: 'rule', data: buildRuleData(node, false) }

    default:
      return null
  }
}
