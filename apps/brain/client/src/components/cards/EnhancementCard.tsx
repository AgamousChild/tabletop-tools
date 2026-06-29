import { factionDisplayName } from '../../lib/faction-names'
import { ErrataSection } from './ErrataSection'
import type { CardContext, EnhancementCardData } from './types'

interface EnhancementCardProps {
  data: EnhancementCardData
  context: CardContext
}

function highlightText(
  text: string,
  terms: string[],
  onContentClick: (term: string) => void,
): React.ReactNode {
  if (!terms.length) return text

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) => {
    const matched = terms.find((t) => t.toLowerCase() === part.toLowerCase())
    if (matched) {
      return (
        <mark
          key={i}
          className="bg-amber-400 text-slate-900 cursor-pointer rounded-sm px-0.5"
          onClick={() => onContentClick(matched)}
        >
          {part}
        </mark>
      )
    }
    return part
  })
}

export function EnhancementCard({ data, context }: EnhancementCardProps) {
  const { highlightTerms, onContentClick } = context

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

        {/* Description */}
        <div className="text-xs text-slate-300 leading-snug">
          {highlightText(data.description, highlightTerms, onContentClick)}
        </div>

        {/* Faction — Detachment footer */}
        {(data.factionId || data.detachmentName) && (
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mt-2 pt-1 border-t border-slate-800">
            {factionDisplayName(data.subfaction || data.factionId)}
            {data.detachmentName ? ` — ${data.detachmentName} Detachment` : ''}
          </div>
        )}
      </div>

      <ErrataSection errata={data.errata} />
    </div>
  )
}
