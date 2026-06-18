/**
 * Parse Wahapedia's pipe-delimited CSV format.
 * First line is headers, subsequent lines are data, delimiter is |
 */
export function parsePipeCsv<T extends Record<string, string>>(raw: string): T[] {
  const lines = raw.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return []

  const headers = lines[0]!.split('|').map((h) => h.trim())
  const rows: T[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split('|')
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = (values[j] ?? '').trim()
    }
    rows.push(row as T)
  }

  return rows
}

/**
 * Strip HTML tags for plain text extraction.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/**
 * Convert Wahapedia HTML descriptions to clean markdown.
 * Handles the specific HTML patterns used in Wahapedia data:
 * <b>, <i>, <br>, <span class="kwb">, <p>, <div>, <table>, <li>
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.includes('<')) return html

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<(?:i|em)>(.*?)<\/(?:i|em)>/gi, '*$1*')
    .replace(/<span[^>]*class="kwb"[^>]*>(.*?)<\/span>/gi, '**$1**')
    .replace(/<span[^>]*>(.*?)<\/span>/gi, '$1')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/?(?:table|thead|tbody|tr|td|th)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Normalize curly/prime apostrophes and title-case a string */
export function titleCase(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
    .trim()
}

/** Apply htmlToMarkdown to a specific field across all rows */
export function convertDescriptions(
  rows: Record<string, unknown>[],
  field = 'description',
): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    [field]: typeof row[field] === 'string' ? htmlToMarkdown(row[field] as string) : row[field],
  }))
}
