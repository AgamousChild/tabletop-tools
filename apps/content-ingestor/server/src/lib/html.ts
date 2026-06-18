/**
 * Fetch a URL and extract the article body text.
 */
export async function fetchArticleText(
  url: string,
  fetchFn: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = (...args) =>
    fetch(...args),
): Promise<string> {
  const response = await fetchFn(url)
  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`)
  }

  let html = await response.text()

  // Strip script, style, nav, header, footer blocks (case-insensitive, dotall)
  html = html.replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
  html = html.replace(/<style[\s>][\s\S]*?<\/style>/gi, '')
  html = html.replace(/<nav[\s>][\s\S]*?<\/nav>/gi, '')
  html = html.replace(/<header[\s>][\s\S]*?<\/header>/gi, '')
  html = html.replace(/<footer[\s>][\s\S]*?<\/footer>/gi, '')

  // Strip all remaining HTML tags
  html = html.replace(/<[^>]*>/g, ' ')

  // Decode HTML entities
  html = html.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  html = html.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
  html = html.replace(/&amp;/g, '&')
  html = html.replace(/&lt;/g, '<')
  html = html.replace(/&gt;/g, '>')
  html = html.replace(/&quot;/g, '"')
  html = html.replace(/&#39;|&apos;/g, "'")
  html = html.replace(/&nbsp;/g, ' ')

  // Collapse whitespace and trim
  const text = html.replace(/\s+/g, ' ').trim()

  if (!text) {
    throw new Error('Extracted text is empty')
  }

  return text
}
