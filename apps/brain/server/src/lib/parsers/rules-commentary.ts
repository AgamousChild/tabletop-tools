import type { Node, NodeRef, Source } from '../model'
import { errataId, coreId } from '../slugify'
import type { ParseResult } from './core-rules'

function extractCommentaryKeywords(title: string, content: string): string[] {
  const combined = `${title} ${content}`.toLowerCase()
  const terms = [
    'errata', 'faq', 'clarification', 'amendment',
    'coherency', 'redeployment', 'battle-shock', 'stratagem',
    'out-of-phase', 'overwatch', 'fights first', 'charge',
  ]
  return terms.filter(t => combined.includes(t))
}

/**
 * Parse rules commentary markdown into errata and FAQ nodes.
 * Each page reference becomes a commentary node with clarifies refs.
 * Each Q&A pair becomes a FAQ node.
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
  let section: 'errata' | 'faq' | null = null
  let currentTitle = ''
  let currentBody: string[] = []
  let errataIndex = 0

  function flushNode() {
    if (!currentTitle) return
    const title = currentTitle.trim()
    const body = currentBody.join('\n').trim()
    currentTitle = ''
    currentBody = []
    if (!body) return

    const pageMatch = title.match(/Page\s+(\d+)/i)
    const page = pageMatch ? parseInt(pageMatch[1]!, 10) : undefined

    const isFaq = section === 'faq' || title.startsWith('Q:')

    if (isFaq) {
      errataIndex++
      const cleanTitle = title.replace(/^Q:\s*/, '')
      const node: Node = {
        id: errataId('core-rules-commentary', 0, errataIndex),
        layer: 'errata',
        category: 'faq',
        title: cleanTitle,
        content: body,
        summary: body.split('\n')[0]?.trim() || cleanTitle,
        sources: [source],
        refs: [],
        version: 1,
        keywords: extractCommentaryKeywords(cleanTitle, body),
      }
      nodes.push(node)
    } else {
      errataIndex++
      const nodeSource: Source = { ...source, page }
      const node: Node = {
        id: errataId('core-rules-commentary', page ?? 0, errataIndex),
        layer: 'errata',
        category: 'commentary',
        title,
        content: body,
        summary: body.split(/[.!?]\s/)[0]?.trim()?.replace(/[.!?]?$/, '.') || title,
        sources: [nodeSource],
        refs: [],
        version: 1,
        keywords: extractCommentaryKeywords(title, body),
      }
      nodes.push(node)

      // Generate clarifies ref to the core rule section
      if (page) {
        const sectionMatch = title.match(/Page\s+\d+\s*[-\u2013]\s*(.+)/i)
        if (sectionMatch) {
          const sectionName = sectionMatch[1]!.replace(/,\s*\d+\w+\s+paragraph/i, '').trim()
          refs.push({
            targetId: coreId(sectionName),
            rel: 'clarifies',
            context: `${title}: ${body.slice(0, 100)}...`,
          })
        }
      }
    }
  }

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/)
    const h3 = line.match(/^###\s+(.+)$/)

    if (h2) {
      flushNode()
      const heading = h2[1]!.trim().toUpperCase()
      if (heading.includes('FAQ')) section = 'faq'
      else if (heading.includes('ERRATA') || heading.includes('UPDATE')) section = 'errata'
      else section = null
      continue
    }

    if (h3) {
      flushNode()
      currentTitle = h3[1]!.trim()
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
