import { truncate } from '../filters'
import type { Node, NodeRef } from '../model'
import { slugify } from '../slugify'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParseResult {
  nodes: Node[]
  refs: NodeRef[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_TITLES: Record<string, string> = {
  'pariah-nexus': 'Pariah Nexus Tournament Companion',
  'chapter-approved': 'Chapter Approved Tournament Companion',
}

/**
 * Headings that are purely structural/meta and should be skipped entirely.
 * These produce no nodes.
 */
const SKIP_HEADINGS = new Set([
  'PARIAH NEXUS',
  'TOURNAMENT COMPANION',
  'CHAPTER APPROVED',
  // Version lines (matched by prefix check below too)
])

/**
 * `####` headings that are major section dividers, NOT individual errata cards.
 * These appear at the same heading level as errata cards but represent structural sections.
 */
const NON_ERRATA_H4_PATTERNS: RegExp[] = [
  /FAQS?/i,
  /MISSION POOL/i,
  /TERRAIN LAYOUTS?/i,
  /PAIRINGS? AND RANKINGS?/i,
  /AFTERWORD/i,
  /LAST UPDATED/i,
  /:\s*$/, // headings ending with colon (structural labels)
]

function isNonErrataH4(title: string): boolean {
  return NON_ERRATA_H4_PATTERNS.some((p) => p.test(title))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSummary(content: string): string {
  return truncate(content, 150)
}

function makeKeywords(title: string, content: string, extra: string[] = []): string[] {
  const base = [title.toLowerCase(), 'tournament', 'competitive', ...extra]
  const combined = `${title} ${content}`.toLowerCase()
  const terms = ['vp', 'objective', 'secondary mission', 'primary mission', 'action', 'reserves']
  const found = terms.filter((t) => combined.includes(t))
  return [...new Set([...base, ...found])]
}

function shouldSkipHeading(title: string): boolean {
  if (SKIP_HEADINGS.has(title)) return true
  // Skip VERSION x.x lines
  if (/^VERSION\s+\d/i.test(title)) return true
  return false
}

/**
 * Given an errata card title from the tournament companion (####  heading),
 * return the corresponding Chapter Approved card node ID.
 *
 * Cards appearing in Pariah Nexus TC errata are secondary mission cards
 * (attacker side by default) or mission rules. We map to:
 *   ca:secondary:atk:<slug>   for secondary missions
 *   ca:primary:<slug>         for primary missions / mission rules
 *   ca:twist:<slug>           for twist cards (if any)
 *
 * The heuristic: assume secondary mission (attacker) unless the title matches
 * a known primary mission or mission rule.
 */
const KNOWN_PRIMARY_MISSION_TITLES = new Set([
  'TAKE AND HOLD',
  'PURGE THE FOE',
  'LINCHPIN',
  'SCORCHED EARTH',
  'BURDEN OF TRUST',
  'THE RITUAL',
  'SUPPLY DROP',
  'TERRAFORM',
  'UNEXPLODED ORDNANCE',
])

const KNOWN_MISSION_RULE_TITLES = new Set([
  'HIDDEN SUPPLIES',
  'SMOKE AND MIRRORS',
  'PREPARED POSITIONS',
  'STALWARTS',
  'RAPID ESCALATION',
  'SWIFT ACTION',
  'RAISE BANNERS',
  'FOG OF WAR',
  'INSPIRED LEADERSHIP',
])

function errataTargetId(cardTitle: string): string {
  const slug = slugify(cardTitle)
  if (KNOWN_PRIMARY_MISSION_TITLES.has(cardTitle)) {
    return `ca:primary:${slug}`
  }
  if (KNOWN_MISSION_RULE_TITLES.has(cardTitle)) {
    return `ca:twist:${slug}`
  }
  // Default: secondary mission (attacker side)
  return `ca:secondary:atk:${slug}`
}

// ── Section types ─────────────────────────────────────────────────────────────

interface Section {
  level: 2 | 3 | 4 | 5
  title: string
  content: string
}

/**
 * Parse the markdown into a flat list of sections, each with heading level,
 * title, and body text (everything up to the next heading of the same or higher level).
 *
 * We only care about:
 *   ##    (h2) — structural dividers (PARIAH NEXUS, TOURNAMENT COMPANION, CHAPTER APPROVED)
 *   ###   (h3) — structural sub-dividers (not common in these docs)
 *   ####  (h4) — major section or errata card heading
 *   ##### (h5) — individual rule sections
 */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split('\n')
  const sections: Section[] = []

  let currentLevel: 2 | 3 | 4 | 5 | null = null
  let currentTitle = ''
  let currentBody: string[] = []

  function flush() {
    if (currentTitle) {
      sections.push({
        level: currentLevel!,
        title: currentTitle.trim(),
        content: currentBody.join('\n').trim(),
      })
    }
  }

  for (const line of lines) {
    // Match heading lines: ## to #####
    const headingMatch = line.match(/^(#{2,5})\s+(.+)$/)
    if (headingMatch) {
      flush()
      const hashes = headingMatch[1]!
      const title = headingMatch[2]!.trim()
      const level = hashes.length as 2 | 3 | 4 | 5
      currentLevel = level
      currentTitle = title
      currentBody = []
    } else {
      currentBody.push(line)
    }
  }
  flush()

  return sections
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Tournament Companion markdown file into brain nodes and refs.
 *
 * Strategy:
 * - `#####` (h5) sections become rule nodes (core-mechanic, layer: core).
 * - `####` (h4) sections that aren't structural dividers (FAQs, Mission Pool, etc.) become
 *   errata card nodes (layer: errata) with `supersedes` refs pointing to the original
 *   Chapter Approved card nodes.
 * - `##` / `###` structural dividers are always skipped.
 * - Meta `#####` headings (VERSION x.x, PARIAH NEXUS, TOURNAMENT COMPANION, CHAPTER APPROVED)
 *   are skipped.
 * - Duplicate IDs are silently dropped (first occurrence wins).
 */
export function parseTournamentCompanion(
  markdown: string,
  source: 'pariah-nexus' | 'chapter-approved',
  retrievedAt: string,
): ParseResult {
  const sourceTitle = SOURCE_TITLES[source]!
  const idPrefix = `tc:${source}`

  const sections = parseSections(markdown)
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const seenIds = new Set<string>()

  for (const section of sections) {
    const { level, title, content } = section

    // ── h2 / h3: structural dividers — always skip ───────────────────────────
    if (level === 2 || level === 3) {
      continue
    }

    // ── h4: major section headings or errata card headings ───────────────────
    if (level === 4) {
      // Skip known structural h4s (FAQs, Mission Pool, Terrain Layouts, etc.)
      if (isNonErrataH4(title)) continue

      // Skip headings that contain "ERRATA" or "AMENDMENTS" — these are section
      // dividers announcing an errata block, not individual card headings.
      if (/ERRATA|AMENDMENTS/i.test(title)) continue

      // All remaining h4 headings are errata cards (e.g. RECOVER ASSETS, ASSASSINATION,
      // NO PRISONERS). They generate nodes + supersedes refs.
      const nodeContent = [title, content].filter(Boolean).join('\n\n').trim()
      if (!nodeContent) continue

      const id = `${idPrefix}:${slugify(title)}`
      if (seenIds.has(id)) continue
      seenIds.add(id)

      const node: Node = {
        id,
        layer: 'errata',
        category: 'secondary-mission',
        title,
        content: nodeContent,
        summary: makeSummary(nodeContent),
        sources: [{ type: 'pdf', title: sourceTitle, retrievedAt }],
        refs: [],
        version: 1,
        keywords: makeKeywords(title, nodeContent, ['errata', 'updated card']),
      }
      nodes.push(node)

      // Generate supersedes ref to the original Chapter Approved card
      const targetId = errataTargetId(title)
      refs.push({
        sourceId: id,
        targetId,
        rel: 'supersedes',
        context: `Tournament companion errata updates ${title} card text`,
      })
      continue
    }

    // ── h5: individual rule sections ─────────────────────────────────────────
    if (level === 5) {
      if (shouldSkipHeading(title)) continue

      const nodeContent = [title, content].filter(Boolean).join('\n\n').trim()
      if (!nodeContent) continue

      const id = `${idPrefix}:${slugify(title)}`

      // Deduplicate: if the same title appears multiple times (e.g. "MUSTER ARMIES"),
      // append content to existing node rather than creating a duplicate.
      if (seenIds.has(id)) continue
      seenIds.add(id)

      const node: Node = {
        id,
        layer: 'core',
        category: 'core-mechanic',
        title,
        content: nodeContent,
        summary: makeSummary(nodeContent),
        sources: [{ type: 'pdf', title: sourceTitle, retrievedAt }],
        refs: [],
        version: 1,
        keywords: makeKeywords(title, nodeContent),
      }
      nodes.push(node)
    }
  }

  return { nodes, refs }
}
