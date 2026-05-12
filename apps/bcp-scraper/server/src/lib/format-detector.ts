export function detectFormat(text: string): 'gw-app' | 'battlescribe' | 'html' | 'unknown' {
  if (!text || !text.trim()) return 'unknown'

  if (text.includes('+++') || text.includes('FACTION KEYWORD:') || text.includes('+ DETACHMENT:')) {
    return 'battlescribe'
  }

  if (
    text.includes('<div') ||
    text.includes('<body') ||
    text.includes('body {') ||
    text.includes('enable JavaScript') ||
    text.trimStart().startsWith('<!')
  ) {
    return 'html'
  }

  if (/^.{0,100}\(\d[\d,]*\s*[Pp]oints?\)/.test(text)) {
    return 'gw-app'
  }

  return 'unknown'
}
