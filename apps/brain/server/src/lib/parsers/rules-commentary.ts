import type { Node, NodeRef, Source } from '../model'
import { truncate } from '../filters'
import { errataId, coreId, slugify } from '../slugify'
import type { ParseResult } from './core-rules'

function extractCommentaryKeywords(title: string, content: string): string[] {
  const combined = `${title} ${content}`.toLowerCase()
  const terms = [
    'errata', 'faq', 'clarification', 'amendment',
    'coherency', 'redeployment', 'battle-shock', 'stratagem',
    'out-of-phase', 'overwatch', 'fights first', 'charge',
    'wound', 'hit', 'save', 'movement', 'shooting', 'fight',
    'transport', 'deep strike', 'engagement range', 'visibility',
    'terrain', 'cover', 'leadership', 'morale', 'aircraft',
  ]
  return terms.filter(t => combined.includes(t))
}


/**
 * Parse rules commentary markdown into errata and FAQ nodes.
 *
 * Structure from the new structured PDF parser:
 * - ## = top-level divisions (CORE RULES UPDATES, RULES COMMENTARY)
 * - #### = section headers (UPDATES & ERRATA, FAQS)
 * - ##### = individual entries (each errata item, each FAQ topic, each commentary entry)
 */
export function parseRulesCommentary(normalizedMarkdown: string, retrievedAt: string): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  const source: Source = {
    type: 'faq',
    title: 'Core Rules Updates and Rules Commentary',
    retrievedAt,
  }

  const lines = normalizedMarkdown.split('\n')
  let zone: 'errata' | 'faq' | 'commentary' | null = null
  let currentTitle = ''
  let currentBody: string[] = []
  let nodeIndex = 0
  const seenIds = new Map<string, number>()

  function makeId(base: string): string {
    const count = seenIds.get(base) ?? 0
    seenIds.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }

  function flushNode() {
    if (!currentTitle) return
    const title = currentTitle.trim()
    const body = currentBody.join('\n').trim()
    currentTitle = ''
    currentBody = []
    if (!body && !title) return

    // Skip meta headings
    const upper = title.toUpperCase()
    if (upper.includes('VERSION') || upper === 'CORE RULES UPDATES' || upper === 'RULES COMMENTARY') return

    nodeIndex++

    // Detect page references in body for source attribution
    const pageMatch = body.match(/Page\s+(\d+)/i) || title.match(/Page\s+(\d+)/i)
    const page = pageMatch ? parseInt(pageMatch[1]!, 10) : undefined

    // Determine category based on zone
    let category: Node['category']
    let layer: Node['layer'] = 'errata'

    if (zone === 'faq') {
      category = 'faq'
    } else if (zone === 'commentary') {
      category = 'commentary'
    } else {
      // errata or unknown — default to commentary
      category = 'commentary'
    }

    const nodeSource: Source = { ...source, page }
    const id = makeId(errataId('core-commentary', page ?? 0, nodeIndex))

    const node: Node = {
      id,
      layer,
      category,
      title,
      content: body,
      summary: body ? truncate(body, 150) : title,
      sources: [nodeSource],
      refs: [],
      version: 1,
      keywords: extractCommentaryKeywords(title, body),
    }
    nodes.push(node)

    // Generate clarifies ref to the core rule section this entry references
    // Try matching the title to a core rules concept
    const coreTargetId = coreId(title)
    refs.push({
      sourceId: id,
      targetId: coreTargetId,
      rel: 'clarifies',
      context: `Rules commentary on "${title}". ${truncate(body, 100)}`,
    })
  }

  for (const line of lines) {
    // ## = top-level division
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      flushNode()
      const heading = h2[1]!.trim().toUpperCase()
      if (heading.includes('COMMENTARY')) zone = 'commentary'
      else if (heading.includes('UPDATE') || heading.includes('ERRATA')) zone = 'errata'
      continue
    }

    // #### = section headers (UPDATES & ERRATA, FAQS, etc.)
    const h4 = line.match(/^####\s+(.+)$/)
    if (h4) {
      flushNode()
      const heading = h4[1]!.trim().toUpperCase()
      if (heading.includes('FAQ')) zone = 'faq'
      else if (heading.includes('ERRATA') || heading.includes('UPDATE')) zone = 'errata'
      // Don't create a node for the section header itself
      continue
    }

    // ##### = individual entry
    const h5 = line.match(/^#{3,5}\s+(.+)$/)
    if (h5) {
      flushNode()
      const heading = h5[1]!.trim()
      // Skip quotes and version numbers
      if (heading.startsWith("'") && heading.length < 5) continue
      currentTitle = heading
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
