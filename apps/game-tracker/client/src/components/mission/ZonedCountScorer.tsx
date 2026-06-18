import { CountScorer } from './CountScorer'

export type Zone = { id: string; label: string; count: number }

type Props = {
  zones: Zone[]
  onChange: (zones: Zone[]) => void
}

export function ZonedCountScorer({ zones, onChange }: Props) {
  function updateZone(id: string, count: number) {
    onChange(zones.map((z) => (z.id === id ? { ...z, count } : z)))
  }
  return (
    <div className="space-y-2">
      {zones.map((zone) => (
        <CountScorer
          key={zone.id}
          label={zone.label}
          value={zone.count}
          min={0}
          max={10}
          onChange={(v) => updateZone(zone.id, v)}
        />
      ))}
    </div>
  )
}
