import { useState } from 'react'

type Props = {
  onRecord: (pipValues: number[]) => void
}

export function RollEntry({ onRecord }: Props) {
  const [values, setValues] = useState<number[]>([])

  function handlePip(pip: number) {
    setValues((prev) => [...prev, pip])
  }

  function handleUndo() {
    setValues((prev) => prev.slice(0, -1))
  }

  function handleRecord() {
    if (values.length === 0) return
    onRecord(values)
    setValues([])
  }

  return (
    <div className="space-y-4">
      {/* Die value buttons */}
      <div className="grid grid-cols-6 gap-2">
        {[1, 2, 3, 4, 5, 6].map((pip) => (
          <button
            key={pip}
            onClick={() => handlePip(pip)}
            className="aspect-square rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xl font-bold hover:bg-slate-700 hover:border-amber-400 active:bg-slate-600 transition-colors"
          >
            {pip}
          </button>
        ))}
      </div>

      {/* Entered values */}
      <div className="min-h-10 flex flex-wrap gap-2 items-center">
        {values.length === 0 ? (
          <p className="text-slate-500 text-sm">Tap each die value above</p>
        ) : (
          values.map((v, i) => (
            <span
              key={i}
              className="w-8 h-8 flex items-center justify-center rounded bg-slate-700 text-slate-100 font-semibold text-sm"
            >
              {v}
            </span>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleUndo}
          disabled={values.length === 0}
          className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 transition-colors text-sm disabled:opacity-30"
        >
          Undo
        </button>
        <button
          onClick={handleRecord}
          disabled={values.length === 0}
          className="flex-1 py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors disabled:opacity-30"
        >
          Record Roll
        </button>
      </div>
    </div>
  )
}
