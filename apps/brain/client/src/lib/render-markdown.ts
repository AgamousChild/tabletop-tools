/**
 * Convert markdown text to styled HTML for card rendering.
 * Handles: **bold**, - bullets, ## headings, line breaks.
 */
export function renderMarkdown(text: string): string {
  return text
    .split('\n')
    .map(line => {
      if (line.startsWith('## ')) return `<h2 class="text-lg font-bold text-amber-400 mt-4 mb-2">${bold(line.slice(3))}</h2>`
      if (line.startsWith('### ')) return `<h3 class="text-base font-semibold text-amber-300 mt-3 mb-1">${bold(line.slice(4))}</h3>`
      if (line.startsWith('- ')) {
        return `<div class="pl-4 py-0.5 text-sm text-slate-300 border-l border-slate-700 ml-2">${bold(line.slice(2))}</div>`
      }
      if (!line.trim()) return ''
      return `<p class="text-sm text-slate-300 my-1">${bold(line)}</p>`
    })
    .join('\n')
}

function bold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>')
}
