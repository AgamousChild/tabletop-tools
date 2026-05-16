import { useState } from 'react'
import { trpc } from '../lib/trpc'

const SOURCE_NAMES = ['Auspex Tactics', 'Warhammer Community', 'Happy Krumping', 'Custom'] as const

export function IngestPage() {
  const ingestJobs = trpc.stats.ingestJobs.useQuery({ limit: 20 })
  const youtubeIngest = trpc.stats.triggerYoutubeIngest.useMutation()
  const webIngest = trpc.stats.triggerWebIngest.useMutation()

  const [url, setUrl] = useState('')
  const [sourceType, setSourceType] = useState<'youtube' | 'web'>('youtube')
  const [sourceName, setSourceName] = useState<string>(SOURCE_NAMES[0])
  const [customSource, setCustomSource] = useState('')
  const [actionResult, setActionResult] = useState<string | null>(null)

  if (ingestJobs.isLoading) return <p className="text-slate-400">Loading ingest jobs...</p>
  if (ingestJobs.error) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-lg p-4">
        <p className="text-red-400">{ingestJobs.error.message}</p>
      </div>
    )
  }

  // Check if URL already ingested
  const alreadyIngested = jobs.find(j => j.url === url.trim() && j.status !== 'failed')

  const handleSubmit = () => {
    if (!url.trim()) return
    setActionResult(null)
    const resolvedSource = sourceName === 'Custom' ? customSource || undefined : sourceName
    const mutation = sourceType === 'youtube' ? youtubeIngest : webIngest
    mutation.mutate(
      { url: url.trim(), sourceName: resolvedSource },
      {
        onSuccess: (data) => {
          setActionResult(`${data.status}: ${data.message}`)
          if (data.status === 'triggered') {
            setUrl('')
            ingestJobs.refetch()
          }
        },
      },
    )
  }

  const isPending = youtubeIngest.isPending || webIngest.isPending
  const jobs = ingestJobs.data ?? []

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-100">Content Ingestor</h1>

      {/* Ingest form */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">Ingest Content</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or https://..."
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Source Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSourceType('youtube')}
                  className={`px-3 py-1.5 text-sm rounded border ${
                    sourceType === 'youtube'
                      ? 'bg-purple-400/10 text-purple-400 border-purple-400/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-300'
                  }`}
                >
                  YouTube
                </button>
                <button
                  onClick={() => setSourceType('web')}
                  className={`px-3 py-1.5 text-sm rounded border ${
                    sourceType === 'web'
                      ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-300'
                  }`}
                >
                  Web
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Source Name</label>
              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
              >
                {SOURCE_NAMES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {sourceName === 'Custom' && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Custom Name</label>
                <input
                  type="text"
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                  placeholder="Source name"
                  className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={isPending || !url.trim() || !!alreadyIngested}
              className="px-4 py-2 bg-amber-400 text-slate-950 rounded font-medium text-sm hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Submitting...' : alreadyIngested ? 'Already Ingested' : 'Submit'}
            </button>
            {alreadyIngested && (
              <p className="text-sm text-amber-400">This URL was already submitted ({alreadyIngested.status}, {alreadyIngested.nodesExtracted ?? 0} nodes)</p>
            )}
            {actionResult && (
              <p className="text-sm text-slate-400">{actionResult}</p>
            )}
          </div>
        </div>
      </section>

      {/* Job history */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">
          Job History {jobs.length > 0 && <span className="font-normal">({jobs.length})</span>}
        </h2>
        {jobs.length === 0 && (
          <p className="text-slate-400 text-sm">No ingest jobs recorded yet.</p>
        )}
        {jobs.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">URL</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Nodes</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-slate-800/50 last:border-0">
                    <td className="px-4 py-3 text-slate-300 truncate max-w-[300px]" title={job.url}>
                      {job.title || truncateUrl(job.url)}
                    </td>
                    <td className="px-4 py-3"><SourceTypeBadge type={job.sourceType} /></td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3 text-slate-100 text-right font-mono">{job.nodesExtracted ?? 0}</td>
                    <td className="px-4 py-3 text-slate-400">{formatTs(job.createdAt)}</td>
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

function SourceTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    youtube: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    web: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  }
  const colorClass = colors[type] ?? 'bg-slate-400/10 text-slate-400 border-slate-400/20'

  return (
    <span className={`inline-block px-2 py-0.5 text-xs border rounded ${colorClass}`}>
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    transcribing: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    extracting: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
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

function truncateUrl(url: string): string {
  if (url.length <= 50) return url
  return url.slice(0, 47) + '...'
}

function formatTs(ts: Date | string | number): string {
  const d = ts instanceof Date ? ts : new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
