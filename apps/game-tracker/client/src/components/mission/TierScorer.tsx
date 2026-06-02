export type Tier = { id: string; label: string; value: number }

type Props = {
  tiers: Tier[]
  selected: string | null
  onChange: (tierId: string) => void
}

export function TierScorer({ tiers, selected, onChange }: Props) {
  return (
    <div className="space-y-1">
      {tiers.map((tier) => (
        <button
          key={tier.id}
          onClick={() => onChange(tier.id)}
          className={`w-full text-left px-3 py-2 rounded text-sm border transition-colors ${
            selected === tier.id
              ? 'border-amber-400 bg-amber-400/10 text-amber-300'
              : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600'
          }`}
        >
          {tier.label}
        </button>
      ))}
    </div>
  )
}
