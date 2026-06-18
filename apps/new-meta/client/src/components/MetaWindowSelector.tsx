import { trpc } from '../lib/trpc'

interface Props {
  value: string | undefined
  onChange: (value: string | undefined) => void
}

export function MetaWindowSelector({ value, onChange }: Props) {
  const { data: frames = [] } = trpc.meta.frames.useQuery()

  // Group frames by type
  const quarters = frames.filter((f) => f.typeId === 4)
  const months = frames.filter((f) => f.typeId === 3)
  const years = frames.filter((f) => f.typeId === 5)
  const dataslates = frames.filter((f) => f.typeId === 6)

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 text-sm"
    >
      <option value="">Latest Quarter</option>
      <optgroup label="Quarters">
        {quarters.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Months">
        {months.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Years">
        {years.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </optgroup>
      {dataslates.length > 0 && (
        <optgroup label="Balance Dataslates">
          {dataslates.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
