import { useState } from 'react'

type Props = {
  onCreate: (name: string) => void
}

export function CreateDiceSetForm({ onCreate }: Props) {
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dice set name"
        className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
      />
      <button
        type="submit"
        className="px-4 py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors"
      >
        Create
      </button>
    </form>
  )
}
