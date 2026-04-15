import type { EnhancementCardData, CardContext } from './types'

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
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3 border-b border-purple-700">
        <h2 className="font-['Oswald'] uppercase tracking-wide text-white text-base font-semibold">
          {data.name}
        </h2>
        <span className="font-['Oswald'] text-purple-400 text-sm font-medium shrink-0 ml-2">
          {data.cost} pts
        </span>
      </div>

      <div className="px-3 py-2 md:px-4 md:py-3 space-y-2">
        {/* Restriction */}
        {data.restriction && (
          <p className="text-purple-400 text-xs italic">{data.restriction}</p>
        )}

        {/* Description */}
        <p className="text-slate-300 leading-relaxed" style={{ fontSize: '11px' }}>
          {highlightText(data.description, highlightTerms, onContentClick)}
        </p>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 md:px-4 border-t border-slate-800">
        <span className="text-xs text-slate-500">{data.detachmentName}</span>
      </div>
    </div>
  )
}
