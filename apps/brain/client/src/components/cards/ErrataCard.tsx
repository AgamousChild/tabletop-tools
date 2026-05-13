import type { CardContext, ErrataCardData } from './types'

interface ErrataCardProps {
  data: ErrataCardData
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

export function ErrataCard({ data, context }: ErrataCardProps) {
  const { highlightTerms, onContentClick } = context

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header — orange underline */}
        <div className="flex items-baseline justify-between border-b-2 border-orange-500 pb-1 mb-1.5">
          <span
            className="text-sm font-bold uppercase tracking-wider text-white"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.name}
          </span>
          {data.qualityFlags && data.qualityFlags.length > 0 && (
            <div className="flex gap-1 ml-2 flex-wrap justify-end">
              {data.qualityFlags.map((flag) => (
                <span
                  key={flag}
                  className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Clarifies link */}
        {data.targetRule && (
          <div className="text-[10px] text-orange-400 mb-1.5">
            Clarifies:{' '}
            <span
              className="cursor-pointer underline"
              onClick={() => onContentClick(data.targetRule!)}
            >
              {data.targetRule}
            </span>
          </div>
        )}

        {/* Correction text */}
        <div className="text-xs text-slate-300 leading-snug">
          {highlightText(data.correctionText, highlightTerms, onContentClick)}
        </div>

        {/* Footer */}
        {(data.source || data.effectiveDate) && (
          <div className="text-[9px] text-slate-500 mt-2 pt-1 border-t border-slate-800 flex gap-2">
            {data.source && <span>{data.source}</span>}
            {data.effectiveDate && <span>{data.effectiveDate}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
