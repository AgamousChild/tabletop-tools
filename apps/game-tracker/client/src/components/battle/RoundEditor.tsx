import { useState } from 'react'

type TurnFields = {
  id: string
  turnNumber: number
  yourPrimary?: number
  theirPrimary?: number
  yourCpGained?: number
  theirCpGained?: number
  yourCpSpent?: number
  theirCpSpent?: number
  primaryScored?: number
  secondaryScored?: number
  cpSpent?: number
  notes?: string | null
}

type UpdateData = {
  yourPrimary: number
  theirPrimary: number
  yourCpGained: number
  theirCpGained: number
  notes: string
}

type Props = {
  turn: TurnFields
  onSave: (data: UpdateData) => void
  onCancel: () => void
  isSaving: boolean
}

export function RoundEditor({ turn, onSave, onCancel, isSaving }: Props) {
  const [yourPrimary, setYourPrimary] = useState(turn.yourPrimary ?? turn.primaryScored ?? 0)
  const [theirPrimary, setTheirPrimary] = useState(turn.theirPrimary ?? 0)
  const [yourCpGained, setYourCpGained] = useState(turn.yourCpGained ?? 1)
  const [theirCpGained, setTheirCpGained] = useState(turn.theirCpGained ?? 1)
  const [notes, setNotes] = useState(turn.notes ?? '')

  return (
    <div className="p-3 rounded-lg bg-slate-900 border border-amber-400/50 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-amber-400">Editing Round {turn.turnNumber}</h4>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Your Primary VP</label>
          <input
            type="number"
            min={0}
            value={yourPrimary}
            onChange={(e) => setYourPrimary(Number(e.target.value) || 0)}
            aria-label="Your Primary VP"
            className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm text-center focus:outline-none focus:border-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Their Primary VP</label>
          <input
            type="number"
            min={0}
            value={theirPrimary}
            onChange={(e) => setTheirPrimary(Number(e.target.value) || 0)}
            aria-label="Their Primary VP"
            className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm text-center focus:outline-none focus:border-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Your CP Gained</label>
          <input
            type="number"
            min={0}
            value={yourCpGained}
            onChange={(e) => setYourCpGained(Number(e.target.value) || 0)}
            aria-label="Your CP Gained"
            className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm text-center focus:outline-none focus:border-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Their CP Gained</label>
          <input
            type="number"
            min={0}
            value={theirCpGained}
            onChange={(e) => setTheirCpGained(Number(e.target.value) || 0)}
            aria-label="Their CP Gained"
            className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm text-center focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Round notes..."
          aria-label="Notes"
          className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave({ yourPrimary, theirPrimary, yourCpGained, theirCpGained, notes })}
          disabled={isSaving}
          className="flex-1 py-2 rounded-lg bg-amber-400 text-slate-950 font-bold text-sm hover:bg-amber-300 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
