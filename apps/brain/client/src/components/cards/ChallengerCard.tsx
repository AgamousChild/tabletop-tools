import { ErrataSection } from './ErrataSection'
import type { CardContext, ChallengerCardData } from './types'

interface ChallengerCardProps {
  data: ChallengerCardData
  context: CardContext
}

/** Extract a labeled section (WHEN/TARGET/EFFECT) from stratagem-style content */
function extractSection(content: string, label: string): string {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]+:\\*\\*|$)`, 'i')
  const m = content.match(re)
  return m ? m[1].trim() : ''
}

interface SectionRowProps {
  label: string
  text: string
}

function SectionRow({ label, text }: SectionRowProps) {
  if (!text) return null
  return (
    <div className="px-3 py-1.5 rounded">
      <span className="text-[10px] md:text-xs font-bold text-orange-400 uppercase tracking-wider mr-2">
        {label}
      </span>
      <span className="text-xs md:text-sm text-slate-300">{text}</span>
    </div>
  )
}

export function ChallengerCard({ data, context }: ChallengerCardProps) {
  const content = data.content || ''

  // If the content has stratagem-style WHEN/TARGET/EFFECT sections, render them structured.
  // Otherwise fall back to plain text.
  const when = extractSection(content, 'WHEN')
  const target = extractSection(content, 'TARGET')
  const effect = extractSection(content, 'EFFECT')
  const hasStructured = !!(when || target || effect)

  // Strip structured sections from the narrative portion
  const narrative = hasStructured
    ? content
        .replace(/\*\*WHEN:\*\*[\s\S]*?(?=\*\*[A-Z]+:\*\*|$)/i, '')
        .replace(/\*\*TARGET:\*\*[\s\S]*?(?=\*\*[A-Z]+:\*\*|$)/i, '')
        .replace(/\*\*EFFECT:\*\*[\s\S]*/i, '')
        .trim()
    : content

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        data-testid="challenger-card-header"
        className="px-3 py-2 md:px-4 md:py-3 border-b border-orange-500"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-['Oswald'] uppercase tracking-wide text-white text-base font-semibold">
            {data.name}
          </h2>
          <span
            data-testid="challenger-badge"
            className="shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400"
          >
            CHALLENGER
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 py-2">
        {/* Narrative / VP condition text */}
        {narrative && (
          <div className="px-3 md:px-4">
            <p className="text-slate-300 text-xs md:text-sm leading-relaxed whitespace-pre-wrap break-words">
              {narrative}
            </p>
          </div>
        )}

        {/* Structured stratagem sections */}
        {hasStructured && (
          <div
            data-testid="challenger-stratagem"
            className="mt-1 border-t border-slate-800 pt-1"
          >
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Paired Stratagem
            </p>
            <SectionRow label="WHEN" text={when} />
            <SectionRow label="TARGET" text={target} />
            <SectionRow label="EFFECT" text={effect} />
          </div>
        )}

        {/* Plain text fallback when no structured sections */}
        {!hasStructured && !narrative && (
          <div className="px-3 md:px-4">
            <p className="text-slate-500 text-xs italic">No content available.</p>
          </div>
        )}
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
