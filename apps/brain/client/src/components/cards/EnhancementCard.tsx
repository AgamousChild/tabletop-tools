import { factionDisplayName } from '../../lib/faction-names'
import { renderMarkdown } from '../../lib/render-markdown'
import { ErrataSection } from './ErrataSection'
import type { CardContext, EnhancementCardData } from './types'

interface EnhancementCardProps {
  data: EnhancementCardData
  context: CardContext
}

/**
 * Wrap highlight terms in `<mark>` tags inside a string of rendered HTML.
 * Skips matches that fall inside existing HTML tag attributes so we don't
 * corrupt the structure produced by `renderMarkdown`.
 */
function highlightHtml(html: string, terms: string[]): string {
  if (!terms.length) return html
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')

  // Split on tag boundaries so we only highlight inside text nodes.
  return html
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (segment.startsWith('<')) return segment
      return segment.replace(
        regex,
        '<mark class="bg-amber-400 text-slate-900 cursor-pointer rounded-sm px-0.5" data-highlight-term="$1">$1</mark>',
      )
    })
    .join('')
}

export function EnhancementCard({ data, context }: EnhancementCardProps) {
  const { highlightTerms, onContentClick } = context
  const renderedHtml = highlightHtml(renderMarkdown(data.description), highlightTerms)

  // Delegate highlight-term clicks via event listener — the highlightHtml
  // helper stamps `data-highlight-term` on each <mark> so we can recover the
  // matched text without re-parsing the DOM.
  const handleDescriptionClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const term = target.getAttribute('data-highlight-term')
    if (term) onContentClick(term)
  }

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header — name + cost, purple underline */}
        <div className="flex items-baseline justify-between border-b-2 border-purple-500 pb-1 mb-1.5">
          <span
            className="text-[15px] font-bold uppercase tracking-wider text-white"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.name}
          </span>
          <span
            className="text-[17px] font-bold text-purple-500 shrink-0 ml-2"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.cost ? `${data.cost} pts` : ''}
          </span>
        </div>

        {/* attachesTo chip + restriction */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {data.attachesTo && (
            <span
              data-testid="enhancement-attaches-to"
              className={
                data.attachesTo === 'leader'
                  ? 'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40'
              }
            >
              {data.attachesTo === 'leader' ? 'LEADER' : 'UNIT'}
            </span>
          )}
          {data.restriction && (
            <span className="text-[10px] text-purple-400 uppercase tracking-wide">
              {data.restriction}
            </span>
          )}
        </div>

        {/* Description — rendered through renderMarkdown so MFM nodes that
            carry **bold** markup don't surface as literal asterisks. */}
        <div
          className="text-xs text-slate-300 leading-snug"
          onClick={handleDescriptionClick}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />

        {/* Faction — Detachment footer */}
        {(data.factionId || data.detachmentName) && (
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mt-2 pt-1 border-t border-slate-800">
            {factionDisplayName(data.factionId)}
            {data.detachmentName ? ` — ${data.detachmentName} Detachment` : ''}
          </div>
        )}
      </div>

      <ErrataSection errata={data.errata} />
    </div>
  )
}
