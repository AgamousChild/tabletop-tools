import { trpc } from '../lib/trpc'
import { StatCard } from '../components/StatCard'

export function PipelinePage() {
  const { data, isLoading, error } = trpc.stats.pipeline.useQuery()

  if (isLoading) return <p className="text-slate-400 text-sm">Loading...</p>
  if (error) return <p className="text-red-400 text-sm">Error: {error.message}</p>
  if (!data) return <p className="text-slate-400 text-sm">No data.</p>

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-100">Data Pipeline Status</h1>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-3">3NF Source Data</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Events" value={data.meta.events.toLocaleString()} />
          <StatCard label="Players" value={data.meta.players.toLocaleString()} />
          <StatCard label="Pairings" value={data.meta.pairings.toLocaleString()} />
          <StatCard label="With Lists" value={data.meta.withLists.toLocaleString()} />
          <StatCard label="With Detachment" value={data.meta.withDetachment.toLocaleString()} />
          <StatCard
            label="Date Range"
            value={data.meta.earliestEvent && data.meta.latestEvent
              ? `${new Date(data.meta.earliestEvent).toLocaleDateString()} - ${new Date(data.meta.latestEvent).toLocaleDateString()}`
              : '—'
            }
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-3">Analytics Cube</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Fact Rows" value={data.cube.factRows.toLocaleString()} />
          <StatCard label="Frames" value={data.cube.frames.toLocaleString()} />
          <StatCard label="Meta Top Rows" value={data.cube.metaTopRows.toLocaleString()} />
          <StatCard
            label="Cube Status"
            value={data.cube.status}
            color={data.cube.status === 'complete' ? 'emerald' : data.cube.status === 'failed' ? 'red' : 'amber'}
          />
          <StatCard
            label="Last Built"
            value={data.cube.lastCompleted ? new Date(data.cube.lastCompleted).toLocaleString() : '—'}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-3">Dimensions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Factions" value={String(data.dimensions.factions)} />
          <StatCard label="Detachments" value={String(data.dimensions.detachments)} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-3">Coverage</h2>
        <div className="space-y-2">
          <CoverageBar label="Army Lists" value={data.meta.withLists} total={data.meta.players} />
          <CoverageBar label="Detachments" value={data.meta.withDetachment} total={data.meta.players} />
        </div>
      </section>
    </div>
  )
}

function CoverageBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  const color = pct > 75 ? 'bg-emerald-400' : pct > 50 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">{value.toLocaleString()} / {total.toLocaleString()} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-2">
        <div className={`${color} rounded-full h-2 transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
