import { trpc } from '../lib/trpc'

interface Props {
  value: string | undefined
  onChange: (value: string | undefined) => void
}

function formatEndDate(endDate: number | null): string {
  if (endDate == null) return ''
  const d = new Date(endDate)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function MetaWindowSelector({ value, onChange }: Props) {
  const { data } = trpc.meta.availableFilters.useQuery()

  const types = data?.types ?? []
  const framesByType = data?.framesByType ?? {}

  // Show types that have at least one populated frame, in dim order.
  const populatedTypes = types.filter((t) => t.framesWithData > 0)

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 text-sm"
    >
      <option value="">Latest Quarter</option>
      {populatedTypes.map((type) => {
        const frames = (framesByType[type.id] ?? []).filter((f) => f.hasData)
        if (frames.length === 0) return null
        return (
          <optgroup key={type.id} label={`${type.name}s`}>
            {frames.map((f) => {
              const suffix = formatEndDate(f.endDate)
              return (
                <option key={f.id} value={f.id}>
                  {suffix ? `${f.label} (through ${suffix})` : f.label}
                </option>
              )
            })}
          </optgroup>
        )
      })}
    </select>
  )
}
