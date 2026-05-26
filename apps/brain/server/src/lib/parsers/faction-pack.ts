import { detectChapterFromText, truncate } from '../filters'
import type { GamePhase, Node, NodeRef, Source } from '../model'
import { slugify } from '../slugify'
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

function factionDisplayName(factionSlug: string): string {
  return factionSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function extractKeywords(title: string, content: string): string[] {
  const combined = `${title} ${content}`.toLowerCase()
  const terms = [
    'stratagem',
    'enhancement',
    'detachment',
    'ability',
    'aura',
    'shoot',
    'fight',
    'charge',
    'movement',
    'command',
    'wound',
    'hit',
    'save',
    'damage',
    'mortal',
    'feel no pain',
    'invulnerable',
    'leader',
    'attached',
    'sustained hits',
    'lethal hits',
    'devastating wounds',
    'battle-shock',
    'deep strike',
    'overwatch',
  ]
  return terms.filter((t) => combined.includes(t))
}

/**
 * Parse a normalized faction pack into nodes and refs.
 *
 * Structure from the new structured PDF parser:
 * - ## DETACHMENT_NAME       → detachment heading
 * - ##### RULE_NAME          → individual rules, enhancements, detachment rules
 * - *DET — TYPE STRATAGEM*   → stratagem label (italic line)
 * - Body text with **WHEN:** **TARGET:** **EFFECT:** for stratagems
 */
export function parseFactionPack(
  normalizedMarkdown: string,
  factionSlug: string,
  retrievedAt: string,
): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const seenIds = new Map<string, number>()

  const source: Source = {
    type: 'pdf',
    title: `Faction Pack: ${factionDisplayName(factionSlug)}`,
    retrievedAt,
  }

  function makeId(base: string): string {
    const count = seenIds.get(base) ?? 0
    seenIds.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }

  const lines = normalizedMarkdown.split('\n')

  let currentDetachment: string | null = null
  let currentDetachmentId: string | null = null
  let currentDetachmentChapter: string | undefined = undefined

  // State machine: collect sections between headings
  let sectionTitle = ''
  let sectionBody: string[] = []
  let sectionType: 'detachment' | 'rule' | 'stratagem' | 'enhancement' | 'faq' | 'errata' | 'skip' =
    'skip'
  let inEnhancementZone = false
  let inFaqZone = false
  let inErrataZone = false
  let pendingStratagemName = '' // Name extracted from trailing ALL-CAPS in previous stratagem's effect

  function flushSection() {
    if (!sectionTitle || sectionType === 'skip') {
      sectionTitle = ''
      sectionBody = []
      return
    }

    const title = sectionTitle.trim()
    const body = sectionBody.join('\n').trim()
    sectionTitle = ''
    sectionBody = []

    if (!body && sectionType !== 'detachment') return

    // Reject phantom enhancements — stat lines (e.g., "6\" 3+ 7+", "10\" 2+ 6+", "-3+ 7+")
    // that appear in the enhancement zone of faction pack PDFs but are actually datasheet fragments
    if (sectionType === 'enhancement' && /^[\d\-\u2011]/.test(title)) return

    // Reject datasheets misclassified as enhancements — full unit profiles that appear
    // in the enhancement zone (e.g., Tiger Shark in T'au, Deathwatch kill teams).
    // Detect by: weapon stat tables, KEYWORDS: header, or FACTION KEYWORDS: header.
    if (sectionType === 'enhancement') {
      if (/\b(RANGED|MELEE) WEAPONS\s+(RANGE|A\b)/i.test(body)) return
      if (/^KEYWORDS:\s/i.test(body)) return
      if (/\bFACTION KEYWORDS?:\s/i.test(body)) return
    }

    // Errata and FAQ blocks need to be split into individual entries
    if (sectionType === 'errata' && body) {
      splitErrataBlock(body, factionSlug)
      return
    }
    if (sectionType === 'faq' && body) {
      splitFaqBlock(body, factionSlug)
      return
    }

    let category: Node['category']
    let phase: GamePhase | undefined
    const layer: Node['layer'] = 'faction'

    switch (sectionType) {
      case 'detachment':
        category = 'detachment-rule'
        break
      case 'stratagem': {
        category = 'stratagem'
        const whenMatch = body.match(/\*\*WHEN:\*\*\s*([^\n]+)/i)
        if (whenMatch) phase = detectPhaseFromWhen(whenMatch[1]!)
        break
      }
      case 'enhancement':
        category = 'enhancement'
        break
      default:
        category = 'faction-ability'
        break
    }

    const baseId = currentDetachmentId
      ? `${currentDetachmentId}:${slugify(title)}`
      : `faction:${factionSlug}:${slugify(title)}`
    const id = makeId(baseId)

    const summary = body ? truncate(body.split(/[.!?]\s/)[0] ?? title, 150) : title

    // Update detachment chapter detection from body text
    if (sectionType === 'detachment' && !currentDetachmentChapter) {
      currentDetachmentChapter = detectChapterFromText(body)
    }
    // Use detachment-level chapter lock for all children
    const chapterLock = currentDetachmentChapter

    const node: Node = {
      id,
      layer,
      category,
      title,
      content: body,
      summary,
      phase,
      factionId: factionSlug,
      subfaction: chapterLock,
      detachmentId: currentDetachment ? slugify(currentDetachment) : undefined,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractKeywords(title, body),
    }
    nodes.push(node)

    // part_of ref to detachment
    if (currentDetachmentId && id !== currentDetachmentId) {
      refs.push({
        sourceId: id,
        targetId: currentDetachmentId,
        rel: 'part_of',
        context: `"${title}" belongs to the ${currentDetachment} detachment.`,
        bidirectional: true,
      })
    }
  }

  // Pre-process: split errata and FAQ blocks into individual entries.
  // The PDF parser outputs these as one giant text block. We need to split
  // errata on "Page NNN" boundaries and FAQs on "Q:" boundaries.
  function splitErrataBlock(body: string, fSlug: string): void {
    // Split on "Page NNN" at the start of a line/sentence (followed by dash or comma for section name).
    // Avoid splitting on cross-references like "(see Assigned Agents, page 75)".
    const entries = body.split(/(?=(?:^|\n)\s*Pages?\s+\d+\s*[—–,-])/i).filter((s) => s.trim())
    for (const entry of entries) {
      const pageMatch = entry.match(/Pages?\s+(\d+)/i)
      const page = pageMatch ? parseInt(pageMatch[1]!, 10) : undefined
      // Extract a title from the page ref
      const titleMatch = entry.match(/Pages?\s+\d+(?:\s*,\s*\d+)*\s*[—–-]\s*([^,\n]+)/i)
      const title = titleMatch ? titleMatch[1]!.trim() : `Page ${page ?? '?'} errata`

      const id = makeId(`errata:${fSlug}:p${page ?? 0}:${slugify(title)}`)
      const nodeSource: Source = { ...source, page }

      nodes.push({
        id,
        layer: 'errata',
        category: 'commentary',
        title: `${fSlug}: ${title}`,
        content: entry.trim(),
        summary: truncate(entry, 150),
        phase: undefined,
        factionId: fSlug,
        sources: [nodeSource],
        refs: [],
        version: 1,
        keywords: extractKeywords(title, entry),
      })

      // Try to create a supersedes ref to the relevant Wahapedia node
      // The title often names the unit or stratagem being changed
      const targetSlug = slugify(title)
      if (targetSlug) {
        refs.push({
          sourceId: id,
          targetId: `det:${fSlug}:*:${targetSlug}`, // approximate — may not match exactly
          rel: 'supersedes',
          context: `Faction pack errata for ${title}. ${truncate(entry, 100)}`,
        })
      }
    }
  }

  function splitFaqBlock(body: string, fSlug: string): void {
    const entries = body.split(/(?=Q:\s)/i).filter((s) => s.trim())
    for (const entry of entries) {
      const qMatch = entry.match(/Q:\s*(.+?)(?:\s*A:|$)/is)
      const question = qMatch ? qMatch[1]!.trim() : entry.substring(0, 60)

      const id = makeId(`faq:${fSlug}:${slugify(question.substring(0, 60))}`)

      nodes.push({
        id,
        layer: 'errata',
        category: 'faq',
        title: question.length > 80 ? question.substring(0, 77) + '...' : question,
        content: entry.trim(),
        summary: truncate(entry, 150),
        phase: undefined,
        factionId: fSlug,
        sources: [source],
        refs: [],
        version: 1,
        keywords: extractKeywords(question, entry),
      })
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // ## = detachment heading
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      flushSection()
      const heading = h2[1]!.trim()

      // Detect special sections
      const upper = heading.toUpperCase()
      if (upper.includes('FAQ') || upper.includes('FREQUENTLY ASKED')) {
        inFaqZone = true
        inErrataZone = false
        inEnhancementZone = false
        sectionType = 'skip'
        continue
      }
      if (upper.includes('ERRATA') || upper.includes('UPDATE')) {
        inErrataZone = true
        inFaqZone = false
        inEnhancementZone = false
        sectionType = 'skip'
        continue
      }

      // Reset zones
      inFaqZone = false
      inErrataZone = false
      inEnhancementZone = false

      currentDetachment = heading
      const detBaseId = `det:${factionSlug}:${slugify(heading)}`
      currentDetachmentId = makeId(detBaseId)
      currentDetachmentChapter = detectChapterFromText(heading)
      sectionTitle = heading
      sectionBody = []
      sectionType = 'detachment'
      continue
    }

    // ##### = individual item (rule, enhancement, etc.)
    const h5 = line.match(/^#{3,5}\s+(.+)$/)
    if (h5) {
      flushSection()
      const heading = h5[1]!.trim()
      const upper = heading.toUpperCase()

      // Skip meta headings
      if (
        upper.includes('FACTION PACK') ||
        upper.includes('VERSION') ||
        upper.includes("WHAT'S NEW")
      ) {
        sectionType = 'skip'
        continue
      }

      // Legends datasheets section — exit errata/faq zone
      if (upper.includes('LEGEND') || upper.includes('WA R HA M M E R')) {
        inFaqZone = false
        inErrataZone = false
        sectionType = 'skip'
        continue
      }

      // Detect section zones from heading text
      if (upper.includes('FAQ') || upper.includes('FREQUENTLY ASKED')) {
        inFaqZone = true
        inErrataZone = false
        inEnhancementZone = false
        sectionType = 'skip'
        continue
      }
      if (upper.includes('ERRATA') || upper.includes('UPDATE')) {
        inErrataZone = true
        inFaqZone = false
        inEnhancementZone = false
        sectionType = 'skip'
        continue
      }
      if (upper === 'ENHANCEMENTS' || upper.startsWith('ENHANCEMENT')) {
        inEnhancementZone = true
        sectionType = 'skip'
        continue
      }
      if (upper === 'DETACHMENT RULE' || upper === 'DETACHMENT RULES') {
        sectionTitle = heading
        sectionBody = []
        sectionType = 'rule'
        continue
      }

      sectionTitle = heading
      sectionBody = []

      if (inFaqZone) {
        sectionType = 'faq'
      } else if (inErrataZone) {
        sectionType = 'errata'
      } else if (inEnhancementZone) {
        sectionType = 'enhancement'
      } else {
        // Could be an enhancement, ability, or other rule
        sectionType = 'rule'
      }
      continue
    }

    // *DETACHMENT — TYPE STRATAGEM* = stratagem label
    const stratagemLabel = line.match(/^\*(.+STRATAGEM.*)\*$/i)
    if (stratagemLabel) {
      flushSection()
      const labelText = stratagemLabel[1]!.trim()

      // Use pending name from previous stratagem's trailing effect text,
      // or look BACKWARD for an ALL-CAPS line before the label.
      let stratName = pendingStratagemName
      pendingStratagemName = ''

      if (!stratName) {
        // Look backward: "STRATAGEM NAME\n\n*DET — TYPE STRATAGEM*"
        for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
          const prev = lines[k]!.trim()
          if (!prev) continue
          if (
            prev === prev.toUpperCase() &&
            /^[A-Z][A-Z\s\-'\u2019\u2011.,!?:]+$/.test(prev) &&
            prev.length >= 2 &&
            prev.length <= 60
          ) {
            stratName = prev
          }
          break
        }
      }

      // Collect the stratagem body until the next heading or label
      sectionBody = [labelText]
      sectionType = 'stratagem'

      let j = i + 1
      const bodyLines: string[] = []
      while (j < lines.length) {
        const nextLine = lines[j]!
        if (/^#{2,5}\s/.test(nextLine) || /^\*.*STRATAGEM.*\*$/i.test(nextLine)) break
        bodyLines.push(nextLine)
        j++
      }

      let fullBody = bodyLines.join('\n').trim()

      // Strip trailing ALL-CAPS name from the EFFECT text — it's the NEXT stratagem's name.
      // Pattern: "...effect text. NEXT STRATAGEM NAME" at end of body
      const trailingNameMatch = fullBody.match(/\.\s+([A-Z][A-Z\s\-'\u2019\u2011]{3,58})$/)
      if (trailingNameMatch) {
        pendingStratagemName = trailingNameMatch[1]!.trim()
        fullBody = fullBody.slice(0, fullBody.length - trailingNameMatch[0]!.length).trim() + '.'
      }

      // Fallback: if no name found, try extracting from body before **WHEN:**
      if (!stratName) {
        const nameMatch = fullBody.match(/^([^*\n]+?)(?:\s*\*\*WHEN|\.\s)/i)
        stratName = nameMatch
          ? nameMatch[1]!.trim()
          : labelText.replace(/\s*—\s*.*STRATAGEM.*/i, '').trim()
      }

      sectionTitle = stratName || labelText
      sectionBody = [labelText, '', fullBody]

      i = j - 1
      continue
    }

    // Check for inline "ENHANCEMENTS" keyword in body text
    if (/\bENHANCEMENTS\b/.test(line) && !line.startsWith('#')) {
      inEnhancementZone = true
    }

    // Accumulate body — if we're in a zone without a section title, create one
    if (sectionTitle) {
      sectionBody.push(line)
    } else if ((inErrataZone || inFaqZone) && line.trim()) {
      // Body text in errata/faq zone without a heading — accumulate directly
      sectionTitle = inFaqZone ? 'FAQ entries' : 'Errata entries'
      sectionType = inFaqZone ? 'faq' : 'errata'
      sectionBody = [line]
    }
  }
  flushSection()

  return { nodes, refs }
}
