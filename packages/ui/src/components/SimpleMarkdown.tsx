/**
 * Lightweight markdown renderer for trusted content (TO-authored descriptions).
 * Handles: bold, italic, code, links, headers, unordered lists, line breaks.
 * No external dependencies.
 */
export function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  const html = renderMarkdown(text)
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function renderMarkdown(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      if (inList) { result.push('</ul>'); inList = false }
      const level = headerMatch[1]!.length
      const content = inlineFormat(headerMatch[2]!)
      const sizes = ['text-lg font-bold', 'text-base font-semibold', 'text-sm font-semibold']
      result.push(`<h${level} class="${sizes[level - 1]} text-slate-200 mt-3 mb-1">${content}</h${level}>`)
      continue
    }

    // Unordered list items
    const listMatch = line.match(/^[-*]\s+(.+)/)
    if (listMatch) {
      if (!inList) { result.push('<ul class="list-disc list-inside space-y-0.5 text-slate-300 text-sm">'); inList = true }
      result.push(`<li>${inlineFormat(listMatch[1]!)}</li>`)
      continue
    }

    // End list if we're in one and this isn't a list item
    if (inList) { result.push('</ul>'); inList = false }

    // Empty line = paragraph break
    if (line.trim() === '') {
      result.push('<br/>')
      continue
    }

    // Regular paragraph
    result.push(`<p class="text-slate-300 text-sm">${inlineFormat(line)}</p>`)
  }

  if (inList) result.push('</ul>')
  return result.join('\n')
}

function inlineFormat(text: string): string {
  // Escape HTML entities
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-amber-400 underline hover:text-amber-300" target="_blank" rel="noopener noreferrer">$1</a>')

  // Bold: **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-100">$1</strong>')

  // Italic: *text*
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Inline code: `text`
  text = text.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-800 text-amber-300 text-xs font-mono">$1</code>')

  return text
}
