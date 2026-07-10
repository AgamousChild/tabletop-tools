import { useState } from 'react'

import { StatCard } from '../components/StatCard'
import { trpc } from '../lib/trpc'

export function ScraperPage() {
  const status = trpc.stats.bcpScraperStatus.useQuery()
  const history = trpc.stats.bcpScraperHistory.useQuery({ limit: 20 })
  const scrapeMutation = trpc.stats.triggerBcpScrape.useMutation()
  const pipelineMutation = trpc.stats.triggerMetaPipeline.useMutation()
  const [actionResult, setActionResult] = useState<string | null>(null)
  const [pipelineWarning, setPipelineWarning] = useState<string | null>(null)

  if (status.isLoading) return <p className="text-slate-400">Loading scraper status...</p>
  if (status.error) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-lg p-4">
        <p className="text-red-400">{status.error.message}</p>
      </div>
    )
  }

  const latestJob = status.data?.latestJob
  const totalEvents = status.data?.totalEvents ?? 0

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-100">BCP Scraper</h1>

      {/* Summary stats */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
          Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Events" value={totalEvents.toLocaleString()} />
          <StatCard
            label="Latest Status"
            value={latestJob?.status ?? 'No jobs'}
            color={statusColor(latestJob?.status)}
          />
          <StatCard
            label="Last Run"
            value={latestJob?.startedAt ? formatTs(latestJob.startedAt) : '--'}
          />
          <StatCard label="Triggered By" value={latestJob?.triggeredBy ?? '--'} />
        </div>
      </section>

      {/* Latest job detail */}
      {latestJob && (
        <section>
          <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
            Latest Job
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-3">
              <StatusBadge status={latestJob.status} />
              <span className="text-sm text-slate-400">
                Started: {formatTs(latestJob.startedAt)}
              </span>
              {latestJob.completedAt && (
                <span className="text-sm text-slate-400">
                  Completed: {formatTs(latestJob.completedAt)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
              <div>
                <p className="text-xs text-slate-500">Events Found</p>
                <p className="text-lg font-mono text-slate-100">{latestJob.eventsFound ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Events Scraped</p>
                <p className="text-lg font-mono text-slate-100">{latestJob.eventsScraped ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Pairings Scraped</p>
                <p className="text-lg font-mono text-slate-100">{latestJob.pairingsScraped ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Lists Scraped</p>
                <p className="text-lg font-mono text-slate-100">{latestJob.listsScraped ?? 0}</p>
              </div>
            </div>
            {latestJob.errors && (
              <div className="mt-2 p-2 bg-red-950/50 border border-red-800/50 rounded text-sm text-red-400 whitespace-pre-wrap">
                {latestJob.errors}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Action buttons */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
          Actions
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setActionResult(null)
              scrapeMutation.mutate(undefined, {
                onSuccess: (data) => setActionResult(`Scraper: ${data.message}`),
              })
            }}
            disabled={scrapeMutation.isPending}
            className="px-4 py-2 bg-amber-400 text-slate-950 rounded font-medium text-sm hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scrapeMutation.isPending ? 'Running...' : 'Run Scraper Now'}
          </button>
          <button
            onClick={() => {
              setActionResult(null)
              setPipelineWarning(null)
              pipelineMutation.mutate(undefined, {
                onSuccess: (data) => {
                  if (data.status === 'not-configured') {
                    setPipelineWarning('Cube rebuild is not yet available')
                    return
                  }
                  setActionResult(`Pipeline: ${data.message}`)
                },
              })
            }}
            disabled={pipelineMutation.isPending}
            className="px-4 py-2 bg-slate-700 text-slate-100 rounded font-medium text-sm hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pipelineMutation.isPending ? 'Running...' : 'Rebuild Cube'}
          </button>
        </div>
        {actionResult && <p className="text-sm text-slate-400 mt-2">{actionResult}</p>}
        {pipelineWarning && (
          <div className="mt-2 p-3 bg-amber-950 border border-amber-800 rounded-lg text-sm text-amber-300">
            {pipelineWarning}
          </div>
        )}
      </section>

      {/* History table */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
          Job History{' '}
          {history.data && history.data.length > 0 && (
            <span className="font-normal">({history.data.length})</span>
          )}
        </h2>
        {history.isLoading && <p className="text-slate-400 text-sm">Loading history...</p>}
        {history.data && history.data.length === 0 && (
          <p className="text-slate-400 text-sm">No scrape jobs recorded yet.</p>
        )}
        {history.data && history.data.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Found</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Scraped</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Pairings</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Triggered</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((job) => (
                  <tr key={job.id} className="border-b border-slate-800/50 last:border-0">
                    <td className="px-4 py-3 text-slate-300">{formatTs(job.startedAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-100 text-right font-mono">
                      {job.eventsFound ?? 0}
                    </td>
                    <td className="px-4 py-3 text-slate-100 text-right font-mono">
                      {job.eventsScraped ?? 0}
                    </td>
                    <td className="px-4 py-3 text-slate-100 text-right font-mono">
                      {job.pairingsScraped ?? 0}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{job.triggeredBy}</td>
                    <td className="px-4 py-3 text-red-400 text-xs truncate max-w-[200px]">
                      {job.errors ?? '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    running: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    failed: 'bg-red-400/10 text-red-400 border-red-400/20',
    pending: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
  }
  const colorClass = colors[status] ?? colors.pending

  return (
    <span className={`inline-block px-2 py-0.5 text-xs border rounded ${colorClass}`}>
      {status}
    </span>
  )
}

function statusColor(status?: string): 'emerald' | 'red' | 'amber' | undefined {
  if (status === 'completed') return 'emerald'
  if (status === 'failed') return 'red'
  if (status === 'running') return 'amber'
  return undefined
}

function formatTs(ts: Date | string | number): string {
  const d =
    ts instanceof Date ? ts : new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
