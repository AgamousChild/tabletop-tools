import { useState } from 'react'

import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'
import { ActiveSessionScreen } from './ActiveSessionScreen'
import { CreateDiceSetForm } from './CreateDiceSetForm'
import { DiceSetList } from './DiceSetList'

type Props = {
  onSignOut: () => void
}

type DiceSet = { id: string; name: string }

export function DiceSetScreen({ onSignOut }: Props) {
  const [activeDiceSet, setActiveDiceSet] = useState<DiceSet | null>(null)
  const { data: diceSets = [], refetch } = trpc.diceSet.list.useQuery()
  const createMutation = trpc.diceSet.create.useMutation({
    onSuccess: () => refetch(),
  })

  if (activeDiceSet) {
    return <ActiveSessionScreen diceSet={activeDiceSet} onDone={() => setActiveDiceSet(null)} />
  }

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-amber-400">NoCheat</h1>
          <button
            onClick={handleSignOut}
            className="text-slate-400 hover:text-slate-100 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>

        <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-3">
          Your Dice Sets
        </h2>

        <DiceSetList diceSets={diceSets} onSelect={(ds) => setActiveDiceSet(ds)} />

        <div className="mt-6">
          <CreateDiceSetForm onCreate={(name) => createMutation.mutate({ name })} />
          {createMutation.error && (
            <p className="text-red-400 text-sm mt-2">{createMutation.error.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
