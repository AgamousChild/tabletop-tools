import { factionDisplayName } from '../lib/faction-names'

const LAYER_COLORS: Record<string, string> = {
  core: 'bg-blue-600',
  faction: 'bg-purple-600',
  unit: 'bg-green-600',
  errata: 'bg-orange-600',
  balance: 'bg-red-600',
  community: 'bg-cyan-600',
}

export interface ResultCardProps {
  index: number
  title: string
  summary: string
  layer: string
  category: string
  score: number
  parentUnit?: string
  factionId?: string
  factionName?: string
  subfaction?: string
  phase?: string
}

export function ResultCard({
  index,
  title,
  summary,
  layer,
  category,
  score,
  parentUnit,
  factionId,
  factionName,
  subfaction,
  phase,
}: ResultCardProps) {
  const pct = score ? Math.round(score * 100) : 0

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold text-sm">#{index}</span>
          <h3 className="font-bold text-slate-100">{title}</h3>
        </div>
        {pct > 0 && <span className="text-xs text-slate-500 shrink-0">{pct}%</span>}
      </div>
      {parentUnit && <p className="text-xs text-slate-400 italic mb-2">on {parentUnit}</p>}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium text-white ${LAYER_COLORS[layer] || 'bg-slate-600'}`}
        >
          {category}
        </span>
        {factionId && (
          <span className="text-xs text-slate-400">
            {factionName || factionDisplayName(factionId)}
          </span>
        )}
        {subfaction && (
          <span className="text-xs text-slate-400">{factionDisplayName(subfaction)}</span>
        )}
        {phase && <span className="text-xs text-slate-400">{phase}</span>}
      </div>
      <p className="text-sm text-slate-300 line-clamp-2">{summary}</p>
    </div>
  )
}
