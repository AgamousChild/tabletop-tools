import type { Node, NodeRef, Source, GamePhase } from '../model'
import { slugify, factionId, detachmentId } from '../slugify'
import type { ParseResult } from './core-rules'

/** Detect phase from stratagem WHEN clause. */
function detectPhaseFromWhen(whenText: string): GamePhase | undefined {
  const lower = whenText.toLowerCase()
  if (lower.includes('shooting phase')) return 'shooting'
  if (lower.includes('command phase')) return 'command'
  if (lower.includes('movement phase')) return 'movement'
  if (lower.includes('charge phase')) return 'charge'
  if (lower.includes('fight phase')) return 'fight'
  if (lower.includes('any phase') || lower.includes('any of your phases')) return 'any'
  return undefined
}

/** Convert faction slug to human-readable name for source attribution. */
function factionDisplayName(factionSlug: string): string {
  return factionSlug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function extractFactionKeywords(title: string, content: string): string[] {
  const combined = `${title} ${content}`.toLowerCase()
  const terms = [
    'stratagem', 'enhancement', 'detachment', 'ability', 'aura',
    'shoot', 'fight', 'charge', 'movement', 'command',
    'wound', 'hit', 'save', 'damage', 'mortal',
    'feel no pain', 'invulnerable', 'leader', 'attached',
  ]
  return terms.filter(t => combined.includes(t))
}

/**
 * Parse a normalized faction pack into nodes and refs.
 * Detects detachment blocks, stratagems (WHEN/TARGET/EFFECT), and enhancements.
 */
export function parseFactionPack(
  normalizedMarkdown: string,
  factionSlug: string,
  retrievedAt: string,
): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  const source: Source = {
    type: 'pdf',
    title: `Faction Pack: ${factionDisplayName(factionSlug)}`,
    retrievedAt,
  }

  const lines = normalizedMarkdown.split('\n')
  let currentDetachment: string | null = null
  let currentDetachmentSlug: string | null = null
  let currentDetachmentNodeId: string | null = null
  let inStratagems = false
  let inEnhancements = false
  let currentTitle = ''
  let currentBody: string[] = []

  function flushNode() {
    if (!currentTitle) return
    const title = currentTitle.trim()
    const body = currentBody.join('\n').trim()
    currentTitle = ''
    currentBody = []
    if (!body) return

    let category: Node['category'] = 'detachment-rule'
    let phase: GamePhase | undefined

    if (inStratagems) {
      category = 'stratagem'
      const whenMatch = body.match(/\*\*WHEN:\*\*\s*([^\n]+)/i) || body.match(/WHEN:\s*([^\n]+)/i)
      if (whenMatch) phase = detectPhaseFromWhen(whenMatch[1]!)
    } else if (inEnhancements) {
      category = 'enhancement'
    }

    const id = currentDetachmentSlug
      ? detachmentId(factionSlug, currentDetachmentSlug, title)
      : factionId(factionSlug, title)

    const node: Node = {
      id,
      layer: 'faction',
      category,
      title,
      content: body,
      summary: body.split(/[.!?]\s/)[0]?.trim()?.replace(/[.!?]?$/, '.') || title,
      phase,
      factionId: factionSlug,
      detachmentId: currentDetachmentSlug || undefined,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractFactionKeywords(title, body),
    }
    nodes.push(node)

    // Generate part_of ref to detachment
    if (currentDetachmentNodeId && id !== currentDetachmentNodeId) {
      refs.push({
        targetId: currentDetachmentNodeId,
        rel: 'part_of',
        context: `${title} belongs to the ${currentDetachment} detachment.`,
        bidirectional: true,
      })
    }
  }

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/)
    const h3 = line.match(/^###\s+(.+)$/)
    const h4 = line.match(/^####\s+(.+)$/)

    if (h2) {
      flushNode()
      currentDetachment = h2[1]!.trim()
      currentDetachmentSlug = slugify(currentDetachment)
      currentDetachmentNodeId = factionId(factionSlug, currentDetachment)
      inStratagems = false
      inEnhancements = false
      currentTitle = currentDetachment
      currentBody = []
      continue
    }

    if (h3) {
      flushNode()
      const heading = h3[1]!.trim().toUpperCase()
      if (heading === 'STRATAGEMS') {
        inStratagems = true
        inEnhancements = false
        currentTitle = ''
        currentBody = []
      } else if (heading === 'ENHANCEMENTS') {
        inEnhancements = true
        inStratagems = false
        currentTitle = ''
        currentBody = []
      } else {
        inStratagems = false
        inEnhancements = false
        currentTitle = h3[1]!.trim()
        currentBody = []
      }
      continue
    }

    if (h4) {
      flushNode()
      currentTitle = h4[1]!.trim()
      currentBody = []
      continue
    }

    if (currentTitle) {
      currentBody.push(line)
    }
  }
  flushNode()

  return { nodes, refs }
}
