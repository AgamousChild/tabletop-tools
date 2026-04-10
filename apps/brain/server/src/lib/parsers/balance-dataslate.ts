import type { Node, NodeRef, Source } from '../model'
import { slugify, balanceId } from '../slugify'
import type { ParseResult } from './core-rules'

/**
 * Parse balance dataslate markdown into balance-change nodes.
 * Each faction section with actual changes becomes one or more nodes.
 * "No changes" factions are skipped.
 */
export function parseBalanceDataslate(normalizedMarkdown: string, retrievedAt: string): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  const source: Source = {
    type: 'balance-dataslate',
    title: 'Balance Dataslate',
    retrievedAt,
  }

  const lines = normalizedMarkdown.split('\n')
  let currentFaction: string | null = null
  let currentFactionSlug: string | null = null
  let currentTitle = ''
  let currentBody: string[] = []

  function flushNode() {
    if (!currentTitle) return
    const title = currentTitle.trim()
    const body = currentBody.join('\n').trim()
    currentTitle = ''
    currentBody = []
    if (!body) return

    // Skip "no changes" entries
    if (/no\s+changes?\s+at\s+this\s+time/i.test(body)) return

    const isCoreChange = !currentFaction || currentFaction.toUpperCase() === 'CORE RULES'
    const fSlug = isCoreChange ? undefined : currentFactionSlug
    const nodeId = isCoreChange
      ? balanceId('core', title)
      : balanceId(fSlug!, title)

    const node: Node = {
      id: nodeId,
      layer: 'balance',
      category: 'balance-change',
      title,
      content: body,
      summary: body.split(/[.!?]\s/)[0]?.trim()?.replace(/[.!?]?$/, '.') || title,
      factionId: fSlug || undefined,
      sources: [source],
      refs: [],
      version: 1,
      keywords: ['balance', 'dataslate', ...(fSlug ? [fSlug] : [])],
    }
    nodes.push(node)

    // Generate modifies ref
    if (fSlug) {
      refs.push({
        sourceId: nodeId,
        targetId: `faction:${fSlug}:${slugify(title)}`,
        rel: 'modifies',
        context: `Balance dataslate change to ${title} for ${currentFaction}.`,
      })
    } else if (isCoreChange) {
      refs.push({
        sourceId: nodeId,
        targetId: `core:${slugify(title)}`,
        rel: 'modifies',
        context: `Balance dataslate amendment to ${title}.`,
      })
    }
  }

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/)
    const h3 = line.match(/^###\s+(.+)$/)

    if (h2) {
      flushNode()
      const heading = h2[1]!.trim()
      currentFaction = heading
      currentFactionSlug = slugify(heading)
      currentTitle = heading
      currentBody = []
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
