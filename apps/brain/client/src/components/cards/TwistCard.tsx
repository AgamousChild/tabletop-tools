import { ErrataSection } from './ErrataSection'
import type { CardContext, TwistCardData } from './types'

interface TwistCardProps {
  data: TwistCardData
  context: CardContext
}

export function TwistCard({ data, context }: TwistCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        data-testid="twist-card-header"
        className="px-3 py-2 md:px-4 md:py-3 border-b border-green-500"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-['Oswald'] uppercase tracking-wide text-white text-[17px] font-semibold">
            {data.name}
          </h2>
          <span
            data-testid="twist-badge"
            className="shrink-0 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-500/20 text-green-400"
          >
            TWIST
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 md:px-4 md:py-3">
        <p className="text-slate-300 text-[13px] md:text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {data.description}
        </p>
      </div>

      <ErrataSection errata={data.errata} />

      {/* Footer */}
      <div className="px-3 py-2 md:px-4 border-t border-slate-800 flex items-center gap-3">
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
                    src.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
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
