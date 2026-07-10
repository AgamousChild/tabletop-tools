import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { slugify } from '@tabletop-tools/server-core'

import type { DraftNode, DraftStatus, Screenshot } from '../types'

// ── Serialisation helpers ─────────────────────────────────────────────────

/**
 * Serialize a screenshots array to YAML list format (indented, no library).
 */
function screenshotsToYaml(screenshots: Screenshot[]): string {
  if (screenshots.length === 0) return 'screenshots: []\n'

  const lines = ['screenshots:']
  for (const s of screenshots) {
    // Quote values that may contain colons (Windows paths, captions) to avoid
    // ambiguous YAML and ensure the hand-rolled parser can extract them cleanly.
    lines.push(`  - file: "${s.file.replace(/"/g, '\\"')}"`)
    lines.push(`    timestamp: "${s.timestamp}"`)
    lines.push(`    timestampSec: ${s.timestampSec}`)
    lines.push(`    caption: "${s.caption.replace(/"/g, '\\"')}"`)
  }
  return lines.join('\n') + '\n'
}

/**
 * Parse a YAML screenshots list from the frontmatter block.
 * Handles the inline `screenshots: []` case and multi-item list.
 */
function parseScreenshots(frontmatter: string): Screenshot[] {
  const inlineMatch = frontmatter.match(/^screenshots:\s*\[\]\s*$/m)
  if (inlineMatch) return []

  const screenshots: Screenshot[] = []
  // Split on the "  - file:" boundary to find each screenshot item
  const itemBlocks = frontmatter.split(/\n {2}- file: /).slice(1)
  for (const block of itemBlocks) {
    const lines = block.split('\n')
    // Strip surrounding quotes added by screenshotsToYaml for safety
    const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"')
    const file = unquote(lines[0]?.trim() ?? '')
    const timestamp = unquote(lines[1]?.replace(/^\s*timestamp:\s*/, '').trim() ?? '')
    const timestampSec = Number(lines[2]?.replace(/^\s*timestampSec:\s*/, '').trim() ?? '0')
    const caption = unquote(lines[3]?.replace(/^\s*caption:\s*/, '').trim() ?? '')
    screenshots.push({ file, timestamp, timestampSec, caption })
  }
  return screenshots
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Convert a DraftNode to a markdown string with YAML frontmatter.
 * Body sections: ## Summary, ## Content, ## Source Context.
 */
export function draftToMarkdown(draft: DraftNode): string {
  const optionalFields = [
    draft.sourceChannel !== undefined ? `sourceChannel: ${draft.sourceChannel}` : null,
    draft.timestamp !== undefined ? `timestamp: ${draft.timestamp}` : null,
    draft.similarTo !== undefined ? `similarTo: ${draft.similarTo}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const keywordsYaml =
    draft.keywords.length === 0
      ? 'keywords: []\n'
      : `keywords:\n${draft.keywords.map((k) => `  - ${k}`).join('\n')}\n`

  const frontmatter = [
    '---',
    `status: ${draft.status}`,
    `title: ${draft.title}`,
    `category: ${draft.category}`,
    keywordsYaml.trimEnd(),
    `sourceUrl: ${draft.sourceUrl}`,
    `sourceType: ${draft.sourceType}`,
    optionalFields || null,
    `confidence: ${draft.confidence}`,
    screenshotsToYaml(draft.screenshots).trimEnd(),
    '---',
  ]
    .filter((line): line is string => line !== null && line !== '')
    .join('\n')

  const body = [
    `## Summary\n\n${draft.summary}`,
    `## Content\n\n${draft.content}`,
    `## Source Context\n\n${draft.sourceContext}`,
  ].join('\n\n')

  return `${frontmatter}\n\n${body}\n`
}

/**
 * Parse a DraftNode from a markdown string with YAML frontmatter.
 * Extracts frontmatter between first --- and second ---, then parses body sections.
 */
export function markdownToDraft(markdown: string): DraftNode {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) throw new Error('No valid frontmatter found')

  const frontmatter = fmMatch[1]!
  const body = markdown.slice(fmMatch[0].length)

  // Parse simple key: value fields from frontmatter
  function getField(key: string): string | undefined {
    const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return match?.[1]?.trim()
  }

  // Parse keywords list
  const keywordsInline = frontmatter.match(/^keywords:\s*\[\]\s*$/m)
  let keywords: string[] = []
  if (!keywordsInline) {
    const kwBlock = frontmatter.match(/^keywords:\n((?: {2}- .+\n?)+)/m)
    if (kwBlock) {
      keywords = kwBlock[1]!
        .split('\n')
        .map((l) => l.replace(/^\s*- /, '').trim())
        .filter(Boolean)
    }
  }

  // Parse body sections by ## headers
  // Split on headings so the last section greedily captures to end-of-string
  // without truncation from lazy quantifier + $ edge cases.
  function getSection(heading: string): string {
    const headingMarker = `## ${heading}\n\n`
    const start = body.indexOf(headingMarker)
    if (start === -1) return ''
    const contentStart = start + headingMarker.length
    const nextHeading = body.indexOf('\n## ', contentStart)
    const raw =
      nextHeading === -1 ? body.slice(contentStart) : body.slice(contentStart, nextHeading)
    return raw.trim()
  }

  const status = (getField('status') ?? 'draft') as DraftNode['status']
  const title = getField('title') ?? ''
  const category = (getField('category') ?? 'tactic') as DraftNode['category']
  const sourceUrl = getField('sourceUrl') ?? ''
  const sourceType = (getField('sourceType') ?? 'article') as DraftNode['sourceType']
  const sourceChannel = getField('sourceChannel')
  const timestamp = getField('timestamp')
  const confidence = Number(getField('confidence') ?? '0')
  const similarTo = getField('similarTo')
  const screenshots = parseScreenshots(frontmatter)

  const summary = getSection('Summary')
  const content = getSection('Content')
  const sourceContext = getSection('Source Context')

  return {
    status,
    title,
    category,
    keywords,
    sourceUrl,
    sourceType,
    ...(sourceChannel !== undefined ? { sourceChannel } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
    confidence,
    screenshots,
    summary,
    content,
    sourceContext,
    ...(similarTo !== undefined ? { similarTo } : {}),
  }
}

/**
 * Write a DraftNode to a markdown file.
 * Filename: node-{index.padStart(3, '0')}-{slug}.md
 * Returns the absolute file path written.
 */
export async function saveDraft(draft: DraftNode, dir: string, index: number): Promise<string> {
  mkdirSync(dir, { recursive: true })
  const slug = slugify(draft.title)
  const fileName = `node-${String(index).padStart(3, '0')}-${slug}.md`
  const filePath = join(dir, fileName)
  writeFileSync(filePath, draftToMarkdown(draft), 'utf-8')
  return filePath
}

/**
 * Load all .md files from a directory, parsing each into a DraftNode.
 * Skips files that fail to parse (logs a warning).
 */
export async function loadDrafts(dir: string): Promise<Array<{ path: string; draft: DraftNode }>> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  const results: Array<{ path: string; draft: DraftNode }> = []

  for (const file of files) {
    const filePath = join(dir, file)
    try {
      const markdown = readFileSync(filePath, 'utf-8')
      const draft = markdownToDraft(markdown)
      results.push({ path: filePath, draft })
    } catch (err) {
      console.warn(`Failed to parse draft file ${filePath}: ${String(err)}`)
    }
  }

  return results
}

/**
 * Read a draft file, update its status, and write it back.
 */
export async function updateDraftStatus(path: string, status: DraftStatus): Promise<void> {
  const markdown = readFileSync(path, 'utf-8')
  const draft = markdownToDraft(markdown)
  draft.status = status
  writeFileSync(path, draftToMarkdown(draft), 'utf-8')
}
