import type { BrainNode } from '../lib/store'

const LAYER_COLORS: Record<string, string> = {
  core: 'bg-blue-600',
  faction: 'bg-purple-600',
  unit: 'bg-green-600',
  errata: 'bg-orange-600',
  balance: 'bg-red-600',
  community: 'bg-cyan-600',
}

export function NodeCard({ node }: { node: BrainNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium text-white ${LAYER_COLORS[node.layer] || 'bg-slate-600'}`}
        >
          {node.layer}
        </span>
        <span className="text-xs text-slate-400">{node.category}</span>
        {node.phase && <span className="text-xs text-slate-500">({node.phase})</span>}
      </div>
      <h2 className="text-lg font-bold text-slate-100 mb-1">{node.title}</h2>
      <p className="text-sm text-slate-400 mb-3">{node.summary}</p>
      <div className="text-sm text-slate-300 whitespace-pre-wrap mb-3">{node.content}</div>
      {node.sources.length > 0 && (
        <div className="border-t border-slate-800 pt-2 mt-2">
          <p className="text-xs text-slate-500">
            Sources:{' '}
            {node.sources.map((s) => `${s.title}${s.page ? ` p.${s.page}` : ''}`).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}
