import type { Node, NodeRef, Source } from '../model'
import { truncate } from '../filters'
import { slugify, balanceId } from '../slugify'
import type { ParseResult } from './core-rules'


/**
 * Parse balance dataslate markdown into balance-change nodes.
 *
 * Structure from the new structured PDF parser:
 * - ## = top-level (BALANCE DATASLATE, CONTENTS)
 * - #### = faction headers (CORE RULES, ADEPTA SORORITAS, etc.)
 * - ##### = individual changes (ARMY RULE, DETACHMENT entries, DATASHEETS, etc.)
 */
export function parseBalanceDataslate(normalizedMarkdown: string, retrievedAt: string): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const seenIds = new Map<string, number>()

  const source: Source = {
    type: 'balance-dataslate',
    title: 'Balance Dataslate',
    retrievedAt,
  }

  function makeId(base: string): string {
    const count = seenIds.get(base) ?? 0
    seenIds.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
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

    // Skip meta headings
    const upper = title.toUpperCase()
    if (upper.includes('VERSION') || upper.includes('PRODUCED BY') || upper === 'CONTENTS') return

    // Skip "no changes" entries
    if (/no\s+(further\s+)?changes?\s+(at\s+this\s+time|to\s+this)/i.test(body)) return
    if (body.length < 30 && /no\s+changes/i.test(body)) return

    const isCoreChange = !currentFaction || currentFaction.toUpperCase() === 'CORE RULES'
    const fSlug = isCoreChange ? undefined : currentFactionSlug
    const baseId = isCoreChange
      ? balanceId('core', title)
      : balanceId(fSlug!, title)
    const nodeId = makeId(baseId)

    const node: Node = {
      id: nodeId,
      layer: 'balance',
      category: 'balance-change',
      title: isCoreChange ? title : `${currentFaction}: ${title}`,
      content: body,
      summary: truncate(body, 150),
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
    } else {
      refs.push({
        sourceId: nodeId,
        targetId: `core:${slugify(title)}`,
        rel: 'modifies',
        context: `Balance dataslate amendment to ${title}.`,
      })
    }
  }

  for (const line of lines) {
    // #### = faction header
    const h4 = line.match(/^####\s+(.+)$/)
    if (h4) {
      flushNode()
      const heading = h4[1]!.trim()
      currentFaction = heading
      currentFactionSlug = slugify(heading)
      currentTitle = ''
      currentBody = []
      continue
    }

    // ##### = individual change entry
    const h5 = line.match(/^#{3,5}\s+(.+)$/)
    if (h5 && !h4) {
      flushNode()
      currentTitle = h5[1]!.trim()
      currentBody = []
      continue
    }

    // ## = top-level section (skip)
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      flushNode()
      currentTitle = ''
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
