import { ErrataSection } from './ErrataSection'
import { factionDisplayName } from '../../lib/faction-names'
import type { CardContext, StratagemCardData } from './types'

interface StratagemCardProps {
  data: StratagemCardData
  context: CardContext
}

// Renders text with [KEYWORD] tokens as clickable spans
function KeywordText({
  text,
  onContentClick,
}: {
  text: string
  onContentClick: (term: string) => void
}) {
  const parts = text.split(/(\[[^\]]+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[([^\]]+)\]$/)
        if (match) {
          return (
            <button
              key={i}
              className="text-amber-400 font-semibold hover:underline cursor-pointer bg-transparent border-0 p-0 m-0 font-[inherit] text-[inherit]"
              onClick={() => onContentClick(match[1])}
            >
              {part}
            </button>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function sectionIsHighlighted(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false
  const lower = text.toLowerCase()
  return terms.some((t) => lower.includes(t.toLowerCase()))
}

interface SectionProps {
  testId: string
  label: string
  text: string
  highlighted: boolean
  onContentClick: (term: string) => void
}

function Section({ testId, label, text, highlighted, onContentClick }: SectionProps) {
  return (
    <div
      data-testid={testId}
      className={`px-3 py-2 rounded ${highlighted ? 'bg-amber-400/10' : ''}`}
    >
      <span className="text-[11px] md:text-[13px] font-bold text-blue-400 uppercase tracking-wider mr-2">
        {label}
      </span>
      <span className="text-[13px] md:text-[15px] text-slate-300">
        <KeywordText text={text} onContentClick={onContentClick} />
      </span>
    </div>
  )
}

export function StratagemCard({ data, context }: StratagemCardProps) {
  const { highlightTerms, onContentClick } = context

  return (
    <div className="flex rounded-lg overflow-hidden bg-slate-900 border border-slate-800 shadow-lg w-full min-w-0">
      {/* Left sidebar */}
      <div className="w-9 flex-shrink-0 bg-blue-800 flex flex-col items-center justify-start pt-3">
        {/* CP diamond */}
        <div className="relative w-8 h-8 flex items-center justify-center">
          <div className="absolute w-5 h-5 bg-amber-400 rotate-45" />
          <span className="relative z-10 text-slate-900 font-bold text-[15px] leading-none">
            {data.cpCost}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 py-3 px-3 flex flex-col gap-1">
        {/* Name */}
        <h2
          className="text-[15px] md:text-[17px] text-white font-bold uppercase tracking-wide"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          {data.name}
        </h2>

        {/* Type line — Type — Phase */}
        <p className="text-[11px] md:text-[13px] text-blue-400 mb-1">
          {data.type}{data.phase ? ` — ${data.phase}` : ''}
        </p>

        {/* Sections */}
        <Section
          testId="section-when"
          label="WHEN"
          text={data.when}
          highlighted={sectionIsHighlighted(data.when, highlightTerms)}
          onContentClick={onContentClick}
        />
        <Section
          testId="section-target"
          label="TARGET"
          text={data.target}
          highlighted={sectionIsHighlighted(data.target, highlightTerms)}
          onContentClick={onContentClick}
        />
        <Section
          testId="section-effect"
          label="EFFECT"
          text={data.effect}
          highlighted={sectionIsHighlighted(data.effect, highlightTerms)}
          onContentClick={onContentClick}
        />

        <ErrataSection errata={data.errata} />

        {/* Faction — Detachment footer */}
        <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-1 pt-1 border-t border-slate-800">
          {factionDisplayName(data.subfaction || data.factionId)}{data.detachmentName ? ` — ${data.detachmentName} Detachment` : ''}
        </p>
      </div>
    </div>
  )
}
