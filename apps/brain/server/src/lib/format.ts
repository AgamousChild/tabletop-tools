import type { Node } from './model'
import { stripFlavorText } from './strip-flavor'

// ── Impact tier ordering ─────────────────────────────────────────────────────

const IMPACT_ORDER = [
  'faction-ability',
  'detachment-rule',
  'stratagem',
  'enhancement',
  'leader-ability',   // virtual bucket for leader unit-abilities
  'unit-ability',
  'weapon',
  'datasheet',
  'other',
] as const

type ImpactTier = typeof IMPACT_ORDER[number]

interface Entry {
  node: Node
  tier: ImpactTier
  parent: string
  content: string
}

/** Determine the impact tier for a node, splitting unit-ability into leader vs regular. */
function getTier(node: Node): ImpactTier {
  switch (node.category) {
    case 'faction-ability':  return 'faction-ability'
    case 'detachment-rule':  return 'detachment-rule'
    case 'stratagem':        return 'stratagem'
    case 'enhancement':      return 'enhancement'
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
    case 'weapon':    return 'weapon'
    case 'datasheet': return 'datasheet'
    default:          return 'other'
  }
}

/** Human-readable heading for each tier. */
const TIER_HEADING: Record<ImpactTier, string> = {
  'faction-ability':  'Army-Wide Abilities',
  'detachment-rule':  'Detachment Rules',
  'stratagem':        'Stratagems',
  'enhancement':      'Enhancements',
  'leader-ability':   'Leader Abilities (affect attached unit)',
  'unit-ability':     'Unit Abilities',
  'weapon':           'Weapons',
  'datasheet':        'Datasheets',
  'other':            'Other Rules',
}

// ── formatConversationalAnswer ───────────────────────────────────────────────

/**
 * Format nodes as conversational prose paragraphs grouped by impact tier.
 * Each group is a short paragraph, not a bullet list.
 * A structured Reference section follows all prose sections.
 */
