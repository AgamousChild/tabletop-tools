import { useState } from 'react'

import { trpc } from '../lib/trpc'

type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'llm_unsure' | 'overridden'

export function CrosswalkPage() {
  const [statusFilter, setStatusFilter] = useState<CandidateStatus>('pending')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [llmBatchSize, setLlmBatchSize] = useState<number>(50)
  const [confirmBulk, setConfirmBulk] = useState<'approve' | 'reject' | null>(null)

  const statsQuery = trpc.crosswalk.stats.useQuery()
  const listQuery = trpc.crosswalk.listPending.useQuery({
    status: statusFilter,
    source: sourceFilter || undefined,
    search: search || undefined,
    page: 1,
    pageSize: 50,
  })

  const refetchAll = () => {
    void statsQuery.refetch()
    void listQuery.refetch()
  }

  const approve = trpc.crosswalk.candidate.approve.useMutation({ onSuccess: refetchAll })
  const reject = trpc.crosswalk.candidate.reject.useMutation({ onSuccess: refetchAll })
  const approveBulk = trpc.crosswalk.candidate.approveBulk.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set())
      setConfirmBulk(null)
      refetchAll()
    },
  })
  const rejectBulk = trpc.crosswalk.candidate.rejectBulk.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set())
      setConfirmBulk(null)
      refetchAll()
    },
  })
  const runLlm = trpc.crosswalk.runLlmEvaluator.useMutation({ onSuccess: refetchAll })

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }
  const toggleSelectAll = () => {
    if (selectedIds.size === (listQuery.data?.items.length ?? 0)) setSelectedIds(new Set())
    else setSelectedIds(new Set((listQuery.data?.items ?? []).map((i) => i.candidateId)))
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Crosswalk Review</h2>
          <p className="text-xs text-slate-500">
            Pending re-key candidates from data-import + 11th-ingest. Approve / reject / override
            individual rows, or run the LLM evaluator on a batch.
          </p>
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-4 gap-3">
        {statsQuery.data && (
          <>
            <StatCard label="Pending" value={statsQuery.data.pending} />
            <StatCard label="LLM unsure" value={statsQuery.data.llmUnsure} />
            <StatCard label="Approved (7d)" value={statsQuery.data.approvedRecent} />
            <StatCard label="Rejected (7d)" value={statsQuery.data.rejectedRecent} />
          </>
        )}
      </section>

      {/* LLM evaluator runner */}
      <section className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <label className="text-xs text-slate-400">LLM batch size:</label>
        <input
          type="number"
          min={1}
          max={200}
          value={llmBatchSize}
          onChange={(e) =>
            setLlmBatchSize(Math.max(1, Math.min(200, Number(e.target.value) || 50)))
          }
          className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100"
        />
        <button
          onClick={() => runLlm.mutate({ batchSize: llmBatchSize })}
          disabled={runLlm.isPending}
          className="text-sm px-3 py-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-50"
        >
          {runLlm.isPending ? 'Running…' : 'Run LLM evaluator'}
        </button>
        {runLlm.data && (
          <span className="text-xs text-slate-400 ml-2">
            ✓ approved {runLlm.data.approvedByLlm} · ✗ rejected {runLlm.data.rejectedByLlm} · ?
            unsure {runLlm.data.llmUnsureCount}
            {runLlm.data.errors.length > 0 ? ` · ⚠ errors ${runLlm.data.errors.length}` : ''}
          </span>
        )}
        {runLlm.error && <span className="text-xs text-red-400 ml-2">{runLlm.error.message}</span>}
      </section>

      {/* Filters */}
      <section className="flex items-center gap-3 text-sm">
        <label className="text-xs text-slate-400">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CandidateStatus)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        >
          <option value="pending">pending</option>
          <option value="llm_unsure">llm_unsure</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="overridden">overridden</option>
        </select>
        <label className="text-xs text-slate-400">Source:</label>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        >
          <option value="">all</option>
          {statsQuery.data?.bySource.map((s) => (
            <option key={s.source} value={s.source}>
              {s.source}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="search brain_node / proposed id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
      </section>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <section className="flex items-center gap-3 bg-amber-950 border border-amber-800 rounded-lg p-3">
          <span className="text-sm text-amber-300">{selectedIds.size} selected</span>
          <button
            onClick={() => setConfirmBulk('approve')}
            className="text-sm px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
          >
            ✓ Approve selected
          </button>
          <button
            onClick={() => setConfirmBulk('reject')}
            className="text-sm px-3 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
          >
            ✗ Reject selected
          </button>
        </section>
      )}

      {/* Confirmation modal for bulk */}
      {confirmBulk && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-100 mb-2">
              Confirm bulk {confirmBulk}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              You're about to {confirmBulk} {selectedIds.size} candidates. This is irreversible
              (approved candidates write to content_node_link; rejected candidates are permanent
              unless overridden).
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmBulk(null)}
                className="text-sm px-3 py-1 rounded text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const ids = Array.from(selectedIds)
                  if (confirmBulk === 'approve')
                    approveBulk.mutate({ candidateIds: ids, confirm: true })
                  else rejectBulk.mutate({ candidateIds: ids, confirm: true })
                }}
                className={`text-sm px-3 py-1 rounded ${
                  confirmBulk === 'approve'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/20 text-red-300'
                }`}
              >
                Confirm {confirmBulk}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending table */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {listQuery.isLoading && <p className="p-4 text-slate-400">Loading…</p>}
        {listQuery.error && <p className="p-4 text-red-400">Error: {listQuery.error.message}</p>}
        {listQuery.data && listQuery.data.items.length === 0 && (
          <p className="p-4 text-slate-400">
            No candidates with status &quot;{statusFilter}&quot;.
          </p>
        )}
        {listQuery.data && listQuery.data.items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={
                      listQuery.data.items.length > 0 &&
                      selectedIds.size === listQuery.data.items.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left px-3 py-2 text-slate-400 font-medium">Brain node</th>
                <th className="text-left px-3 py-2 text-slate-400 font-medium">
                  Current → Proposed
                </th>
                <th className="text-left px-3 py-2 text-slate-400 font-medium">Match</th>
                <th className="text-left px-3 py-2 text-slate-400 font-medium">Source</th>
                <th className="text-right px-3 py-2 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.items.map((c) => (
                <tr
                  key={c.candidateId}
                  className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.candidateId)}
                      onChange={() => toggleSelect(c.candidateId)}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-100">
                    <button
                      onClick={() => setOpenCandidateId(c.candidateId)}
                      className="underline text-amber-300 hover:text-amber-200 text-left"
                    >
                      {c.brainNodeId}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-300 text-xs">
                    {c.priorCanonicalId ?? '(new)'} → {c.proposedCanonicalId}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">
                    {c.matchMethod} · {(c.confidence ?? 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{c.source}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    {statusFilter === 'pending' || statusFilter === 'llm_unsure' ? (
                      <>
                        <button
                          onClick={() => approve.mutate({ candidateId: c.candidateId })}
                          disabled={approve.isPending}
                          className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => reject.mutate({ candidateId: c.candidateId })}
                          disabled={reject.isPending}
                          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                        >
                          ✗
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">{c.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Candidate detail modal */}
      {openCandidateId && (
        <CandidateDetail
          candidateId={openCandidateId}
          onClose={() => setOpenCandidateId(null)}
          onDecided={() => {
            setOpenCandidateId(null)
            refetchAll()
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  )
}

function CandidateDetail({
  candidateId,
  onClose,
  onDecided,
}: {
  candidateId: string
  onClose: () => void
  onDecided: () => void
}) {
  const detail = trpc.crosswalk.candidate.byId.useQuery({ candidateId })
  const approve = trpc.crosswalk.candidate.approve.useMutation({ onSuccess: onDecided })
  const reject = trpc.crosswalk.candidate.reject.useMutation({ onSuccess: onDecided })
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Candidate {candidateId}</h3>
            {detail.data?.candidate && (
              <p className="text-xs text-slate-500">
                {detail.data.candidate.source} · run {detail.data.candidate.runId}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        {detail.isLoading && <p className="text-slate-400">Loading…</p>}
        {detail.error && <p className="text-red-400">{detail.error.message}</p>}

        {detail.data && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <EntityBlock title="Current link" entity={detail.data.currentEntity} />
              <EntityBlock title="Proposed link" entity={detail.data.proposedEntity} />
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Match: {detail.data.candidate.matchMethod} · confidence{' '}
              {(detail.data.candidate.confidence ?? 0).toFixed(2)}
            </p>
            <label className="block text-xs text-slate-400 mb-1">Note (optional):</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 mb-4"
              placeholder="reasoning for this decision"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => reject.mutate({ candidateId, note: note || undefined })}
                disabled={reject.isPending}
                className="text-sm px-3 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
              >
                ✗ Reject
              </button>
              <button
                onClick={() => approve.mutate({ candidateId, note: note || undefined })}
                disabled={approve.isPending}
                className="text-sm px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                ✓ Approve
              </button>
            </div>
            {(approve.error || reject.error) && (
              <p className="text-xs text-red-400 mt-2">
                {approve.error?.message ?? reject.error?.message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface EntityDisplay {
  id: string
  type: string
  name: string
  factionId?: string | null
  dataslateName?: string | null
}

function EntityBlock({
  title,
  entity,
}: {
  title: string
  entity: EntityDisplay | null | undefined
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded p-3">
      <div className="text-xs text-slate-400 mb-2">{title}</div>
      {entity ? (
        <>
          <div className="text-sm text-slate-100 font-medium">{entity.name}</div>
          <div className="text-xs text-slate-500 mt-1">id: {entity.id}</div>
          <div className="text-xs text-slate-500">type: {entity.type}</div>
          {entity.factionId && (
            <div className="text-xs text-slate-500">faction: {entity.factionId}</div>
          )}
          {entity.dataslateName && (
            <div className="text-xs text-slate-500">dataslate: {entity.dataslateName}</div>
          )}
        </>
      ) : (
        <div className="text-sm text-slate-500 italic">(none)</div>
      )}
    </div>
  )
}
