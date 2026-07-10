import JSZip from 'jszip'
import { useState } from 'react'

import { trpc } from '../lib/trpc'

type Props = {
  diceSetId: string
  onBack: () => void
}

type Tab = 'examples' | 'frames'

export function TrainingHistory({ diceSetId, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('examples')
  const [labelFilter, setLabelFilter] = useState<number | undefined>(undefined)
  const [exporting, setExporting] = useState(false)

  // training.list is always scoped to the caller's own data server-side now
  // (no myOnly opt-in) -- see apps/no-cheat/server/src/routers/training.ts.
  const { data, isLoading, refetch } = trpc.training.list.useQuery({
    diceSetId,
    label: labelFilter,
    limit: 50,
  })

  const { data: stats } = trpc.training.getStats.useQuery({ diceSetId })
  const deleteMutation = trpc.training.delete.useMutation({
    onSuccess: () => refetch(),
  })

  const {
    data: framesData,
    isLoading: framesLoading,
    refetch: refetchFrames,
  } = trpc.training.listFrames.useQuery({
    diceSetId,
    limit: 100,
  })

  const deleteFrameMutation = trpc.training.deleteFrame.useMutation({
    onSuccess: () => refetchFrames(),
  })

  const examples = data?.examples ?? []
  const frames = framesData?.frames ?? []

  async function handleExportDataset() {
    setExporting(true)
    try {
      const zip = new JSZip()
      const imgFolder = zip.folder('images/train')!
      const lblFolder = zip.folder('labels/train')!

      // Fetch all frames for this dice set
      // Use the already-loaded frames data + export endpoint for YOLO format
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]!
        const fileName = `frame_${String(i).padStart(5, '0')}`

        // Download the image
        const response = await fetch(frame.imageUrl)
        const blob = await response.blob()
        imgFolder.file(`${fileName}.png`, blob)

        // Generate YOLO label file
        // YOLO format: class_id cx cy w h (normalized 0-1)
        const lines = frame.boxes.map(
          (b: { x: number; y: number; w: number; h: number; label: number }) => {
            const classId = b.label - 1 // pip 1 → class 0
            return `${classId} ${b.x.toFixed(6)} ${b.y.toFixed(6)} ${b.w.toFixed(6)} ${b.h.toFixed(6)}`
          },
        )
        lblFolder.file(`${fileName}.txt`, lines.join('\n'))
      }

      // Generate data.yaml
      const dataYaml = [
        'path: .',
        'train: images/train',
        'val: images/train',
        '',
        'names:',
        '  0: "1"',
        '  1: "2"',
        '  2: "3"',
        '  3: "4"',
        '  4: "5"',
        '  5: "6"',
      ].join('\n')
      zip.file('data.yaml', dataYaml)

      // Download
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `dice-dataset-${diceSetId.slice(0, 8)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-slate-200 text-sm"
            aria-label="Back"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-slate-100">Training History</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setTab('examples')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'examples'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Examples
          </button>
          <button
            onClick={() => setTab('frames')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'frames'
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Frames ({frames.length})
          </button>
        </div>

        {tab === 'examples' && (
          <>
            {/* Stats summary */}
            {stats && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total examples</span>
                  <span className="text-slate-100 font-mono font-bold">{stats.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Accuracy</span>
                  <span className="text-slate-100 font-mono font-bold">
                    {stats.total > 0 ? (stats.accuracy * 100).toFixed(1) + '%' : '—'}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1 pt-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((pip) => (
                    <div
                      key={pip}
                      className="flex flex-col items-center bg-slate-800 rounded px-1 py-1"
                    >
                      <span className="text-slate-400 text-xs">{pip === 0 ? 'X' : pip}</span>
                      <span className="text-slate-100 font-mono text-xs font-bold">
                        {stats.perLabel[pip] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {[undefined, 0, 1, 2, 3, 4, 5, 6].map((pip) => (
                <button
                  key={pip ?? 'all'}
                  onClick={() => setLabelFilter(pip)}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                    labelFilter === pip
                      ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {pip === undefined ? 'All' : pip === 0 ? 'Not dice' : `${pip}`}
                </button>
              ))}
            </div>

            {/* Example list */}
            {isLoading && <p className="text-slate-400 text-sm text-center">Loading...</p>}

            {!isLoading && examples.length === 0 && (
              <p className="text-slate-400 text-sm text-center">No training examples found</p>
            )}

            <div className="space-y-2">
              {examples.map((ex) => (
                <div
                  key={ex.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3"
                >
                  {/* Image thumbnail */}
                  {ex.imageUrl && (
                    <img
                      src={ex.imageUrl}
                      alt={`Label ${ex.label}`}
                      className="w-12 h-12 rounded bg-slate-800 object-cover"
                    />
                  )}
                  {!ex.imageUrl && (
                    <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center text-slate-500 text-xs">
                      —
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold ${ex.label === 0 ? 'text-red-400' : 'text-slate-100'}`}
                      >
                        {ex.label === 0 ? 'Not a die' : `Label: ${ex.label}`}
                      </span>
                      {ex.guess != null && ex.label > 0 && (
                        <span
                          className={`text-xs ${ex.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {ex.isCorrect ? '✓' : `guess: ${ex.guess}`}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(ex.createdAt).toLocaleDateString()}
                      {ex.confidence != null && ` · conf: ${(ex.confidence * 100).toFixed(0)}%`}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteMutation.mutate({ id: ex.id })}
                    className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1"
                    disabled={deleteMutation.isPending}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'frames' && (
          <>
            {/* Export button */}
            {frames.length > 0 && (
              <button
                onClick={handleExportDataset}
                disabled={exporting}
                className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : `Export YOLO Dataset (${frames.length} frames)`}
              </button>
            )}

            {framesLoading && (
              <p className="text-slate-400 text-sm text-center">Loading frames...</p>
            )}

            {!framesLoading && frames.length === 0 && (
              <p className="text-slate-400 text-sm text-center">
                No training frames captured yet. Frames are saved automatically when you confirm
                dice during a session.
              </p>
            )}

            <div className="space-y-2">
              {frames.map((frame) => (
                <div
                  key={frame.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3"
                >
                  <img
                    src={frame.imageUrl}
                    alt={`Frame ${frame.id.slice(0, 8)}`}
                    className="w-16 h-12 rounded bg-slate-800 object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-100">
                        {frame.boxes.length} {frame.boxes.length === 1 ? 'die' : 'dice'}
                      </span>
                      <span className="text-xs text-slate-400">
                        [{frame.boxes.map((b: { label: number }) => b.label).join(', ')}]
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {frame.frameWidth}×{frame.frameHeight} ·{' '}
                      {new Date(frame.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteFrameMutation.mutate({ id: frame.id })}
                    className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1"
                    disabled={deleteFrameMutation.isPending}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
