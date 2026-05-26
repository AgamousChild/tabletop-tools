import { EnhancementCard } from '../components/cards/EnhancementCard'
import { RuleCard } from '../components/cards/RuleCard'
import { StratagemCard } from '../components/cards/StratagemCard'
import type {
  EnhancementCardData,
  RuleCardData,
  StratagemCardData,
} from '../components/cards/types'

export interface DetachmentPageProps {
  detachmentName: string
  factionId: string
  subfaction?: string
  ability?: RuleCardData
  stratagems: StratagemCardData[]
  enhancements: EnhancementCardData[]
  onContentClick: (term: string) => void
  onBack: () => void
}

export function DetachmentPage({
  detachmentName,
  subfaction,
  ability,
  stratagems,
  enhancements,
  onContentClick,
  onBack,
}: DetachmentPageProps) {
  const cardContext = {
    highlightTerms: [] as string[],
    onContentClick,
    onDismiss: () => {},
  }

  const hasContent = ability || stratagems.length > 0 || enhancements.length > 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header bar */}
      <div className="border-b border-slate-800 px-4 py-3 flex items-center gap-4">
        <button
          onClick={onBack}
          aria-label="Back"
          className="text-slate-400 hover:text-slate-100 flex items-center gap-1 text-sm transition-colors"
        >
          ← Back
        </button>

        <h1 className="flex-1 text-lg font-bold text-amber-400 uppercase tracking-wide font-['Oswald']">
          {detachmentName}
        </h1>

        {subfaction && (
          <span
            data-testid="chapter-badge"
            className="shrink-0 bg-amber-400/20 text-amber-400 text-xs font-medium px-2 py-1 rounded-full border border-amber-400/30"
          >
            {subfaction} only
          </span>
        )}
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Detachment ability */}
        {ability && (
          <section>
            <RuleCard data={ability} context={cardContext} />
          </section>
        )}

        {/* Stratagems */}
        {stratagems.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
              Stratagems
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stratagems.map((s) => (
                <StratagemCard key={s.id} data={s} context={cardContext} />
              ))}
            </div>
          </section>
        )}

        {/* Enhancements */}
        {enhancements.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
              Enhancements
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {enhancements.map((e) => (
                <EnhancementCard key={e.id} data={e} context={cardContext} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!hasContent && (
          <div className="text-center py-16 text-slate-500">
            <p>No rules found for this detachment.</p>
          </div>
        )}
      </div>
    </div>
  )
}
