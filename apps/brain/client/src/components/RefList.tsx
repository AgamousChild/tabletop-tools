import type { StoredRef } from '../lib/store'

const REL_COLORS: Record<string, string> = {
  part_of: 'text-blue-400',
  supersedes: 'text-red-400',
  clarifies: 'text-orange-400',
  requires: 'text-yellow-400',
  modifies: 'text-purple-400',
  triggers: 'text-green-400',
  sequence_adjacent: 'text-cyan-400',
  interacts_with: 'text-amber-400',
  commonly_confused: 'text-rose-400',
  edge_case: 'text-pink-400',
  stacks_with: 'text-indigo-400',
  prevents: 'text-red-500',
}

export function RefList({
  refs,
  onNodeClick,
}: {
  refs: StoredRef[]
  onNodeClick: (nodeId: string) => void
}) {
  if (refs.length === 0) {
    return <p className="text-sm text-slate-500 italic">No connections found.</p>
  }

  return (
    <ul className="space-y-2">
      {refs.map((ref, i) => (
        <li key={i} className="bg-slate-900 border border-slate-800 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium ${REL_COLORS[ref.rel] || 'text-slate-400'}`}>
              {ref.rel}
            </span>
            <button
              onClick={() => onNodeClick(ref.targetId)}
              className="text-sm text-amber-400 hover:underline"
            >
              {ref.targetId}
            </button>
          </div>
          <p className="text-xs text-slate-400">{ref.context}</p>
        </li>
      ))}
    </ul>
  )
}
