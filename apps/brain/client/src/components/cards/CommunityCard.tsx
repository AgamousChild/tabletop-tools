import type { CardContext, CommunityCardData } from './types'

interface CommunityCardProps {
  data: CommunityCardData
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

export function CommunityCard({ data, context }: CommunityCardProps) {
  const { highlightTerms, onContentClick } = context

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header — cyan underline */}
        <div className="flex items-baseline justify-between border-b-2 border-cyan-500 pb-1 mb-1.5">
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
                  className="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="text-[11px] text-slate-300 leading-snug">
          {highlightText(data.description, highlightTerms, onContentClick)}
        </div>

        {/* Footer */}
        {data.sourceAttribution && (
          <div className="text-[8px] text-slate-500 mt-2 pt-1 border-t border-slate-800">
            {data.sourceAttribution}
          </div>
        )}
      </div>
    </div>
  )
}
