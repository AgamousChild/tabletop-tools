import { renderMarkdown } from '../../lib/render-markdown'
import { CollapsibleSection } from '../CollapsibleSection'
import { EnhancementCard } from './EnhancementCard'
import { ErrataSection } from './ErrataSection'
import { StratagemCard } from './StratagemCard'
import type { CardContext, DetachmentCardData } from './types'

interface DetachmentCardProps {
  data: DetachmentCardData
  context: CardContext
}

export function DetachmentCard({ data, context }: DetachmentCardProps) {
  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header */}
        <div className="border-b-2 border-blue-500 pb-1 mb-1.5">
          <div className="flex items-baseline justify-between">
            <span
              className="text-[15px] font-bold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              {data.name}
            </span>
            {data.factionName && (
              <span className="text-[10px] text-blue-400 uppercase tracking-wide shrink-0 ml-2">
                {data.factionName}
              </span>
            )}
          </div>
          <div className="text-[10px] text-blue-400 uppercase tracking-wide mt-0.5">
            {data.factionName || data.factionId} — Detachment Ability
          </div>
        </div>

        {/* Ability text */}
        <div className="text-xs text-slate-300 leading-snug"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(data.abilityText) }}
        />

        {/* Chapter badge */}
        {data.chapterBadge && (
          <span className="inline-block text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded mt-2">
            {data.chapterBadge}
          </span>
        )}

        {/* Collapsible stratagems */}
        <CollapsibleSection title="Stratagems" count={data.stratagems.length}>
          <div className="space-y-2 pt-1">
            {data.stratagems.map((s) => (
              <StratagemCard key={s.id} data={s} context={context} />
            ))}
          </div>
        </CollapsibleSection>

        {/* Collapsible enhancements */}
        <CollapsibleSection title="Enhancements" count={data.enhancements.length}>
          <div className="space-y-2 pt-1">
            {data.enhancements.map((e) => (
              <EnhancementCard key={e.id} data={e} context={context} />
            ))}
          </div>
        </CollapsibleSection>

        {/* Quality flags */}
        {data.qualityFlags?.length ? (
          <div className="flex gap-1 mt-2">
            {data.qualityFlags.map((f) => (
              <span key={f} className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                {f}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <ErrataSection errata={data.errata} />
    </div>
  )
}
