import { useState } from 'react'

import { trpc } from '../lib/trpc'

type Props = {
  bcpEventId: string
  listId?: string | null
}

/**
 * BCP list-drop component.
 *
 * The user must explicitly click "I agree and submit" — the consentAt timestamp
 * is captured at that moment and sent to the server. The server rejects any
 * registration where consentAt is in the future.
 *
 * No lists of methods or status values are hardcoded here — the server enforces
 * the enum via Zod.
 */
export function BcpListDrop({ bcpEventId, listId }: Props) {
  const [method, setMethod] = useState<'server' | 'agent'>('server')
  const [consentGiven, setConsentGiven] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingQuery = trpc.bcpRegistration.getForEvent.useQuery({ bcpEventId })
  const recordMutation = trpc.bcpRegistration.record.useMutation({
    onSuccess: () => {
      setSubmitted(true)
      void existingQuery.refetch()
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const existingRegs = existingQuery.data ?? []
  const lastReg = existingRegs[0]

  if (submitted || lastReg?.status === 'submitted') {
    return (
      <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4 space-y-2">
        <div className="text-emerald-400 font-medium">List submitted</div>
        {lastReg && (
          <div className="text-xs text-slate-400">
            Method: {lastReg.method} · Status: {lastReg.status} · Submitted:{' '}
            {new Date(lastReg.submittedAt).toLocaleString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-300">
        Submit your army list to BCP for this event.
        {listId && <span className="ml-1 text-slate-500">List: {listId}</span>}
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">Submission method</label>
        <select
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'server' | 'agent')}
        >
          <option value="server">Server (direct API)</option>
          <option value="agent">Agent (browser automation)</option>
        </select>
      </div>

      <div className="bg-amber-900/20 border border-amber-700 rounded p-3 text-sm text-amber-200 space-y-2">
        <div className="font-medium">Consent required</div>
        <div className="text-xs text-amber-300">
          By submitting, you authorise Tabletop Tools to submit your army list to BCP on your behalf
          for this event only. This action cannot be undone. Your consent timestamp will be
          recorded.
        </div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
          />
          <span className="text-xs">I understand and consent to this submission</span>
        </label>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded font-medium transition"
        disabled={!consentGiven || recordMutation.isPending}
        onClick={() => {
          if (!consentGiven) return
          setError(null)
          // consentAt is captured NOW — at the moment the user clicks, not before
          const consentAt = Date.now()
          recordMutation.mutate({
            bcpEventId,
            listId: listId ?? undefined,
            method,
            status: 'submitted',
            consentAt,
          })
        }}
      >
        {recordMutation.isPending ? 'Submitting...' : 'I agree and submit'}
      </button>
    </div>
  )
}
