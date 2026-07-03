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
  phase?: string
  /**
   * Per-node edition tag (e.g. `'11th'`, `'10th'`). Rendered as a dim pill near
   * category / faction so it's visible *why* a given hit came back. When
   * undefined the pill renders nothing — we don't display "Unknown".
   */
  edition?: string
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
  phase,
  edition,
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
        {phase && <span className="text-xs text-slate-400">{phase}</span>}
        {edition && (
          <span
            data-testid="result-card-edition"
            className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/50 text-slate-400"
          >
            {edition}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-300 line-clamp-2">{summary}</p>
    </div>
  )
}
