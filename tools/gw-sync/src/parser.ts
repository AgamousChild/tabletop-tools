import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * Extract text from a PDF using unpdf (pdf.js wrapper).
 * Returns raw text content — "good enough for reference".
 */
export async function extractPdfText(pdfPath: string): Promise<string> {
  const { getDocumentProxy, extractText } = await import('unpdf')

  const buffer = readFileSync(pdfPath)
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })

  return text
}

/**
 * Convert extracted PDF text to markdown.
 * Applies basic formatting heuristics:
 * - Lines in ALL CAPS → ## Headings
 * - Short bold-like lines → ### Subheadings
 * - Bullet points preserved
 * - Page numbers stripped
 */
export function textToMarkdown(title: string, rawText: string): string {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')

  const rawLines = rawText.split('\n')

  for (const line of rawLines) {
    const trimmed = line.trim()

    // Skip empty lines (but add one for spacing)
    if (!trimmed) {
      // Avoid double blank lines
      if (lines[lines.length - 1] !== '') {
        lines.push('')
      }
      continue
    }

    // Skip page numbers (standalone numbers)
    if (/^\d+$/.test(trimmed)) continue

    // All-caps lines that are short → section headers
    if (
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 3 &&
      trimmed.length < 80 &&
      /[A-Z]/.test(trimmed)
    ) {
      lines.push(`## ${titleCase(trimmed)}`)
      lines.push('')
      continue
    }

    // Lines that look like bullet points
    if (/^[•●■◆▪–—-]\s/.test(trimmed)) {
      lines.push(`- ${trimmed.replace(/^[•●■◆▪–—-]\s*/, '')}`)
      continue
    }

    // Regular text
    lines.push(trimmed)
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * Convert ALL CAPS to Title Case.
 */
function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
}

export interface ParseResult {
  markdownPath: string
  charCount: number
}

/**
 * Parse a PDF file to markdown and write to disk.
 */
export async function parsePdfToMarkdown(
  pdfPath: string,
  title: string,
  outputDir: string,
  mdFileName: string,
): Promise<ParseResult> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const text = await extractPdfText(pdfPath)
  const markdown = textToMarkdown(title, text)
  const markdownPath = join(outputDir, mdFileName)

  writeFileSync(markdownPath, markdown, 'utf-8')

  return { markdownPath, charCount: markdown.length }
}

/**
 * Generate INDEX.md linking all parsed markdown files.
 */
export function generateIndex(
  outputDir: string,
  entries: { title: string; mdFileName: string; category: string }[],
): void {
  const lines: string[] = []
  lines.push('# GW Warhammer 40,000 Downloads')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')

  const coreRules = entries.filter((e) => e.category === 'core-rules')
  const factionPacks = entries.filter((e) => e.category === 'faction-pack')

  if (coreRules.length > 0) {
    lines.push('## Core Rules')
    lines.push('')
    for (const e of coreRules) {
      lines.push(`- [${e.title}](./${e.mdFileName})`)
    }
    lines.push('')
  }

  if (factionPacks.length > 0) {
    lines.push('## Faction Packs')
    lines.push('')
    for (const e of factionPacks) {
      lines.push(`- [${e.title}](./${e.mdFileName})`)
    }
    lines.push('')
  }

  writeFileSync(join(outputDir, 'INDEX.md'), lines.join('\n'), 'utf-8')
}
