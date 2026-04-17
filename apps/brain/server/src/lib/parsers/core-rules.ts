import type { Node, NodeRef, Source, NodeCategory, GamePhase } from '../model'
import { coreId } from '../slugify'

/** Map sections to their page ranges in the core rules PDF (from TOC markers). */
const PAGE_RANGES: Array<{ pattern: RegExp; startPage: number; endPage: number }> = [
  { pattern: /core concept|model|unit|dice|roll|re-roll|modif|sequen/i, startPage: 5, endPage: 9 },
  { pattern: /command phase/i, startPage: 10, endPage: 11 },
  { pattern: /movement phase|move|advance|fall back|reinforcement/i, startPage: 12, endPage: 17 },
  { pattern: /shooting phase|ranged|hit roll|wound roll|allocat|saving|damage|mortal|feel no pain/i, startPage: 18, endPage: 27 },
  { pattern: /charge phase|charge roll/i, startPage: 28, endPage: 29 },
  { pattern: /fight phase|pile in|consolidat|melee|fight/i, startPage: 30, endPage: 36 },
  { pattern: /datasheet|ability|leader|transport|aircraft|deadly demise|deep strike|firing deck|infiltrat|lone operative|scouts|stealth|feel no pain|invulnerable|sustained|lethal|devastating|hazardous|blast|torrent|twin-linked|anti-|melta|pistol|rapid fire|heavy|assault|ignores cover|indirect fire|one shot|precision|psychic/i, startPage: 37, endPage: 39 },
  { pattern: /strategic reserve|stratagem|command re-roll|epic deed|insane bravery|counter-offensive|go to ground|smoke screen|heroic intervention|rapid ingress|fire overwatch|grenade/i, startPage: 41, endPage: 43 },
  { pattern: /terrain|ruin|obstacle|hill|wall|crater|cover|benefit of cover|breachable/i, startPage: 44, endPage: 52 },
  { pattern: /muster|army|detachment|warlord|point/i, startPage: 55, endPage: 56 },
  { pattern: /mission|deploy|objective|victory|game size|battle round|end of game/i, startPage: 57, endPage: 60 },
]

function detectPageNumber(heading: string, content: string): number | undefined {
  const text = `${heading} ${content}`
  for (const { pattern, startPage } of PAGE_RANGES) {
    if (pattern.test(text)) return startPage
  }
  return undefined
}

/** Map of heading keywords to game phases. */
const PHASE_KEYWORDS: Array<{ pattern: string; phase: GamePhase }> = [
  { pattern: 'COMMAND PHASE', phase: 'command' },
  { pattern: 'MOVEMENT PHASE', phase: 'movement' },
  { pattern: 'SHOOTING PHASE', phase: 'shooting' },
  { pattern: 'CHARGE PHASE', phase: 'charge' },
  { pattern: 'FIGHT PHASE', phase: 'fight' },
]

/** Detect the phase from a heading string. */
function detectPhase(heading: string): GamePhase | undefined {
  const upper = heading.toUpperCase()
  for (const { pattern, phase } of PHASE_KEYWORDS) {
    if (upper.includes(pattern)) return phase
  }
  return undefined
}

/** Detect category from heading and content. */
function detectCategory(heading: string): NodeCategory {
  const upper = heading.toUpperCase()
  if (upper.includes('TERRAIN') || upper.includes('COVER') || upper.includes('RUINS')) return 'terrain'
  if (upper.includes('MUSTER') || upper.includes('ARMY') || upper.includes('DETACHMENT')) return 'army-construction'
  if (upper.includes('MISSION') || upper.includes('OBJECTIVE') || upper.includes('DEPLOYMENT')) return 'mission'
  if (upper.includes('KEYWORD')) return 'keyword'
  if (upper.includes('STRATAGEM')) return 'stratagem'
  if (PHASE_KEYWORDS.some(p => upper.includes(p.pattern))) return 'phase-sequence'
  return 'core-mechanic'
}

