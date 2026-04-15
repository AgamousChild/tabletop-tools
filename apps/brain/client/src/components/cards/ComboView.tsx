import type { CardData, CardContext } from './types'
import { UnitCard } from './UnitCard'
import { StratagemCard } from './StratagemCard'
import { EnhancementCard } from './EnhancementCard'
import { RuleCard } from './RuleCard'

export interface ComboViewProps {
  leftCard: CardData
  rightCard: CardData
  label: string
  context: CardContext
}

function renderCard(card: CardData, context: CardContext) {
  switch (card.type) {
    case 'unit':
      return <UnitCard data={card.data} context={context} />
    case 'stratagem':
      return <StratagemCard data={card.data} context={context} />
    case 'enhancement':
      return <EnhancementCard data={card.data} context={context} />
    case 'rule':
      return <RuleCard data={card.data} context={context} />
  }
}

function ComboArrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center shrink-0 gap-2 py-2 sm:py-0 sm:px-2">
      <svg
        className="w-16 h-8 text-red-500 shrink-0"
        viewBox="0 0 64 32"
        aria-hidden="true"
      >
        <line x1="0" y1="16" x2="52" y2="16" stroke="currentColor" strokeWidth="2" />
        <polygon points="52,8 64,16 52,24" fill="currentColor" />
      </svg>
      <span className="text-xs text-red-400 text-center max-w-[120px] leading-snug">
        {label}
      </span>
    </div>
  )
}

export function ComboView({ leftCard, rightCard, label, context }: ComboViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="combo-cards"
        className="flex flex-col sm:flex-row items-stretch gap-4"
      >
        <div className="flex-1 min-w-0">
          {renderCard(leftCard, context)}
        </div>
        <ComboArrow label={label} />
        <div className="flex-1 min-w-0">
          {renderCard(rightCard, context)}
        </div>
      </div>
    </div>
  )
}
