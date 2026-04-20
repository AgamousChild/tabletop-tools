import { ErrataSection } from './ErrataSection'
import type { CardContext, MissionCardData } from './types'

interface MissionCardProps {
  data: MissionCardData
  context: CardContext
}

export function MissionCard({ data, context }: MissionCardProps) {
  const isPrimary = data.missionType === 'primary'
  const borderColor = isPrimary ? 'border-amber-400' : 'border-blue-400'
  const badgeColor = isPrimary
    ? 'bg-amber-500/20 text-amber-400'
    : 'bg-blue-500/20 text-blue-400'
  const typeLabel = isPrimary ? 'PRIMARY MISSION' : 'SECONDARY MISSION'

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        data-testid="mission-card-header"
        className={`px-3 py-2 md:px-4 md:py-3 border-b ${borderColor}`}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-['Oswald'] uppercase tracking-wide text-white text-base font-semibold">
            {data.name}
          </h2>
          <div className="flex gap-1 shrink-0 flex-wrap justify-end">
            <span
              data-testid="mission-type-badge"
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badgeColor}`}
            >
              {typeLabel}
            </span>
            {data.isFixed && (
              <span
                data-testid="fixed-badge"
                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400"
              >
                FIXED
              </span>
            )}
            {data.side && (
              <span
                data-testid="side-badge"
                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-700 text-slate-300"
              >
                {data.side}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 md:px-4 md:py-3">
        <p className="text-slate-300 text-xs md:text-sm leading-relaxed whitespace-pre-wrap break-words">
          {data.content}
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
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer bg-transparent border-0 p-0"
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
