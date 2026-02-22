import { trpc } from '../lib/trpc'

interface Props {
  value: string | undefined
  onChange: (value: string | undefined) => void
}

export function MetaWindowSelector({ value, onChange }: Props) {
  const { data: windows = [] } = trpc.meta.windows.useQuery()

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 text-sm"
    >
      <option value="">All periods</option>
      {windows.map((w) => (
        <option key={w} value={w}>
          {w}
        </option>
      ))}
    </select>
  )
}
