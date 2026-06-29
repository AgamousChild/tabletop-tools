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
  // Derive a viewable PDF source for the footer link. The first source with a
  // page is the canonical reference; non-PDF sources (MFM URL, etc.) still
  // get a "View source" affordance via the URL.
  const pdfSource = data.sources?.find((s) => s.page != null)
  const pageSource = data.sources?.[0]
  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header */}
        <div className="border-b-2 border-blue-500 pb-1 mb-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="text-[15px] font-bold uppercase tracking-wider text-white"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              {data.name}
            </span>
            {data.factionName && (
              <span className="text-[10px] text-blue-400 uppercase tracking-wide shrink-0">
                {data.factionName}
              </span>
            )}
          </div>
          <div className="text-[10px] text-blue-400 uppercase tracking-wide mt-0.5">
            {data.factionName || data.factionId} — Detachment Ability
          </div>
          {/* 11e structured chips: DP cost, force-disposition, chapter badge.
              All three are MFM-sourced (PR #70) — render together so they live
              as a single band beneath the header. */}
          {(data.dp != null || data.forceDisposition || data.chapterBadge) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {data.dp != null && (
                <span
                  data-testid="detachment-dp"
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                >
                  {data.dp} DP
                </span>
              )}
              {data.forceDisposition && (
                <span
                  data-testid="detachment-force-disposition"
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40"
                >
                  {data.forceDisposition}
                </span>
              )}
              {data.chapterBadge && (
                <span
                  data-testid="detachment-chapter-badge"
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20"
                >
                  {data.chapterBadge}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Ability text */}
        <div
          className="text-xs text-slate-300 leading-snug"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(data.abilityText) }}
        />

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
              <span
                key={f}
                className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded"
              >
                {f}
              </span>
            ))}
          </div>
        ) : null}

        {/* Sources footer — matches the View-source affordance the markdown
            overlay used to render. Uses the first PDF source's page when
            available, otherwise the first source's title. */}
        {(pdfSource || pageSource) && (
          <div
            data-testid="detachment-sources"
            className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 pt-1 border-t border-slate-800"
          >
            {pdfSource && context.onViewSource ? (
              <button
                type="button"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                onClick={() =>
                  context.onViewSource!(
                    pdfSource.title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, ''),
                    pdfSource.page!,
                    data.name,
                    pdfSource.topPct,
                    pdfSource.heightPct,
                    pdfSource.leftPct,
                    pdfSource.widthPct,
                  )
                }
              >
                View source (p.{pdfSource.page})
              </button>
            ) : (
              <span>Source: {pageSource?.title}</span>
            )}
          </div>
        )}
      </div>

      <ErrataSection errata={data.errata} />
    </div>
  )
}
