/**
 * Converts HTML content to readable plain text with basic formatting.
 * Used for Wahapedia descriptions stored with HTML markup.
 */
export function htmlToText(html: string): string {
  if (!html) return ''

  let text = html

  // Block-level elements: add newlines
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n')
  text = text.replace(/<p[^>]*>/gi, '\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<div[^>]*>/gi, '\n')
  text = text.replace(/<\/li>/gi, '')
  text = text.replace(/<li[^>]*>/gi, '\n• ')
  text = text.replace(/<\/tr>/gi, '\n')
  text = text.replace(/<hr[^>]*>/gi, '\n---\n')

  // Inline emphasis
  text = text.replace(/<(?:b|strong)[^>]*>(.*?)<\/(?:b|strong)>/gi, '$1')
  text = text.replace(/<(?:i|em)[^>]*>(.*?)<\/(?:i|em)>/gi, '$1')

  // Strip remaining tags
  text = text.replace(/<[^>]*>/g, '')

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&mdash;/g, '—')
  text = text.replace(/&ndash;/g, '–')

  // Clean up whitespace: collapse multiple spaces, trim lines
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n /g, '\n')
  text = text.replace(/ \n/g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()

  return text
}
