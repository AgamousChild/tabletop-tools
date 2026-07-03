import type { Node, Source } from './model'
import { stripFlavorText } from './strip-flavor'

// ── Source attribution ─────────────────────────────────────────────────────
//
// Per-node attribution line for the LLM context. The brain pulls from multiple
// upstream sources (Wahapedia for 10e, BSData + MFM for 11e). The model needs
// to know which fact came from where so it can correctly cite editions — the
// answer "the unit costs 200 points" is wrong without "per MFM 11th edition
// costing" because Wahapedia still shows 10e points.

const SOURCE_LABELS: Record<string, string> = {
  wahapedia: 'Wahapedia',
  bsdata: 'BSData',
  pdf: 'Core Rules PDF',
  faq: 'GW FAQ',
  errata: 'GW Errata',
  'balance-dataslate': 'GW Balance Dataslate',
  reddit: 'Reddit',
  youtube: 'YouTube',
  manual: 'manual entry',
}

/**
 * Build a one-line source attribution sentence for a node. Combines the
 * upstream source label with the edition tag so the LLM can cite both.
 * Examples:
 *   "Source: Wahapedia 10th edition"
 *   "Source: BSData 11th edition — MFM costing"
 *   "Source: Core Rules PDF, p.42"
 */
export function buildSourceAttribution(node: { edition?: string; sources: Source[] }): string {
  const primary = node.sources[0]
  if (!primary) return ''
  const label = SOURCE_LABELS[primary.type] ?? primary.type
  const editionPart = node.edition ? ` ${node.edition} edition` : ''
  const sourceTitle = primary.title && primary.title !== label ? ` — ${primary.title}` : ''
  const pagePart = primary.page ? `, p.${primary.page}` : ''
  return `Source: ${label}${editionPart}${sourceTitle}${pagePart}`
}

// ── Impact tier ordering ─────────────────────────────────────────────────────

const IMPACT_ORDER = [
  'faction-ability',
  'detachment-rule',
  'stratagem',
  'enhancement',
  'leader-ability', // virtual bucket for leader unit-abilities
  'unit-ability',
  'weapon',
  'datasheet',
  'other',
] as const

type ImpactTier = (typeof IMPACT_ORDER)[number]

interface Entry {
  node: Node
  tier: ImpactTier
  parent: string
  content: string
}

/** Determine the impact tier for a node, splitting unit-ability into leader vs regular. */
function getTier(node: Node): ImpactTier {
  switch (node.category) {
    case 'faction-ability':
      return 'faction-ability'
    case 'detachment-rule':
      return 'detachment-rule'
    case 'stratagem':
      return 'stratagem'
    case 'enhancement':
      return 'enhancement'
    case 'unit-ability': {
      const text = (node.content || '').toLowerCase()
      if (
        text.includes('leading a unit') ||
        text.includes('this model is leading') ||
        text.includes("model's unit")
      ) {
        return 'leader-ability'
      }
      return 'unit-ability'
    }
    case 'weapon':
      return 'weapon'
    case 'datasheet':
      return 'datasheet'
    default:
      return 'other'
  }
}

/** Human-readable heading for each tier. */
const TIER_HEADING: Record<ImpactTier, string> = {
  'faction-ability': 'Army-Wide Abilities',
  'detachment-rule': 'Detachment Rules',
  stratagem: 'Stratagems',
  enhancement: 'Enhancements',
  'leader-ability': 'Leader Abilities (affect attached unit)',
  'unit-ability': 'Unit Abilities',
  weapon: 'Weapons',
  datasheet: 'Datasheets',
  other: 'Other Rules',
}

// ── formatConversationalAnswer ───────────────────────────────────────────────

/**
 * Format nodes as conversational prose paragraphs grouped by impact tier.
 * Each group is a short paragraph, not a bullet list.
 * A structured Reference section follows all prose sections.
 *
 * The old chapter-split path (SM-specific vs generic-SM sections keyed on
 * `Node.subfaction`) was removed with the field in PR D of the scalar-to-ref
 * refactor. Chapter identity is now `factionId`; SM chapter queries expand to
 * the parent shared pool via `dim_subfaction` before nodes reach this layer.
 */
