/**
 * Parse Wahapedia's pipe-delimited CSV format.
 * First line is headers, subsequent lines are data, delimiter is |
 */
export function parsePipeCsv<T extends Record<string, string>>(
  raw: string,
): T[] {
  const lines = raw.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return []

  const headers = lines[0].split('|').map((h) => h.trim())
  const rows: T[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('|')
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? '').trim()
    }
    rows.push(row as T)
  }

  return rows
}

/**
 * Wahapedia wraps some fields in HTML — strip tags for plain text.
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
