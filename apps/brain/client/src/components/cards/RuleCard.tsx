import { ErrataSection } from './ErrataSection'
import { renderMarkdown as renderMarkdownFn } from '../../lib/render-markdown'
import type { CardContext, RuleCardData } from './types'

interface RuleCardProps {
  data: RuleCardData
  context: CardContext
}

// Renders text with [KEYWORD] tokens as clickable spans
function KeywordText({
  text,
  onContentClick,
}: {
  text: string
  onContentClick: (term: string) => void
}) {
  const parts = text.split(/(\[[^\]]+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[([^\]]+)\]$/)
        if (match) {
          return (
            <button
              key={i}
              className="text-amber-400 font-semibold hover:underline cursor-pointer bg-transparent border-0 p-0 m-0 font-[inherit] text-[inherit]"
              onClick={() => onContentClick(match[1])}
            >
              {part}
            </button>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function subRuleIsHighlighted(
  subRule: { name: string; description: string },
  terms: string[],
): boolean {
  if (terms.length === 0) return false
  const lower = (subRule.name + ' ' + subRule.description).toLowerCase()
  return terms.some((t) => lower.includes(t.toLowerCase()))
}

export function RuleCard({ data, context }: RuleCardProps) {
  const { highlightTerms, onContentClick } = context
  const isFaction = data.isFaction
  const borderClass = isFaction ? 'border-red-400' : data.isArmyRule ? 'border-amber-400' : 'border-blue-400'
  const subRuleNameClass = data.isArmyRule ? 'text-amber-400' : 'text-blue-400'
  const subtitleLabel = isFaction ? 'Faction' : data.isArmyRule ? 'Army Rule' : 'Detachment Ability'
  const subtitlePrefix = data.factionId || (data.detachmentName ?? '')

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        data-testid="rule-card-header"
        className={`px-3 py-2 md:px-4 md:py-3 border-b ${borderClass}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-['Oswald'] uppercase tracking-wide text-white text-[17px] font-semibold">
              {data.name}
            </h2>
            <p className={`text-[13px] mt-0.5 ${data.isArmyRule ? 'text-amber-400' : 'text-blue-400'}`}>
              {subtitlePrefix} — {subtitleLabel}
            </p>
          </div>
          {data.subfaction && (
            <span
              data-testid="subfaction-badge"
              className="shrink-0 bg-amber-400/20 text-amber-400 text-[13px] font-medium px-2 py-0.5 rounded-full"
            >
              {data.subfaction}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 md:px-4 md:py-3 space-y-3">
        {/* Main description — render markdown */}
        <div
          className="text-slate-300 leading-relaxed text-[13px] md:text-[15px] break-words"
          dangerouslySetInnerHTML={{ __html: renderMarkdownFn(data.description) }}
        />

        {/* Sub-rules */}
        {data.subRules && data.subRules.length > 0 && (
          <div data-testid="sub-rules" className="space-y-2">
            {data.subRules.map((subRule) => {
              const highlighted = subRuleIsHighlighted(subRule, highlightTerms)
              return (
                <div
                  key={subRule.name}
                  data-testid={`sub-rule-${subRule.name}`}
                  className={`border border-slate-700 rounded px-3 py-2 ${highlighted ? 'bg-amber-400/10' : ''}`}
                >
                  <span
                    className={`text-[11px] md:text-[13px] font-bold uppercase tracking-wider ${subRuleNameClass} mr-2`}
                  >
                    {subRule.name}
                  </span>
                  <span
                    className="text-slate-300 text-[13px] md:text-[15px] break-words"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownFn(subRule.description) }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ErrataSection errata={data.errata} />

      {/* Footer */}
      <div className="px-3 py-2 md:px-4 border-t border-slate-800 flex items-center gap-3">
        {data.appliesTo !== undefined && (
          <button
            data-testid="applies-to"
            className="text-[13px] text-slate-500 hover:text-slate-400 cursor-pointer bg-transparent border-0 p-0 text-left"
            onClick={() => onContentClick(data.name)}
          >
            Applies to {data.appliesTo} datasheets
          </button>
        )}
        {data.sources
          ?.filter((s) => s.type === 'pdf')
          .map((src, i) =>
            src.page && context.onViewSource ? (
              <button
                key={i}
                data-testid="view-source"
                className="text-[13px] text-blue-400 hover:text-blue-300 cursor-pointer bg-transparent border-0 p-0"
                onClick={() =>
                  context.onViewSource!(
                    src.title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, ''),
                    src.page!,
                    data.name,
                    src.topPct,
                    src.heightPct,
                    src.leftPct,
                    src.widthPct,
                  )
                }
              >
                View source (p.{src.page})
              </button>
            ) : null,
          )}
      </div>
    </div>
  )
}