export function formatConversationalAnswer(
  question: string,
  nodes: Node[],
  parentMap: Map<string, string>,
  combos?: string[],
): string {
  // Build entries with stripped content
  const allEntries: Entry[] = nodes.map((node) => {
    const parent = parentMap.get(node.id) ?? ''
    const rawContent = node.content || node.summary
    const stripped = stripFlavorText(rawContent)
    return { node, tier: getTier(node), parent, content: stripped }
  })

  const parts: string[] = []
  parts.push(`Results for: "${question}"\n`)
  if (combos && combos.length > 0) {
    parts.push(formatComboSection(combos))
    parts.push('')
  }
  parts.push(formatEntriesAsProse(allEntries))
  parts.push('')
  parts.push(formatReferenceSection(allEntries))
  parts.push(
    `\n*${nodes.length} total result${nodes.length !== 1 ? 's' : ''} from the knowledge graph. Source: Wahapedia 10th Edition, Core Rules.*`,
  )
  return parts.join('\n')
}

/** Format a list of entries as prose paragraphs grouped by impact tier. */
function formatEntriesAsProse(entries: Entry[]): string {
  const groups = new Map<ImpactTier, Entry[]>()
  for (const tier of IMPACT_ORDER) groups.set(tier, [])
  for (const entry of entries) groups.get(entry.tier)!.push(entry)

  const parts: string[] = []
  for (const tier of IMPACT_ORDER) {
    const tierEntries = groups.get(tier)!
    if (tierEntries.length === 0) continue

    parts.push(`### ${TIER_HEADING[tier]}`)
    const intro = buildIntroSentence(tier, tierEntries.length)
    const sentences = [intro, ...tierEntries.map((e) => buildEntrySentence(e))]
    parts.push(sentences.join(' '))
    parts.push('')
  }
  return parts.join('\n')
}

/** Format competitive combo section — capped at 10 most relevant. */
function formatComboSection(combos: string[]): string {
  const MAX_COMBOS = 10
  const shown = combos.slice(0, MAX_COMBOS)
  const parts: string[] = ['## Competitive Combos', '']
  for (const combo of shown) {
    parts.push(`- ${combo}`)
  }
  if (combos.length > MAX_COMBOS) {
    parts.push(`- ...and ${combos.length - MAX_COMBOS} more combos`)
  }
  parts.push('')
  parts.push('*Note: In 11th edition, only one stratagem per unit per phase is allowed.*')
  return parts.join('\n')
}

/** Format structured reference section from entries. */
function formatReferenceSection(entries: Entry[]): string {
  const parts: string[] = ['## Reference', '']
  for (const { node, parent } of entries) {
    const unitLine = parent ? `\n  - Unit: ${parent}` : ''
    const factionLine = node.factionId ? `\n  - Faction: ${node.factionId}` : ''
    const sourceLine =
      node.sources.length > 0
        ? `\n  - Source: ${node.sources.map((s) => `${s.title}${s.page ? `, p.${s.page}` : ''}`).join('; ')}`
        : ''
    const summaryLine = `\n  - Summary: ${node.summary}`
    parts.push(
      `**${node.title}** [${node.category}]${unitLine}${factionLine}${summaryLine}${sourceLine}`,
    )
  }
  return parts.join('\n')
}

function buildIntroSentence(tier: ImpactTier, count: number): string {
  const countWord = count === 1 ? 'One' : `${count}`
  switch (tier) {
    case 'faction-ability':
      return count === 1
        ? 'One army-wide ability interacts with this mechanic.'
        : `${countWord} army-wide abilities interact with this mechanic.`
    case 'detachment-rule':
      return count === 1
        ? 'One detachment rule is relevant.'
        : `${countWord} detachment rules are relevant.`
    case 'stratagem':
      return count === 1
        ? 'One stratagem can be used here.'
        : `${countWord} stratagems can be used here.`
    case 'enhancement':
      return count === 1 ? 'One enhancement applies.' : `${countWord} enhancements apply.`
    case 'leader-ability':
      return count === 1
        ? 'One leader ability affects attached units.'
        : `${countWord} leader abilities affect attached units.`
    case 'unit-ability':
      return count === 1
        ? 'One unit ability is relevant.'
        : `${countWord} unit abilities are relevant.`
    case 'weapon':
      return count === 1 ? 'One weapon profile matches.' : `${countWord} weapon profiles match.`
    case 'datasheet':
      return count === 1
        ? 'One datasheet is referenced.'
        : `${countWord} datasheets are referenced.`
    case 'other':
      return count === 1 ? 'One additional rule applies.' : `${countWord} additional rules apply.`
  }
}

