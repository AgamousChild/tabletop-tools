import { normalizeFactionId } from '../faction-codes'
import { truncate } from '../filters'
import type { Node, NodeRef, Source } from '../model'
import { balanceId, slugify } from '../slugify'
import type { ParseResult } from './core-rules'

/**
 * Parse balance dataslate markdown into balance-change nodes.
 *
 * Structure from the new structured PDF parser:
 * - ## = top-level (BALANCE DATASLATE, CONTENTS)
 * - #### = faction headers (CORE RULES, ADEPTA SORORITAS, etc.)
 * - ##### = individual changes (ARMY RULE, DETACHMENT entries, DATASHEETS, etc.)
 */
export function parseBalanceDataslate(
  normalizedMarkdown: string,
  retrievedAt: string,
  sourceTitle: string = 'Balance Dataslate',
): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const seenIds = new Map<string, number>()

  const source: Source = {
    type: 'balance-dataslate',
    title: sourceTitle,
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
    const rootId = isCoreChange ? balanceId('core', title) : balanceId(fSlug!, title)
    // Non-default source titles (e.g. "Universal Rules Updates") append a
    // suffix so their nodes don't collide with the June 2025 Balance
    // Dataslate. Both rules can legitimately be titled the same and mean
    // different things — merge-sources dedupes on exact ID, so distinct IDs
    // are required to keep both historical records.
    const baseId =
      sourceTitle === 'Balance Dataslate' ? rootId : `${rootId}:${slugify(sourceTitle)}`
    const nodeId = makeId(baseId)

    const node: Node = {
      id: nodeId,
      layer: 'balance',
      category: 'balance-change',
      title: isCoreChange ? title : `${currentFaction}: ${title}`,
      content: body,
      summary: truncate(body, 150),
      factionId: fSlug ? normalizeFactionId(fSlug) : undefined,
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
    // #### = faction header — except when it's a meta heading (VERSION 1.0,
    // CONTENTS, PRODUCED BY). Meta H4s cleared state before flushNode's
    // node-title check ran, but currentFaction stayed set to the meta string
    // (e.g. 'VERSION 1.0'), which caused every subsequent H5 to be tagged
    // with factionId=version-1-0 and title prefixed 'VERSION 1.0: ...'.
    // The old monolithic Balance Dataslate had a 'CORE RULES' H4 right
    // after the version line so this never surfaced; the July 2026
    // Universal Rules Updates has ONLY the meta H4, and every core-rule
    // node picked up the bogus faction tag.
    const h4 = line.match(/^####\s+(.+)$/)
    if (h4) {
      flushNode()
      const heading = h4[1]!.trim()
      const upper = heading.toUpperCase()
      const isMeta =
        upper.startsWith('VERSION') || upper === 'CONTENTS' || upper.includes('PRODUCED BY')
      if (isMeta) {
        currentTitle = ''
        currentBody = []
        continue
      }
      currentFaction = heading
      currentFactionSlug = slugify(heading)
      currentTitle = ''
      currentBody = []
      continue
    }

    // ##### = individual change entry
    const h5 = line.match(/^#{3,5}\s+(.+)$/)
    if (h5 && !h4) {
      const newTitle = h5[1]!.trim()
      // gw-sync's PDF→markdown conversion sometimes splits a single visual
      // heading across two consecutive ##### lines with no body in between
      // (e.g. the July 2026 Universal Rules Updates splits "STRATAGEMS THAT
      // PREVENT UNITS FROM BEING TARGETED" into two headings). If the current
      // title has no body yet, treat the new h5 as a continuation and merge
      // the titles instead of dropping the first as an empty node.
      const hasBody = currentBody.some((l) => l.trim().length > 0)
      if (currentTitle && !hasBody) {
        currentTitle = `${currentTitle} ${newTitle}`
      } else {
        flushNode()
        currentTitle = newTitle
        currentBody = []
      }
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