/** Extract keywords from content text. */
function extractKeywords(title: string, content: string): string[] {
  const combined = `${title} ${content}`.toLowerCase()
  const gameTerms = [
    'wound', 'hit', 'save', 'strength', 'toughness', 'leadership', 'movement',
    'charge', 'shoot', 'fight', 'advance', 'fall back', 'overwatch', 'morale',
    'battle-shock', 'deep strike', 'infiltrate', 'stratagem', 'command',
    'engagement range', 'coherency', 'visibility', 'cover', 'terrain',
    'objective', 'deployment', 'roll', 'modifier', 'ability', 'keyword',
    'damage', 'mortal wound', 'feel no pain', 'invulnerable', 'transport',
    'aircraft', 'vehicle', 'monster', 'character', 'infantry', 'leader',
    'attached', 'bodyguard', 'lone operative', 'deadly demise', 'scouts',
    'stealth', 'firing deck', 'lethal hits', 'sustained hits', 'devastating wounds',
    'hazardous', 'blast', 'torrent', 'twin-linked', 'anti', 'melta',
    'pistol', 'rapid fire', 'heavy', 'assault', 'ignores cover',
  ]
  return gameTerms.filter(term => combined.includes(term))
}

/** Generate a 1-2 sentence summary from the content. */
function generateSummary(title: string, content: string): string {
  // Strip markdown formatting for summary
  const clean = content
    .replace(/\*\*[A-Z]+:\*\*/g, '')  // Remove **WHEN:** etc
    .replace(/^- .*/gm, '')            // Remove bullet points
    .replace(/\n+/g, ' ')
    .trim()

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.length > 10)
  if (sentences.length === 0) return title
  const first = sentences[0]!.trim()
  if (first.length > 150 || sentences.length === 1) {
    return first.length > 200 ? first.substring(0, 197) + '...' : first
  }
  const second = sentences[1]!.trim()
  const combined = `${first} ${second}`
  return combined.length > 200 ? combined.substring(0, 197) + '...' : combined
}

export interface ParseResult {
  nodes: Node[]
  refs: NodeRef[]
}

/** A section parsed from structured markdown with heading depth. */
interface Section {
  heading: string
  depth: number       // 2 = ##, 3 = ###, 4 = ####, 5 = #####
  body: string
  lineIndex: number   // for ordering
}

/** Parse sections from multi-level ## / ### / #### / ##### formatted markdown. */
function parseFormattedSections(text: string): Section[] {
  const sections: Section[] = []
  const lines = text.split('\n')
  let currentHeading = ''
  let currentDepth = 0
  let currentBody: string[] = []
  let currentLineIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const headingMatch = line.match(/^(#{2,5})\s+(.+)$/)
    if (headingMatch) {
      // Flush previous section
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          depth: currentDepth,
          body: currentBody.join('\n').trim(),
          lineIndex: currentLineIndex,
        })
      }
      currentDepth = headingMatch[1]!.length
      currentHeading = headingMatch[2]!.trim()
      currentBody = []
      currentLineIndex = i
    } else {
      currentBody.push(line)
    }
  }

  // Flush final section
  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      depth: currentDepth,
      body: currentBody.join('\n').trim(),
      lineIndex: currentLineIndex,
    })
  }

  return sections
}