function buildEntrySentence(entry: Entry): string {
  const { node, parent, content, tier } = entry
  const factionPart = node.factionId ? ` (${node.factionId})` : ''
  const parentPart = parent
    ? tier === 'weapon'
      ? `The ${node.title} on ${parent}`
      : `${node.title} on ${parent}`
    : node.title

  // Build the sentence: "Title (faction) [on parent]: content."
  const contentPart = content ? ` ${content.endsWith('.') ? content : `${content}.`}` : '.'

  if (parent) {
    return `${parentPart}${factionPart}:${contentPart}`
  }
  return `${node.title}${factionPart}:${contentPart}`
}

// ── assembleContext ──────────────────────────────────────────────────────────

/**
 * Assemble node content into a structured context string for the LLM.
 * Primary results first with full content + source attribution.
 * Connected nodes grouped by category with impact ordering.
 *
 * The old chapter split (SM chapter-specific vs generic-SM sections keyed on
 * `Node.subfaction`) was removed with the field in PR D of the scalar-to-ref
 * refactor. Chapter-scoped queries now expand via `dim_subfaction` upstream,
 * and every node here carries a real `factionId`.
 */
export function assembleContext(
  primaryNodes: Node[],
  connectedNodes: Node[],
  parentMap: Map<string, string>,
): string {
  const parts: string[] = []

  // Primary results first
  for (const node of primaryNodes) {
    parts.push(`## ${node.title} [${node.layer}/${node.category}]`)
    parts.push(node.content)
    // Per-node source attribution — the LLM needs to know edition + upstream
    // source so it can correctly cite 10e Wahapedia vs 11e BSData/MFM.
    parts.push(`(${buildSourceAttribution(node)})`)
    parts.push('')
  }

  if (connectedNodes.length > 0) {
    parts.push(
      '--- Connected rules (ordered by impact: army-wide → detachment → leader/unit → weapon) ---',
    )
    parts.push('')
    renderNodeGroup(connectedNodes, parentMap, parts)
  }

  return parts.join('\n')
}

/** Render a group of nodes into parts, grouped by category in impact order. */
function renderNodeGroup(nodes: Node[], parentMap: Map<string, string>, parts: string[]): void {
  const categories = [
    'faction-ability',
    'detachment-rule',
    'stratagem',
    'enhancement',
    'unit-ability',
    'weapon',
    'datasheet',
  ] as const

  const groups: Record<string, Node[]> = {}
  for (const cat of categories) groups[cat] = []
  groups['other'] = []

  for (const n of nodes) {
    const key = groups[n.category] !== undefined ? n.category : 'other'
    groups[key]!.push(n)
  }

  for (const cat of [...categories, 'other' as const]) {
    const catNodes = groups[cat]!
    if (catNodes.length === 0) continue

    for (const n of catNodes) {
      const parent = parentMap.get(n.id)

      if (cat === 'weapon') {
        parts.push(
          `### ${n.title} [weapon, ON UNIT: ${parent || 'unknown unit'}${n.factionId ? `, ${n.factionId}` : ''}]`,
        )
        parts.push(n.summary)
      } else if (cat === 'unit-ability') {
        parts.push(
          `### ${n.title} [unit-ability, ON UNIT: ${parent || 'unknown unit'}${n.factionId ? `, ${n.factionId}` : ''}]`,
        )
        parts.push(n.content || n.summary)
      } else if (cat === 'datasheet') {
        parts.push(`### ${n.title} [datasheet${n.factionId ? `, ${n.factionId}` : ''}]`)
        parts.push(n.summary)
      } else if (cat === 'faction-ability') {
        parts.push(
          `### ${n.title} [faction-ability${n.factionId ? `, ${n.factionId}` : ''}${parent ? `, from detachment: ${parent}` : ''}]`,
        )
        parts.push(n.content || n.summary)
      } else if (cat === 'stratagem' || cat === 'enhancement') {
        parts.push(
          `### ${n.title} [${cat}${n.factionId ? `, ${n.factionId}` : ''}${parent ? `, detachment: ${parent}` : ''}]`,
        )
        parts.push(n.content || n.summary)
      } else if (cat === 'detachment-rule') {
        parts.push(`### ${n.title} [detachment-rule${n.factionId ? `, ${n.factionId}` : ''}]`)
        parts.push(n.content || n.summary)
      } else {
        parts.push(`### ${n.title} [${n.category}]`)
        parts.push(n.summary)
      }
      // Per-node source attribution so the LLM cites edition + upstream.
      const attribution = buildSourceAttribution(n)
      if (attribution) parts.push(`(${attribution})`)
      parts.push('')
    }
  }
}
