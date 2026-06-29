/**
 * Replace `[label](brain:nodeId)` markdown links in raw text/HTML with
 * `<button>` elements carrying the shared `brain-entity-link` class.
 *
 * The class lives in `index.css` and is the single source of truth for the
 * underline/hover/color styling of every linked entity span — both the
 * server-side /ask answer path and the client-side `LinkedText` component
 * use it, so a given matched entity reads the same wherever it appears.
 *
 * Exported so callers can rewrite brain: links inside arbitrary markdown
 * snippets without re-deriving the class list.
 */
export function linkBrainHtml(s: string): string {
  return s.replace(
    /\[([^\]]+)\]\(brain:([^)]+)\)/g,
    (_m, label, nodeId) =>
      `<button class="brain-entity-link" data-brain-node="${nodeId}">${label}</button>`,
  )
}

/**
 * Convert markdown text to styled HTML for card rendering.
 * Handles: **bold**, - bullets, ## headings, section headers, examples, designer's notes.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Explicit markdown headings
    if (line.startsWith('## ')) {
      result.push(
        `<h2 class="text-base font-bold text-amber-400 mt-4 mb-1 uppercase tracking-wide">${bold(line.slice(3))}</h2>`,
      )
      continue
    }
    if (line.startsWith('### ')) {
      result.push(
        `<h3 class="text-sm font-semibold text-amber-300 mt-3 mb-1">${bold(line.slice(4))}</h3>`,
      )
      continue
    }

    // Bullet points
    if (line.startsWith('- ')) {
      result.push(
        `<div class="pl-4 py-0.5 text-sm text-slate-300 border-l-2 border-amber-400/30 ml-2">${bold(line.slice(2))}</div>`,
      )
      continue
    }

    // Designer's Note
    if (line.startsWith("Designer's Note:") || line.startsWith('*Designer')) {
      const noteText = line.replace(/^\*?Designer'?s'?\s*Note:\*?\s*/i, '')
      result.push(
        `<div class="bg-slate-800/50 border border-slate-700 rounded px-3 py-2 mt-2 mb-2 text-xs text-slate-400 italic">${bold(noteText)}</div>`,
      )
      continue
    }

    // Example lines
    if (
      line.startsWith('Example:') ||
      line.startsWith('**Example:**') ||
      line.startsWith('*Example:*')
    ) {
      const exText = line.replace(/^\*?\*?Example:\*?\*?\s*/i, '')
      result.push(
        `<div class="bg-slate-800/50 border border-slate-700 rounded px-3 py-2 mt-2 mb-2 text-xs text-slate-400"><strong class="text-slate-300">Example:</strong> ${bold(exText)}</div>`,
      )
      continue
    }

    // Detect section headers: short line (< 50 chars), no period at end, not a bullet,
    // followed by a longer line. Also matches Title Case or ALL CAPS short lines.
    const trimmed = line.trim()
    const nextLine = i + 1 < lines.length ? lines[i + 1]?.trim() || '' : ''
    const isShortHeader =
      trimmed.length < 50 &&
      !trimmed.endsWith('.') &&
      !trimmed.endsWith(':') &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('*') &&
      nextLine.length > trimmed.length &&
      /^[A-Z]/.test(trimmed)

    if (isShortHeader) {
      result.push(
        `<h3 class="text-sm font-semibold text-amber-300 mt-3 mb-1 uppercase tracking-wide">${bold(trimmed)}</h3>`,
      )
      continue
    }

    // Regular text
    result.push(`<p class="text-sm text-slate-300 my-1">${bold(line)}</p>`)
  }

  return result.join('\n')
}

function bold(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="text-slate-400">$1</em>')
}
