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

  // Check every line, not just the head of the input. Players paste
  // commentary above their list all the time, which pushes the points marker
  // past any start-anchored window; and key-value headers ("Faction: X") carry
  // no points on line 1 at all. Skipping unparseable preamble is the whole job
  // here — scan for the marker instead of demanding it arrive first.
  if (text.split('\n').some((line) => /^.{0,100}\(\d[\d,]*\s*[Pp]oints?\)/.test(line.trim()))) {
    return 'gw-app'
  }

  return 'unknown'
}
