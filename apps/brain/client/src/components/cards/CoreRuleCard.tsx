import { ErrataSection } from './ErrataSection'
import { renderMarkdown } from '../../lib/render-markdown'
import type { CardContext, CoreRuleCardData } from './types'

interface CoreRuleCardProps {
  data: CoreRuleCardData
  context: CardContext
}

export function CoreRuleCard({ data, context }: CoreRuleCardProps) {
  const pdfSources = data.sources?.filter(
    (s) => s.type === 'pdf' && s.page !== undefined,
  )

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header — rule name (left) + optional phase badge (right) */}
        <div className="flex items-baseline justify-between border-b-2 border-amber-500 pb-1 mb-1.5">
          <span
            className="text-[15px] font-bold uppercase tracking-wider text-white"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.name}
          </span>
          {data.phase && (
            <span className="text-[10px] text-amber-400 uppercase tracking-wide bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0 ml-2">
              {data.phase}
            </span>
          )}
        </div>

        {/* Description */}
        <div className="text-xs text-slate-300 leading-snug"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(data.description) }}
        />

        {/* Optional HTML table */}
        {data.tableHtml && (
          <div
            className="overflow-x-auto text-[11px] mt-2"
            dangerouslySetInnerHTML={{ __html: data.tableHtml }}
          />
        )}

        {/* Quality flags */}
        {data.qualityFlags && data.qualityFlags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
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

        {/* View Source button */}
        {pdfSources && pdfSources.length > 0 && context.onViewSource && (
          <div className="mt-2">
            {pdfSources.map((src, i) => (
              <button
                key={i}
                className="text-[10px] text-slate-500 hover:text-amber-400 underline bg-transparent border-0 p-0 cursor-pointer"
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
            ))}
          </div>
        )}
      </div>

      <ErrataSection errata={data.errata} />
    </div>
  )
}
