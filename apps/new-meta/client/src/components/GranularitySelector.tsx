import { trpc } from '../lib/trpc'

interface Props {
  value: number | undefined
  onChange: (value: number | undefined) => void
}

/**
 * Granularity picker (Faction / SubFaction / Detachment). Renders
 * nothing when fewer than two granularities have any meta_top rows,
 * so apps with only one populated granularity keep their old
 * single-axis UI.
 *
 * Source of truth: `meta.availableFilters.granularities`, which
 * reads `dim_granularity` joined to `meta_top` — never a hardcoded
 * id list.
 */
export function GranularitySelector({ value, onChange }: Props) {
  const { data } = trpc.meta.availableFilters.useQuery()
  const granularities = data?.granularities ?? []

  if (granularities.length < 2) return null

  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? undefined : Number(raw))
      }}
      className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-slate-100 text-sm"
      aria-label="Granularity"
    >
      <option value="">Default</option>
      {granularities.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  )
}
