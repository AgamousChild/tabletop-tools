import { useState } from 'react'
import { trpc } from '../lib/trpc'
import { useSession } from '../lib/auth'

export function Admin() {
  const { data: session } = useSession()
  const [csv, setCsv] = useState('')
  const [format, setFormat] = useState<'bcp-csv' | 'tabletop-admiral-csv' | 'generic-csv'>('bcp-csv')
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [metaWindow, setMetaWindow] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const importMutation = trpc.admin.import.useMutation({
    onSuccess: (data) => {
      setResult(
        `Imported ${data.imported} players. Glicko-2 ratings updated for ${data.playersUpdated} players.`,
      )
      setError(null)
      setCsv('')
    },
    onError: (err) => {
      setError(err.message)
      setResult(null)
    },
  })

  if (!session?.user) {
    return (
      <div className="text-slate-400 text-sm py-8 text-center">
        You must be logged in to access the admin panel.
      </div>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!csv.trim() || !eventName.trim() || !eventDate || !metaWindow.trim()) {
      setError('All fields are required.')
      return
    }
    setError(null)
    importMutation.mutate({ csv, format, eventName, eventDate, metaWindow })
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-100">Admin — Import Tournament</h1>
      <p className="text-xs text-slate-500 mb-4">
        Paste CSV tournament results below. Select the format, fill in event details, and click Import to add the data and update Glicko-2 ratings.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">CSV Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
            className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-100 w-full"
          >
            <option value="bcp-csv">BCP CSV</option>
            <option value="tabletop-admiral-csv">Tabletop Admiral CSV</option>
            <option value="generic-csv">Generic CSV</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Event Name</label>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="e.g. London GT 2025"
            className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-100 w-full"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Event Date</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-100 w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Meta Window</label>
            <input
              value={metaWindow}
              onChange={(e) => setMetaWindow(e.target.value)}
              placeholder="e.g. 2025-Q2"
              className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-100 w-full"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">CSV Data</label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="Paste CSV here…"
            rows={12}
            className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-100 w-full font-mono text-xs"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        {result && (
          <p className="text-emerald-400 text-sm">{result}</p>
        )}

        <button
          type="submit"
          disabled={importMutation.isPending}
          className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold rounded px-6 py-2 text-sm disabled:opacity-50"
        >
          {importMutation.isPending ? 'Importing…' : 'Import Tournament'}
        </button>
      </form>
    </div>
  )
}
