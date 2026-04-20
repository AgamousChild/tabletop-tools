import { CollapsibleSection } from '../CollapsibleSection'
import type { ErrataEntry } from './types'

interface ErrataSectionProps {
  errata?: ErrataEntry[]
}

export function ErrataSection({ errata }: ErrataSectionProps) {
  if (!errata || errata.length === 0) return null
  return (
    <CollapsibleSection title="Errata & FAQ" count={errata.length}>
      <div className="space-y-2 px-3">
        {errata.map((e) => (
          <div key={e.nodeId} className="text-xs text-slate-400">
            <span className="font-medium text-slate-300">{e.title}</span>
            {e.source.page && <span className="text-slate-600 ml-1">(p.{e.source.page})</span>}
            <p className="mt-0.5 text-slate-500">
              {e.content.length > 200 ? e.content.substring(0, 197) + '...' : e.content}
            </p>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  )
}
