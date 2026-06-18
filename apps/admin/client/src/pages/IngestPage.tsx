import { useState } from 'react'

import { addIngestSourceSchema } from '../../../server/src/schemas/ingest.js'
import { ZodForm } from '../lib/form/ZodForm'
import { trpc } from '../lib/trpc'

export function IngestPage() {
  const sources = trpc.stats.ingestSourcesList.useQuery()
  const ingestJobs = trpc.stats.ingestJobs.useQuery({ limit: 50 })
  const addSource = trpc.stats.addIngestSource.useMutation()
  const toggleSource = trpc.stats.toggleIngestSource.useMutation()
  const triggerDiscover = trpc.stats.triggerDiscover.useMutation()
  const triggerProcess = trpc.stats.triggerProcess.useMutation()
  const youtubeIngest = trpc.stats.triggerYoutubeIngest.useMutation()
  const webIngest = trpc.stats.triggerWebIngest.useMutation()

  const [sourceFilter, setSourceFilter] = useState<string | undefined>()
  const [manualUrl, setManualUrl] = useState('')
  const [manualType, setManualType] = useState<'youtube' | 'web'>('youtube')
  const [actionResult, setActionResult] = useState<string | null>(null)

  const sourceList = sources.data ?? []
  const content = ingestJobs.data ?? []

  // ── Manual Ingest ──────────────────────────────────────────────────────

  const handleManualIngest = () => {
    if (!manualUrl.trim()) return
    setActionResult(null)
    const mutation = manualType === 'youtube' ? youtubeIngest : webIngest
    mutation.mutate(
      { url: manualUrl.trim() },
      {
        onSuccess: (data) => {
          setActionResult(`${data.status}: ${data.message}`)
          if (data.status === 'triggered') {
            setManualUrl('')
            ingestJobs.refetch()
          }
        },
      },
    )
  }

  if (sources.isLoading || ingestJobs.isLoading) {
    return <p className="text-slate-400">Loading...</p>
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-100">Content Ingestor</h1>

      {/* ── Sources ── */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
          Sources
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          {sourceList.length > 0 && (
            <div className="space-y-2">
              {sourceList.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded px-3 py-2 hover:bg-slate-800"
                >
                  <div>
                    <span className="text-sm text-slate-200">{s.name}</span>
                    <span className="ml-2">
                      <SourceTypeBadge type={s.type} />
                    </span>
                    <div className="text-xs text-slate-500 truncate max-w-[400px]">{s.url}</div>
                  </div>
                  <button
                    onClick={() =>
                      toggleSource.mutate(
                        { id: s.id, active: !s.active },
                        { onSuccess: () => sources.refetch() },
                      )
                    }
                    className={`px-3 py-1 text-xs rounded border ${
                      s.active
                        ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                        : 'bg-slate-400/10 text-slate-400 border-slate-400/20'
                    }`}
                  >
                    {s.active ? 'Active' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add source form — driven by the server Zod schema */}
          <div className="pt-2 border-t border-slate-800">
            <ZodForm
              schema={addIngestSourceSchema}
              defaultValues={{ name: '', url: '', type: 'youtube' }}
              onSubmit={(values) => {
                addSource.mutate(values, {
                  onSuccess: () => sources.refetch(),
                })
              }}
              isPending={addSource.isPending}
              submitLabel="Add"
              fieldConfig={{
                name: { label: 'Name', placeholder: 'Channel or site name' },
                url: { label: 'URL', placeholder: 'https://youtube.com/@... or https://...' },
                type: { label: 'Type' },
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Actions ── */}
      <section>
        <div className="flex gap-3">
          <button
            onClick={() =>
              triggerDiscover.mutate(undefined, {
                onSuccess: () => {
                  ingestJobs.refetch()
                  setActionResult('Discovery triggered')
                },
              })
            }
            disabled={triggerDiscover.isPending}
            className="px-4 py-2 bg-slate-700 text-slate-200 rounded text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
          >
            {triggerDiscover.isPending ? 'Discovering...' : 'Discover New Content'}
          </button>
          <button
            onClick={() =>
              triggerProcess.mutate(undefined, {
                onSuccess: () => {
                  ingestJobs.refetch()
                  setActionResult('Processing triggered')
                },
              })
            }
            disabled={triggerProcess.isPending}
            className="px-4 py-2 bg-slate-700 text-slate-200 rounded text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
          >
            {triggerProcess.isPending ? 'Processing...' : 'Process Discovered'}
          </button>
        </div>
        {actionResult && <p className="mt-2 text-sm text-slate-400">{actionResult}</p>}
      </section>

      {/* ── Manual URL ── */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
          Manual Ingest
        </h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input
              type="text"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="Paste a single URL to ingest"
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setManualType('youtube')}
              className={`px-3 py-2 text-sm rounded-l border ${manualType === 'youtube' ? 'bg-purple-400/10 text-purple-400 border-purple-400/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
            >
              YT
            </button>
            <button
              onClick={() => setManualType('web')}
              className={`px-3 py-2 text-sm rounded-r border ${manualType === 'web' ? 'bg-blue-400/10 text-blue-400 border-blue-400/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
            >
              Web
            </button>
          </div>
          <button
            onClick={handleManualIngest}
            disabled={youtubeIngest.isPending || webIngest.isPending || !manualUrl.trim()}
            className="px-4 py-2 bg-amber-400 text-slate-950 rounded font-medium text-sm hover:bg-amber-300 disabled:opacity-50"
          >
            Ingest
          </button>
        </div>
      </section>

      {/* ── Content List ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
            Content {content.length > 0 && <span className="font-normal">({content.length})</span>}
          </h2>
          {/* Source filter tabs */}
          <div className="flex gap-1">
            <FilterTab
              label="All"
              active={!sourceFilter}
              onClick={() => setSourceFilter(undefined)}
            />
            {sourceList.map((s) => (
              <FilterTab
                key={s.id}
                label={s.name}
                active={sourceFilter === s.id}
                onClick={() => setSourceFilter(s.id)}
              />
            ))}
          </div>
        </div>

        {content.length === 0 && (
          <p className="text-slate-400 text-sm">
            No content discovered yet. Add sources and run discovery.
          </p>
        )}
        {content.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Title</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Source</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Nodes</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Discovered</th>
                </tr>
              </thead>
              <tbody>
                {content.map((item) => (
                  <tr key={item.id} className="border-b border-slate-800/50 last:border-0">
                    <td className="px-4 py-3 text-slate-200 max-w-[350px]">
                      <div className="truncate" title={item.title ?? item.url}>
                        {item.title || <span className="text-slate-500 italic">Untitled</span>}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{item.url}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">{item.sourceName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-100 text-right font-mono">
                      {item.nodesExtracted ?? 0}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatTs(item.createdAt)}</td>
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

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded border ${
        active
          ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

function SourceTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    youtube: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    web: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs border rounded ${colors[type] ?? 'bg-slate-400/10 text-slate-400 border-slate-400/20'}`}
    >
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    discovered: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20',
    transcribing: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    transcribed: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    extracting: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    failed: 'bg-red-400/10 text-red-400 border-red-400/20',
    skipped: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs border rounded ${colors[status] ?? 'bg-slate-400/10 text-slate-400 border-slate-400/20'}`}
    >
      {status}
    </span>
  )
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