/** Check if a section is likely a TOC entry or page reference. */
function isTocEntry(section: Section): boolean {
  const heading = section.heading.trim()
  const body = section.body.trim()

  // Heading is a page reference like "(PG 5-9)"
  if (/^\(PG\s+\d/i.test(heading)) return true

  // Body is empty
  if (!body) return true

  // Body is just a page reference
  if (/^\(PG\s+\d/i.test(body)) return true

  // Very short body that's just a number
  if (body.length < 20 && /^\d+$/.test(body)) return true

  return false
}

/**
 * Parse normalized core rules markdown into Nodes and NodeRefs.
 * Handles multi-level headings (##, ###, ####, #####).
 * Creates nodes at every heading level with part_of refs up the hierarchy.
 */
export function parseCoreRules(normalizedMarkdown: string, retrievedAt: string): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const nodeIds = new Set<string>()

  const source: Source = {
    type: 'pdf',
    title: 'Core Rules',
    retrievedAt,
  }

  const sections = parseFormattedSections(normalizedMarkdown)

  // Filter out TOC entries and very short sections
  const realSections = sections.filter(s => !isTocEntry(s) && s.body.length > 30)

  // Track the parent at each depth level for part_of refs and category inheritance
  const parentStack: Array<{ id: string; heading: string; depth: number; category: NodeCategory }> = []
  // Track phase sections for sequence_adjacent refs
  const phaseSections: Array<{ id: string; heading: string }> = []

  for (const section of realSections) {
    // Generate a unique ID — deduplicate if same slug appears
    let id = coreId(section.heading)
    let suffix = 1
    while (nodeIds.has(id)) {
      suffix++
      id = coreId(`${section.heading}-${suffix}`)
    }
    nodeIds.add(id)

    const phase = detectPhase(section.heading)
    let category = detectCategory(section.heading)

    // Inherit category from parent if this section's category is generic (core-mechanic)
    // and the parent has a more specific category (e.g., stratagem, terrain)
    if (category === 'core-mechanic' && parentStack.length > 0) {
      // Pop parents at same or deeper depth first
      const tempStack = [...parentStack]
      while (tempStack.length > 0 && tempStack[tempStack.length - 1]!.depth >= section.depth) {
        tempStack.pop()
      }
      if (tempStack.length > 0) {
        const parentCategory = tempStack[tempStack.length - 1]!.category
        if (parentCategory !== 'core-mechanic') {
          category = parentCategory
        }
      }
    }

    const pageNum = detectPageNumber(section.heading, section.body)
    const nodeSource: Source = pageNum
      ? { ...source, page: pageNum }
      : source

    const node: Node = {
      id,
      layer: 'core',
      category,
      title: section.heading,
      content: section.body,
      summary: generateSummary(section.heading, section.body),
      phase,
      sources: [nodeSource],
      refs: [],
      version: 1,
      keywords: extractKeywords(section.heading, section.body),
    }
    nodes.push(node)

    // Track phases for sequence_adjacent
    if (phase) {
      phaseSections.push({ id, heading: section.heading })
    }

    // Update parent stack — pop everything at same depth or deeper
    while (parentStack.length > 0 && parentStack[parentStack.length - 1]!.depth >= section.depth) {
      parentStack.pop()
    }

    // Create part_of ref to nearest parent
    if (parentStack.length > 0) {
      const parent = parentStack[parentStack.length - 1]!
      refs.push({
        sourceId: id,
        targetId: parent.id,
        rel: 'part_of',
        context: `"${section.heading}" is a sub-topic within "${parent.heading}".`,
        bidirectional: true,
      })
    }

    // Push this section as a potential parent for deeper sections
    parentStack.push({ id, heading: section.heading, depth: section.depth, category })
  }

  // Generate sequence_adjacent refs between unique phases
  const seenPhases = new Set<GamePhase>()
  const uniquePhases: typeof phaseSections = []
  for (const ps of phaseSections) {
    const phase = detectPhase(ps.heading)
    if (phase && !seenPhases.has(phase)) {
      seenPhases.add(phase)
      uniquePhases.push(ps)
    }
  }

  for (let i = 0; i < uniquePhases.length - 1; i++) {
    const current = uniquePhases[i]!
    const next = uniquePhases[i + 1]!
    refs.push({
      sourceId: current.id,
      targetId: next.id,
      rel: 'sequence_adjacent',
      context: `${current.heading} is followed by ${next.heading} in the battle round sequence.`,
    })
  }

  return { nodes, refs }
}