export function formatConversationalAnswer(
  question: string,
  nodes: Node[],
  parentMap: Map<string, string>,
): string {
  // Build entries with stripped content
  const entries: Entry[] = nodes.map(node => {
    const parent = parentMap.get(node.id) ?? ''
    const rawContent = node.content || node.summary
    const stripped = stripFlavorText(rawContent)
    return { node, tier: getTier(node), parent, content: stripped }
  })

  // Group by tier
  const groups = new Map<ImpactTier, Entry[]>()
  for (const tier of IMPACT_ORDER) {
    groups.set(tier, [])
  }
  for (const entry of entries) {
    groups.get(entry.tier)!.push(entry)
  }

  const parts: string[] = []
  parts.push(`Results for: "${question}"\n`)

  // Prose sections per tier
  for (const tier of IMPACT_ORDER) {
    const tierEntries = groups.get(tier)!
    if (tierEntries.length === 0) continue

    const heading = TIER_HEADING[tier]
    parts.push(`### ${heading}`)

    // Build prose paragraph: intro sentence + one sentence per entry
    const intro = buildIntroSentence(tier, tierEntries.length)
    const sentences: string[] = [intro]

    for (const e of tierEntries) {
      sentences.push(buildEntrySentence(e))
    }

    parts.push(sentences.join(' '))
    parts.push('')
  }

  // Reference section
  parts.push('## Reference')
  parts.push('')
  for (const entry of entries) {
    const { node, parent } = entry
    const unitLine = parent ? `\n  - Unit: ${parent}` : ''
    const factionLine = node.factionId ? `\n  - Faction: ${node.factionId}` : ''
    const sourceLine = node.sources.length > 0
      ? `\n  - Source: ${node.sources.map(s => `${s.title}${s.page ? `, p.${s.page}` : ''}`).join('; ')}`
      : ''
    const summaryLine = `\n  - Summary: ${node.summary}`
    parts.push(`**${node.title}** [${node.category}]${unitLine}${factionLine}${summaryLine}${sourceLine}`)
  }
  parts.push('')

  // Footer
  parts.push(`*${nodes.length} total result${nodes.length !== 1 ? 's' : ''} from the knowledge graph. Source: Wahapedia 10th Edition, Core Rules.*`)

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
      return count === 1
        ? 'One enhancement applies.'
        : `${countWord} enhancements apply.`
    case 'leader-ability':
      return count === 1
        ? 'One leader ability affects attached units.'
        : `${countWord} leader abilities affect attached units.`
    case 'unit-ability':
      return count === 1
        ? 'One unit ability is relevant.'
        : `${countWord} unit abilities are relevant.`
    case 'weapon':
      return count === 1
        ? 'One weapon profile matches.'
        : `${countWord} weapon profiles match.`
    case 'datasheet':
      return count === 1
        ? 'One datasheet is referenced.'
        : `${countWord} datasheets are referenced.`
    case 'other':
      return count === 1
        ? 'One additional rule applies.'
        : `${countWord} additional rules apply.`
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
  const contentPart = content
    ? ` ${content.endsWith('.') ? content : `${content}.`}`
    : '.'

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
 */
export function assembleContext(
  primaryNodes: Node[],
  connectedNodes: Node[],
  parentMap: Map<string, string>,
  subfaction?: string,
): string {
  const parts: string[] = []

  // Primary results first
  for (const node of primaryNodes) {
    parts.push(`## ${node.title} [${node.layer}/${node.category}]`)
    parts.push(node.content)
    if (node.sources.length > 0) {
      const srcText = node.sources
        .map(s => `${s.title}${s.page ? `, p.${s.page}` : ''}`)
        .join('; ')
      parts.push(`(Source: ${srcText})`)
    }
    parts.push('')
  }

  // Connected nodes — when subfaction is detected, split into two hard sections:
  // SECTION 1: subfaction-specific content only
  // SECTION 2: generic content (available to all chapters/variants)
  // Within each section, group by category in impact order.
  if (connectedNodes.length > 0) {
    let sfSpecific: Node[]
    let generic: Node[]

    if (subfaction) {
      sfSpecific = connectedNodes.filter(n => n.subfaction === subfaction)
      generic = connectedNodes.filter(n => n.subfaction !== subfaction)
    } else {
      sfSpecific = []
      generic = connectedNodes
    }

    const sfLabel = subfaction
      ? subfaction.split(' ').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')
      : null

    if (sfLabel && sfSpecific.length > 0) {
      parts.push(`========================================`)
      parts.push(`SECTION 1: ${sfLabel.toUpperCase()} SPECIFIC`)
      parts.push(`These rules are ONLY available to ${sfLabel}. Present these FIRST in your answer.`)
      parts.push(`========================================`)
      parts.push('')
      renderNodeGroup(sfSpecific, parentMap, parts)
    }

    if (generic.length > 0) {
      if (sfLabel) {
        parts.push(`========================================`)
        parts.push(`SECTION 2: GENERIC SPACE MARINES (available to all chapters including ${sfLabel})`)
        parts.push(`Present these AFTER the ${sfLabel}-specific results above.`)
        parts.push(`========================================`)
        parts.push('')
      } else {
        parts.push('--- Connected rules (ordered by impact: army-wide → detachment → leader/unit → weapon) ---')
        parts.push('')
      }
      renderNodeGroup(generic, parentMap, parts)
    }
  }

  return parts.join('\n')
}

/** Render a group of nodes into parts, grouped by category in impact order. */
function renderNodeGroup(nodes: Node[], parentMap: Map<string, string>, parts: string[]): void {
  const categories = [
    'faction-ability', 'detachment-rule', 'stratagem', 'enhancement',
    'unit-ability', 'weapon', 'datasheet',
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
        parts.push(`### ${n.title} [weapon, ON UNIT: ${parent || 'unknown unit'}${n.factionId ? `, ${n.factionId}` : ''}]`)
        parts.push(n.summary)
      } else if (cat === 'unit-ability') {
        parts.push(`### ${n.title} [unit-ability, ON UNIT: ${parent || 'unknown unit'}${n.factionId ? `, ${n.factionId}` : ''}]`)
        parts.push(n.content || n.summary)
      } else if (cat === 'datasheet') {
        parts.push(`### ${n.title} [datasheet${n.factionId ? `, ${n.factionId}` : ''}]`)
        parts.push(n.summary)
      } else if (cat === 'faction-ability') {
        parts.push(`### ${n.title} [faction-ability${n.factionId ? `, ${n.factionId}` : ''}${parent ? `, from detachment: ${parent}` : ''}]`)
        parts.push(n.content || n.summary)
      } else if (cat === 'stratagem' || cat === 'enhancement') {
        parts.push(`### ${n.title} [${cat}${n.factionId ? `, ${n.factionId}` : ''}${parent ? `, detachment: ${parent}` : ''}]`)
        parts.push(n.content || n.summary)
      } else if (cat === 'detachment-rule') {
        parts.push(`### ${n.title} [detachment-rule${n.factionId ? `, ${n.factionId}` : ''}]`)
        parts.push(n.content || n.summary)
      } else {
        parts.push(`### ${n.title} [${n.category}]`)
        parts.push(n.summary)
      }
      parts.push('')
    }
  }
}
