import { ErrataSection } from './ErrataSection'
import type { CardContext, MissionCardData } from './types'

interface MissionCardProps {
  data: MissionCardData
  context: CardContext
}

export function MissionCard({ data, context }: MissionCardProps) {
  const isPrimary = data.missionType === 'primary'
  const accentBorder = isPrimary ? 'border-amber-500' : 'border-blue-500'
  const accentColor = isPrimary ? 'text-amber-400' : 'text-blue-400'
  const badgeBg = isPrimary ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header */}
        <div className={`border-b-2 ${accentBorder} pb-1 mb-1.5`}>
          <div className="flex items-start justify-between gap-2">
            <h2
              className="text-sm font-bold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Oswald', sans-serif" }}
              data-testid="mission-card-header"
            >
              {data.name}
            </h2>
          </div>
          {/* Badges */}
          <div className="flex gap-1 flex-wrap mt-1">
            <span
              data-testid="mission-type-badge"
              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${badgeBg}`}
            >
              {isPrimary ? 'PRIMARY' : 'SECONDARY'}
            </span>
            {data.isFixed && (
              <span
                data-testid="fixed-badge"
                className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400"
              >
                FIXED
              </span>
            )}
            {data.side && (
              <span
                data-testid="side-badge"
                className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-300"
              >
                {data.side}
              </span>
            )}
          </div>
        </div>

        {/* Render content as structured markdown */}
        <div className="text-xs text-slate-300 leading-snug mb-1.5 space-y-1">
          {data.content.split('\n').map((line, i) => {
            // Bold headers: **WHEN:** or **SECOND BATTLE ROUND ONWARDS**
            if (line.startsWith('**') && line.includes(':**')) {
              const [label, ...rest] = line.replace(/\*\*/g, '').split(':')
              return (
                <div key={i}>
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${accentColor}`}>
                    {label}:
                  </span>{' '}
                  <span className="text-slate-300">{rest.join(':').trim()}</span>
                </div>
              )
            }
            if (line.startsWith('**') && line.endsWith('**')) {
              return (
                <div
                  key={i}
                  className={`text-[11px] font-bold uppercase tracking-wide ${accentColor} mt-2 pt-1 border-t border-slate-800`}
                >
                  {line.replace(/\*\*/g, '')}
                </div>
              )
            }
            // Bullet points with VP: - condition → **5 VP**
            if (line.startsWith('- ')) {
              const vpMatch = line.match(/→\s*\*\*(.+?)\*\*(.*)$/)
              if (vpMatch) {
                const cond = line.slice(2, line.indexOf('→')).trim()
                const vp = vpMatch[1]
                const extra = vpMatch[2]?.trim() || ''
                return (
                  <div
                    key={i}
                    className="flex justify-between items-baseline gap-2 pl-2 border-l-2 border-slate-700 ml-1 py-0.5"
                  >
                    <span className="text-slate-300">{cond}</span>
                    <span className="text-amber-400 font-bold text-[11px] shrink-0">
                      {vp}
                      {extra ? ` ${extra.replace(/[*()]/g, '')}` : ''}
                    </span>
                  </div>
                )
              }
              return (
                <div
                  key={i}
                  className="pl-2 border-l-2 border-slate-700 ml-1 py-0.5 text-slate-300"
                >
                  {line.slice(2)}
                </div>
              )
            }
            // Italic designer note
            if (line.startsWith('*') && line.endsWith('*')) {
              return (
                <div
                  key={i}
                  className="text-[11px] text-slate-500 italic mt-1 border border-slate-800 rounded p-1.5"
                >
                  {line.replace(/^\*|\*$/g, '')}
                </div>
              )
            }
            // Empty lines
            if (!line.trim()) return <div key={i} className="h-1" />
            // Regular text
            return (
              <div key={i} className="text-slate-300">
                {line.replace(/\*\*/g, '')}
              </div>
            )
          })}
        </div>

        {/* View Source */}
        {data.sources
          ?.filter((s) => s.type === 'pdf' && s.page)
          .map((src, i) =>
            context.onViewSource ? (
              <button
                key={i}
                data-testid="view-source"
                className="text-[10px] text-slate-500 hover:text-amber-400 underline mr-2"
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

      <ErrataSection errata={data.errata} />
    </div>
  )
}
